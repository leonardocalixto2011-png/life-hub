/**
 * Seed: the venture list + one ADMIN user (from ADMIN_EMAIL / ADMIN_NAME).
 * Idempotent — safe to re-run. Add the other people from inside the app later,
 * or extend the `people` array below.
 *
 *   npm run db:seed
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const VENTURES = [
  { slug: "cmac-beauty", name: "CMAC Beauty", color: "#c97b63" },
  { slug: "cmac-services", name: "CMAC Services", color: "#4a5d4e" },
  { slug: "couca", name: "Couca & Co.", color: "#b07d9e" },
  { slug: "school", name: "School", color: "#3b82f6" },
  { slug: "personal", name: "Personal", color: "#6366f1" },
];

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const adminName = process.env.ADMIN_NAME?.trim() || "Admin";

  if (!adminEmail) {
    console.warn("⚠ ADMIN_EMAIL not set — no admin user or hub seeded.");
    return;
  }

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: "ADMIN", name: adminName },
    create: { email: adminEmail, name: adminName, role: "ADMIN" },
  });
  console.log(`✔ admin user ${adminEmail}`);

  // Teammates. NOTE: one email == one account (User.email is unique). Dan cannot
  // reuse ADMIN_EMAIL — add him with his own address.
  const people: { email: string; name: string; role: "ADMIN" | "MEMBER" }[] = [
    { email: "chantelleanderson.cma@gmail.com", name: "Chantelle", role: "MEMBER" },
    { email: "leonardocalixto2011@gmail.com", name: "Dan", role: "MEMBER" },
  ];
  const memberUsers = [];
  for (const p of people) {
    const email = p.email.toLowerCase();
    if (email === adminEmail) {
      console.warn(`⚠ skipped ${p.name}: same email as the admin account`);
      continue;
    }
    const user = await prisma.user.upsert({
      where: { email },
      update: { name: p.name, role: p.role },
      create: { email, name: p.name, role: p.role },
    });
    memberUsers.push(user);
    console.log(`✔ member ${email}`);
  }

  // Fresh install: find-or-create the default hub. On an existing prod DB this
  // is a no-op (prisma/backfill-hubs.ts already created one and aborts if it
  // finds a hub, so running this seed afterward is harmless either order).
  let hub = await prisma.hub.findFirst({ orderBy: { createdAt: "asc" } });
  if (!hub) {
    hub = await prisma.hub.create({ data: { name: "Main Hub", createdById: admin.id } });
    console.log(`✔ created hub "${hub.name}"`);
  }

  for (const u of [admin, ...memberUsers]) {
    await prisma.hubMembership.upsert({
      where: { hubId_userId: { hubId: hub.id, userId: u.id } },
      update: {},
      create: {
        hubId: hub.id,
        userId: u.id,
        role: u.id === admin.id ? "OWNER" : "MEMBER",
        status: "ACTIVE",
        joinedAt: new Date(),
      },
    });
  }
  console.log(`✔ hub memberships ensured for ${1 + memberUsers.length} user(s)`);

  for (const [i, v] of VENTURES.entries()) {
    await prisma.venture.upsert({
      where: { hubId_slug: { hubId: hub.id, slug: v.slug } },
      update: { name: v.name, color: v.color, sortOrder: i },
      create: { ...v, sortOrder: i, hubId: hub.id },
    });
  }
  console.log(`✔ ${VENTURES.length} ventures`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
