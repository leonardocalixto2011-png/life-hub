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

  // Teammates. NOTE: one email == one account (User.email is unique). Dan cannot
  // reuse ADMIN_EMAIL — add him with his own address.
  const people: { email: string; name: string; role: "ADMIN" | "MEMBER" }[] = [
    { email: "chantelleanderson.cma@gmail.com", name: "Chantelle", role: "MEMBER" },
    // { email: "dan@his-own-address.com", name: "Dan", role: "MEMBER" },
  ];
  for (const p of people) {
    const email = p.email.toLowerCase();
    if (email === adminEmail) {
      console.warn(`⚠ skipped ${p.name}: same email as the admin account`);
      continue;
    }
    await prisma.user.upsert({
      where: { email },
      update: { name: p.name, role: p.role },
      create: { email, name: p.name, role: p.role },
    });
    console.log(`✔ member ${email}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
