/**
 * Seeds a person's real financial picture into a PRIVATE, single-member hub.
 *
 *   SEED_FINANCES=yes ADMIN_EMAIL=you@example.com npx tsx prisma/seed-finances.ts
 *
 * The figures live in `prisma/finances.local.json`, which is **gitignored**
 * (`*.local.json`) — this repository is public, so balances, creditors and
 * income must never be committed. See `finances.example.json` for the shape.
 *
 * Why a separate hub: `Debt` has no per-item privacy flag, unlike Task /
 * Deadline / Event which have `Visibility`. Debts are hub-scoped, so every
 * member of a hub sees them on /debts *and* receives them in their daily
 * digest. A single-member hub is the only way to keep them personal.
 *
 * Idempotent: rows are matched by name, so re-running updates rather than
 * duplicating. Aborts if the target hub has gained other members.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type DebtSeed = {
  name: string;
  balance: number;
  apr: number | null;
  /** Contractual minimum, where one is stated. */
  minimum: number | null;
  /** What's actually being paid, when it differs (negotiated / hardship). */
  actual: number | null;
  status: "CURRENT" | "DEFAULT" | "PAID_OFF";
  notes: string;
};

type Finances = {
  hubName: string;
  hubColor?: string;
  monthlyNetIncome: number;
  incomeNote: string;
  debts: DebtSeed[];
  /** Recurring monthly costs — rent, insurance, utilities, savings clubs. */
  commitments: { name: string; cost: number; notes: string }[];
};

/** dollars -> cents, avoiding float drift (1234.56 * 100 = 123455.99…). */
const c = (dollars: number) => Math.round(dollars * 100);
/** percent -> basis points. 26.99 -> 2699. */
const bp = (percent: number) => Math.round(percent * 100);

function load(): Finances {
  const path = join(process.cwd(), "prisma", "finances.local.json");
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Finances;
  } catch {
    console.error(
      `Could not read ${path}.\nCopy prisma/finances.example.json to prisma/finances.local.json and fill in your figures.`,
    );
    process.exit(1);
  }
}

async function main() {
  if (process.env.SEED_FINANCES !== "yes") {
    console.error("Refusing to run without SEED_FINANCES=yes — this writes real financial data.");
    process.exit(1);
  }

  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (!email) {
    console.error("ADMIN_EMAIL is not set.");
    process.exit(1);
  }

  const fin = load();

  const owner = await prisma.user.findUnique({ where: { email } });
  if (!owner) {
    console.error(`No user with email ${email}. Run \`npm run db:seed\` first.`);
    process.exit(1);
  }

  // --- private hub ---------------------------------------------------------
  let hub = await prisma.hub.findFirst({
    where: { name: fin.hubName, createdById: owner.id },
  });
  if (!hub) {
    hub = await prisma.hub.create({
      data: { name: fin.hubName, color: fin.hubColor ?? "#0f766e", createdById: owner.id },
    });
    console.log(`✔ created private hub "${fin.hubName}"`);
  } else {
    console.log(`· hub "${fin.hubName}" already exists`);
  }

  await prisma.hubMembership.upsert({
    where: { hubId_userId: { hubId: hub.id, userId: owner.id } },
    update: { role: "OWNER", status: "ACTIVE" },
    create: {
      hubId: hub.id,
      userId: owner.id,
      role: "OWNER",
      status: "ACTIVE",
      joinedAt: new Date(),
    },
  });

  const otherMembers = await prisma.hubMembership.count({
    where: { hubId: hub.id, userId: { not: owner.id } },
  });
  if (otherMembers > 0) {
    console.error(
      `✖ ABORTING: "${fin.hubName}" has ${otherMembers} other member(s). This hub is meant to be private; remove them before seeding.`,
    );
    process.exit(1);
  }

  // --- debts ---------------------------------------------------------------
  for (const d of fin.debts) {
    const data = {
      balanceCents: c(d.balance),
      aprBasisPoints: d.apr == null ? null : bp(d.apr),
      minimumPaymentCents: d.minimum == null ? null : c(d.minimum),
      actualPaymentCents: d.actual == null ? null : c(d.actual),
      status: d.status,
      notes: d.notes || null,
      ownerId: owner.id,
    };
    const existing = await prisma.debt.findFirst({ where: { hubId: hub.id, name: d.name } });
    if (existing) {
      await prisma.debt.update({ where: { id: existing.id }, data });
    } else {
      await prisma.debt.create({ data: { ...data, name: d.name, hubId: hub.id } });
    }
  }
  console.log(`✔ ${fin.debts.length} debts`);

  // --- recurring commitments ----------------------------------------------
  // renewalDate is required by the schema, but real dates aren't part of the
  // input — everything gets the 1st of next month as an obvious placeholder.
  const now = new Date();
  const placeholderRenewal = new Date(now.getFullYear(), now.getMonth() + 1, 1, 12, 0, 0);

  for (const s of fin.commitments) {
    const existing = await prisma.subscription.findFirst({
      where: { hubId: hub.id, name: s.name },
    });
    const data = {
      costCents: c(s.cost),
      billingCycle: "MONTHLY" as const,
      notes: [s.notes, "Renewal date is a placeholder — set the real one."]
        .filter(Boolean)
        .join(" "),
      ownerId: owner.id,
    };
    if (existing) {
      await prisma.subscription.update({ where: { id: existing.id }, data });
    } else {
      await prisma.subscription.create({
        data: { ...data, name: s.name, hubId: hub.id, renewalDate: placeholderRenewal },
      });
    }
  }
  console.log(`✔ ${fin.commitments.length} recurring commitments`);

  // --- income --------------------------------------------------------------
  // Deliberately the only BudgetEntry seeded: an entry asserts "this
  // transaction happened", and the commitments above haven't been paid yet
  // this month. Log real spending as it happens.
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0);
  const existingIncome = await prisma.budgetEntry.findFirst({
    where: { hubId: hub.id, type: "INCOME", category: "Salary", date: firstOfMonth },
  });
  if (!existingIncome) {
    await prisma.budgetEntry.create({
      data: {
        hubId: hub.id,
        type: "INCOME",
        amountCents: c(fin.monthlyNetIncome),
        category: "Salary",
        description: fin.incomeNote,
        date: firstOfMonth,
        createdById: owner.id,
      },
    });
    console.log("✔ 1 income entry");
  } else {
    console.log("· income entry for this month already exists");
  }

  // --- summary -------------------------------------------------------------
  const debtTotal = fin.debts.reduce((n, d) => n + d.balance, 0);
  const debtMonthly = fin.debts.reduce((n, d) => n + (d.actual ?? d.minimum ?? 0), 0);
  const commitMonthly = fin.commitments.reduce((n, s) => n + s.cost, 0);

  console.log("");
  console.log(`  hub               ${fin.hubName} (private, owner only)`);
  console.log(`  debt balance      $${debtTotal.toFixed(2)}`);
  console.log(`  debt payments     $${debtMonthly.toFixed(2)}/mo`);
  console.log(`  commitments       $${commitMonthly.toFixed(2)}/mo`);
  console.log(`  total outgoings   $${(debtMonthly + commitMonthly).toFixed(2)}/mo`);
  console.log(`  stated net income $${fin.monthlyNetIncome.toFixed(2)}/mo`);
  console.log(
    `  gap               $${(fin.monthlyNetIncome - debtMonthly - commitMonthly).toFixed(2)}/mo`,
  );
  console.log("");
  console.log("  Next: set real due dates on the debts (none are supplied, so they");
  console.log("  won't show on /today or /agenda until you do), and real renewal");
  console.log("  dates on the commitments.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
