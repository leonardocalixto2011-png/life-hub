/**
 * Loads the March 2027 Thailand + Vietnam trip plan into a hub: the trip with
 * its budget, the booking / to-do / packing checklist, and dated deadlines for
 * every savings deposit and booking step, so the digest and push reminders
 * walk you through it month by month.
 *
 *   SEED_TRIP=yes ADMIN_EMAIL=you@example.com HUB_NAME="Your hub" npm run db:seed-trip
 *
 * HUB_NAME may be left out when you belong to exactly one active hub.
 *
 * Nothing personal is in here, only the plan itself: public prices and
 * dates. Idempotent: a trip with the same title in that hub means it has
 * already run, and nothing is written.
 */
import { PrismaClient, type TripItemKind } from "@prisma/client";

const prisma = new PrismaClient();

const TITLE = "Thailand + Vietnam";

/** dollars -> cents, avoiding float drift. */
const c = (dollars: number) => Math.round(dollars * 100);
/** Date-only fields are stored at local noon, like the rest of the app. */
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0, 0);

const ITEMS: { kind: TripItemKind; title: string; cost?: number }[] = [
  { kind: "BOOK", title: "Long-haul flights YUL → BKK, back from DAD (≤ $1,300 each)", cost: 2600 },
  { kind: "BOOK", title: "Travel insurance (check credit card first)", cost: 230 },
  { kind: "BOOK", title: "Bangkok hotel, 3 nights (Mar 12–15)", cost: 390 },
  { kind: "BOOK", title: "Railay / Ao Nang hotel, 4 nights (Mar 15–19)", cost: 600 },
  { kind: "BOOK", title: "Hoi An hotel, 3 nights (Mar 19–22)", cost: 360 },
  { kind: "BOOK", title: "Flight Bangkok DMK → Krabi (Mon Mar 15)", cost: 150 },
  { kind: "BOOK", title: "Flights Krabi → Bangkok → Da Nang (Fri Mar 19)", cost: 300 },
  { kind: "BOOK", title: "Four-islands boat tour, Krabi (Tue Mar 16)" },
  { kind: "BOOK", title: "Car Da Nang airport → Hoi An (Fri Mar 19)" },
  { kind: "TODO", title: "Check passports valid until Sept 23, 2027" },
  { kind: "TODO", title: "Set Google Flights alerts YUL → BKK, Mar 11–22" },
  { kind: "TODO", title: "Open the trip savings account + automatic transfer" },
  { kind: "TODO", title: "Vietnam e-visas at evisa.gov.vn only (entry: Da Nang)", },
  { kind: "TODO", title: "Travel clinic: hep A, typhoid, mosquito protection" },
  { kind: "TODO", title: "eSIM for Thailand + Vietnam; tell the bank you're travelling" },
  { kind: "TODO", title: "TDAC arrival cards at tdac.immigration.go.th (Mar 9–11)" },
  { kind: "TODO", title: "About $100 in baht for the first night" },
  { kind: "PACK", title: "Temple clothes (shoulders + knees covered)" },
  { kind: "PACK", title: "Reef-safe sunscreen, insect repellent" },
  { kind: "PACK", title: "Water shoes for the islands" },
  { kind: "PACK", title: "Universal adapter + power bank" },
  { kind: "PACK", title: "Passports, printed e-visas, TDAC screenshots" },
  { kind: "PACK", title: "Room in the bag for Hoi An tailoring" },
];

/** Savings deposits for two: ahead of every payment, see the plan page. */
const SAVINGS: [Date, number][] = [
  [day(2026, 10, 1), 1450],
  [day(2026, 11, 1), 1450],
  [day(2026, 12, 1), 900],
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

  const memberships = await prisma.hubMembership.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    include: { hub: { select: { id: true, name: true } } },
  });
  const hubName = process.env.HUB_NAME?.trim();
  const matches = hubName ? memberships.filter((m) => m.hub.name === hubName) : memberships;
  if (matches.length !== 1) {
    console.error(
      hubName
        ? `No active hub named "${hubName}" for ${email}.`
        : `Set HUB_NAME — you're in ${memberships.length} hubs: ${memberships.map((m) => m.hub.name).join(", ")}`,
    );
    process.exit(1);
  }
  const hub = matches[0].hub;

  if (await prisma.trip.findFirst({ where: { hubId: hub.id, title: TITLE } })) {
    console.log(`· "${TITLE}" already exists in ${hub.name}; nothing written.`);
    return;
  }

  await prisma.$transaction(async (tx) => {
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
    await tx.tripItem.createMany({
      data: ITEMS.map((i) => ({
        tripId: trip.id,
        hubId: hub.id,
        kind: i.kind,
        title: i.title,
        costCents: i.cost == null ? null : c(i.cost),
      })),
    });
    await tx.deadline.createMany({
      data: [
        ...SAVINGS.map(([due, total]) => ({
          hubId: hub.id,
          title: `Put $${total.toLocaleString("en-CA")} aside for Thailand ($${(total / 2).toLocaleString("en-CA")} each)`,
          notes: "Then add it on the trip page under Savings.",
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

  console.log(`✔ "${TITLE}" in ${hub.name}: ${ITEMS.length} checklist items, ${SAVINGS.length + MILESTONES.length} deadlines`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
