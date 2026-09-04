/**
 * ONE-OFF migration script (not part of the idempotent seed.ts): creates a
 * single default hub, makes every existing User an ACTIVE member of it (the
 * ADMIN_EMAIL user as OWNER), and backfills hubId onto every existing row of
 * Venture/Task/Deadline/Subscription/BudgetEntry/Event.
 *
 * Safe to run only once — aborts if any Hub already exists.
 *
 *   npx tsx prisma/backfill-hubs.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.hub.count();
  if (existing > 0) {
    console.log(`⚠ ${existing} hub(s) already exist — nothing to backfill. Aborting.`);
    return;
  }

  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  if (!adminEmail) throw new Error("ADMIN_EMAIL is not set");

  const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) throw new Error(`No user found for ADMIN_EMAIL=${adminEmail}`);

  const others = await prisma.user.findMany({ where: { id: { not: admin.id } } });

  const hub = await prisma.hub.create({
    data: { name: "Main Hub", createdById: admin.id },
  });
  console.log(`✔ created hub "${hub.name}" (${hub.id})`);

  const now = new Date();
  await prisma.hubMembership.create({
    data: { hubId: hub.id, userId: admin.id, role: "OWNER", status: "ACTIVE", joinedAt: now },
  });
  console.log(`✔ membership: ${admin.email} — OWNER/ACTIVE`);

  for (const u of others) {
    await prisma.hubMembership.create({
      data: { hubId: hub.id, userId: u.id, role: "MEMBER", status: "ACTIVE", joinedAt: now },
    });
    console.log(`✔ membership: ${u.email} — MEMBER/ACTIVE`);
  }

  const tables = [
    prisma.venture,
    prisma.task,
    prisma.deadline,
    prisma.subscription,
    prisma.budgetEntry,
    prisma.event,
  ] as const;
  const names = ["Venture", "Task", "Deadline", "Subscription", "BudgetEntry", "Event"];

  for (let i = 0; i < tables.length; i++) {
    // @ts-expect-error -- every model here has hubId + updateMany
    const result = await tables[i].updateMany({
      where: { hubId: null },
      data: { hubId: hub.id },
    });
    console.log(`✔ backfilled ${result.count} ${names[i]} row(s)`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
