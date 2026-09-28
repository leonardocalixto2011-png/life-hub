/**
 * Loads the March 2027 Thailand + Vietnam trip plan into a hub: the trip with
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
 * the "Import a whole plan" form on the trip page. Idempotent: re-running adds only the plan items the trip is
 * missing, matched on kind + title.
 */
import { PrismaClient } from "@prisma/client";

import { missingPlanRows, planRows } from "../src/lib/trip-plan";
import { thailand2027 } from "../src/lib/trip-plans/thailand-2027";

const prisma = new PrismaClient();

const TITLE = "Thailand + Vietnam";

/** dollars -> cents, avoiding float drift. */
const c = (dollars: number) => Math.round(dollars * 100);
/** Date-only fields are stored at local noon, like the rest of the app. */
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0);


/** Savings deposits for two, top-ups included: ahead of every payment, see the plan page. */
const SAVINGS: [Date, number][] = [
  [day(2026, 10, 1), 1580],
  [day(2026, 11, 1), 1580],
  [day(2026, 12, 1), 1030],
  [day(2027, 1, 1), 900],
  [day(2027, 2, 1), 800],
  [day(2027, 3, 1), 800],
];

const MILESTONES: { due: Date; title: string; notes: string; remind?: number[] }[] = [
  {
    due: day(2026, 11, 30),
    title: "Book the Thailand flights (last good date)",
    notes: "YUL → BKK out Thu Mar 11, back from Da Nang Mon Mar 22. Aim for ≤ $1,300 each. Book earlier if an alert hits that.",
    remind: [21, 14, 7, 3, 1],
  },
  {
    due: day(2026, 12, 15),
    title: "Book the trip hotels (free cancellation)",
    notes: "Bangkok 3 nights, Railay/Ao Nang 4 nights, Hoi An 3 nights.",
  },
  {
    due: day(2027, 1, 31),
    title: "Book the regional flights (Krabi, Da Nang)",
    notes: "DMK → Krabi Mon Mar 15; Krabi → BKK → Da Nang Fri Mar 19. Add checked bags at booking.",
  },
  {
    due: day(2027, 2, 10),
    title: "Apply for the Vietnam e-visas",
    notes: "evisa.gov.vn only, about US$25 each, entry point Da Nang airport.",
  },
  {
    due: day(2027, 3, 9),
    title: "Submit the TDAC arrival cards",
    notes: "Free, at tdac.immigration.go.th, within 72h before landing. Screenshot the confirmation.",
    remind: [2, 1],
  },
];

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

  // Re-running adds only what the trip is missing (a newer version of the
  // plan, or a trip made by hand under the same title). Deadlines are written
  // once, with the trip.
  const existing = await prisma.trip.findFirst({
    where: { hubId: hub.id, title: TITLE },
    include: { items: { select: { kind: true, title: true } } },
  });
  if (existing) {
    const rows = missingPlanRows(thailand2027, existing.id, hub.id, existing.items);
    const hadPlan = existing.items.some((i) => i.kind === "STOP");
    await prisma.tripItem.createMany({ data: rows });
    console.log(`✔ "${TITLE}" in ${hub.name}: added ${rows.length} missing plan items`);
    if (hadPlan) return;
  }

  await prisma.$transaction(async (tx) => {
    if (!existing) {
      const trip = await tx.trip.create({
        data: {
          hubId: hub.id,
          title: TITLE,
          destination: "Bangkok · Krabi · Hoi An",
          startDate: day(2027, 3, 11),
          endDate: day(2027, 3, 22),
          budgetCents: c(6300),
          notes:
            "Bangkok 3 nights, Krabi/Railay 4 nights, Hoi An 3 nights. Budget is for two; keep about $500 extra for tailoring and extras.",
          createdById: user.id,
        },
      });
      await tx.tripItem.createMany({ data: planRows(thailand2027, trip.id, hub.id) });
    }
    await tx.deadline.createMany({
      data: [
        ...SAVINGS.map(([due, total]) => ({
          hubId: hub.id,
          title: `Put $${total.toLocaleString("en-CA")} aside for Thailand ($${(total / 2).toLocaleString("en-CA")} each)`,
          notes: "Then tick it in the trip's booking calendar.",
          dueDate: due,
          remindDaysBefore: [3, 1],
          createdById: user.id,
        })),
        ...MILESTONES.map((m) => ({
          hubId: hub.id,
          title: m.title,
          notes: m.notes,
          dueDate: m.due,
          remindDaysBefore: m.remind ?? [7, 3, 1],
          createdById: user.id,
        })),
      ],
    });
  });

  console.log(`✔ "${TITLE}" in ${hub.name}: ${thailand2027.stops.length} stops, ${thailand2027.items.length} plan items, ${SAVINGS.length + MILESTONES.length} reminders`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
