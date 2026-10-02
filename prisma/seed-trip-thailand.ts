/**
 * Loads the March 2027 one-week Thailand trip plan into a hub: the trip with
 * its itinerary and checklists, and dated deadlines for
 * every savings deposit and booking step, so the digest and push reminders
 * walk you through it month by month.
 *
 *   SEED_TRIP=yes ADMIN_EMAIL=you@example.com SHARE_WITH=partner@example.com npm run db:seed-trip
 *
 * SHARE_WITH puts the trip in the hub you both belong to, or creates one and
 * invites them. HUB_NAME picks a hub by name instead. With neither, you must
 * belong to exactly one active hub.
 *
 * The plan itself lives in src/lib/trip-plans/thailand-2027.ts, shared with
 * the "Import a whole plan" form on the trip page. Run once per hub: if the
 * trip is already there (under this title or the earlier "Thailand + Vietnam"
 * one), it stops and points you at Import, which updates a live trip
 * without touching what's been ticked.
 */
import { PrismaClient } from "@prisma/client";

import { noon, planRows } from "../src/lib/trip-plan";
import { thailand2027 } from "../src/lib/trip-plans/thailand-2027";

const prisma = new PrismaClient();

const plan = thailand2027;
const TITLE = plan.trip?.title ?? "Thailand";

/**
 * Where the trip goes, in order: HUB_NAME if given; else, with SHARE_WITH, a
 * hub you're both ACTIVE in; else a new "Thailand 2027" hub you own with that
 * person invited (they accept at /hubs/invites); else your only hub.
 */
async function pickHub(userId: string): Promise<{ id: string; name: string }> {
  const mine = await prisma.hubMembership.findMany({
    where: { userId, status: "ACTIVE" },
    include: { hub: { select: { id: true, name: true } } },
  });

  const hubName = process.env.HUB_NAME?.trim();
  if (hubName) {
    const m = mine.find((x) => x.hub.name === hubName);
    if (!m) fail(`No active hub named "${hubName}" for you.`);
    return m.hub;
  }

  const partnerEmail = process.env.SHARE_WITH?.toLowerCase().trim();
  if (partnerEmail) {
    const partner = await prisma.user.findUnique({ where: { email: partnerEmail } });
    if (partner) {
      const together = await prisma.hubMembership.findMany({
        where: { userId: partner.id, status: "ACTIVE", hubId: { in: mine.map((m) => m.hub.id) } },
        include: { hub: { select: { id: true, name: true } } },
      });
      if (together.length === 1) return together[0].hub;
      if (together.length > 1) {
        fail(`You share ${together.length} hubs with ${partnerEmail}: ${together.map((m) => m.hub.name).join(", ")}. Pick one with HUB_NAME.`);
      }
    }
    // No hub in common yet: make one and invite them, the same rows the
    // in-app invite writes (minus the email, so tell them yourself).
    return prisma.$transaction(async (tx) => {
      const hub = await tx.hub.create({
        data: { name: "Thailand 2027", color: "#0e6e70", createdById: userId },
      });
      await tx.hubMembership.create({
        data: { hubId: hub.id, userId, role: "OWNER", status: "ACTIVE", joinedAt: new Date() },
      });
      const target = await tx.user.upsert({
        where: { email: partnerEmail },
        update: {},
        create: { email: partnerEmail, role: "MEMBER" },
      });
      await tx.hubMembership.create({
        data: { hubId: hub.id, userId: target.id, role: "MEMBER", status: "INVITED" },
      });
      console.log(`✔ created hub "Thailand 2027" and invited ${partnerEmail}: they sign in and accept at /hubs/invites`);
      return { id: hub.id, name: hub.name };
    });
  }

  if (mine.length !== 1) {
    fail(`Set HUB_NAME or SHARE_WITH — you're in ${mine.length} hubs: ${mine.map((m) => m.hub.name).join(", ")}`);
  }
  return mine[0].hub;
}

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

async function main() {
  if (process.env.SEED_TRIP !== "yes") {
    console.error("Refusing to run without SEED_TRIP=yes.");
    process.exit(1);
  }
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (!email) {
    console.error("ADMIN_EMAIL is not set.");
    process.exit(1);
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user with email ${email}.`);
    process.exit(1);
  }

  const hub = await pickHub(user.id);

  const titles = [TITLE, ...(plan.previous ?? []).map((p) => p.title)].filter((t): t is string => !!t);
  const existing = await prisma.trip.findFirst({ where: { hubId: hub.id, title: { in: titles } } });
  if (existing) {
    console.log(`"${existing.title}" is already in ${hub.name}. Open it and use Import → the Thailand plan to update it.`);
    return;
  }

  const t = plan.trip!;
  await prisma.$transaction(async (tx) => {
    const trip = await tx.trip.create({
      data: {
        hubId: hub.id,
        title: TITLE,
        destination: t.destination ?? null,
        startDate: noon(t.start!),
        endDate: noon(t.end!),
        budgetCents: plan.budget != null ? Math.round(plan.budget * 100) : null,
        notes: t.notes ?? null,
        createdById: user.id,
      },
    });
    await tx.tripItem.createMany({ data: planRows(plan, trip.id, hub.id) });
    await tx.deadline.createMany({
      data: (plan.deadlines ?? []).map((d) => ({
        hubId: hub.id,
        title: d.title,
        notes: d.notes ?? null,
        dueDate: noon(d.due),
        remindDaysBefore: d.remind ?? [7, 3, 1],
        createdById: user.id,
        // So deleting the trip takes its reminders with it.
        tripId: trip.id,
      })),
    });
  });

  console.log(`✔ "${TITLE}" in ${hub.name}: ${plan.stops.length} stops, ${plan.items.length} plan items, ${plan.deadlines?.length ?? 0} reminders`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
