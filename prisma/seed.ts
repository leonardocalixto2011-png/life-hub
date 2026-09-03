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
  for (const [i, v] of VENTURES.entries()) {
    await prisma.venture.upsert({
      where: { slug: v.slug },
      update: { name: v.name, color: v.color, sortOrder: i },
      create: { ...v, sortOrder: i },
    });
  }
  console.log(`✔ ${VENTURES.length} ventures`);

  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const adminName = process.env.ADMIN_NAME?.trim() || "Admin";

  if (!adminEmail) {
    console.warn("⚠ ADMIN_EMAIL not set — no admin user seeded.");
  } else {
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: { role: "ADMIN", name: adminName },
      create: { email: adminEmail, name: adminName, role: "ADMIN" },
    });
    console.log(`✔ admin user ${adminEmail}`);
  }

  // Add teammates here once you have their emails, or invite them from the app:
  //   { email: "dan@example.com",       name: "Dan",       role: "MEMBER" },
  //   { email: "chantelle@example.com", name: "Chantelle", role: "MEMBER" },
  const people: { email: string; name: string; role: "ADMIN" | "MEMBER" }[] = [];
  for (const p of people) {
    await prisma.user.upsert({
      where: { email: p.email.toLowerCase() },
      update: { name: p.name, role: p.role },
      create: { email: p.email.toLowerCase(), name: p.name, role: p.role },
    });
    console.log(`✔ member ${p.email}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
