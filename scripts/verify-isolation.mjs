/**
 * Proves the multi-hub RLS policies actually isolate data:
 *   - a member of Hub A gets zero rows from Hub B, through any query path
 *   - a private item in Hub A is invisible to Hub A's OTHER active member
 *   - the item's own creator can still see their private item
 *
 * Setup/teardown run as the owner role (bypasses RLS by table ownership —
 * realistic, since real hub/task creation happens through privileged server
 * actions). Assertions run as app_user via `SET LOCAL ROLE` inside the SAME
 * transaction as setup would use a separate connection for — this exercises
 * the real policies against the real low-privilege role's real permissions,
 * without depending on a second network connection correctly authenticating
 * as a distinct role (Prisma's *local* embedded dev Postgres accepts any
 * username/password and always connects as its superuser, so a second
 * connection string can't prove anything locally; `SET LOCAL ROLE` sidesteps
 * that and tests the actual policy logic instead — Neon's real per-role auth
 * is what the production `APP_DATABASE_URL` setup relies on, see
 * prisma/create-app-role.sql).
 *
 *   npm run verify:isolation
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function asAppUser(userId, fn) {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE app_user`);
    await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    return fn(tx);
  });
}

let failures = 0;
function check(label, condition) {
  console.log(condition ? `✔ ${label}` : `✗ ${label}`);
  if (!condition) failures++;
}

async function main() {
  const roleCheck = await db.$queryRaw`SELECT rolbypassrls FROM pg_roles WHERE rolname = 'app_user'`;
  if (roleCheck.length === 0) {
    console.error(
      "✗ role 'app_user' doesn't exist — run prisma/create-app-role.sql against this database first.",
    );
    process.exit(1);
  }
  if (roleCheck[0].rolbypassrls) {
    console.error("✗ 'app_user' has BYPASSRLS — this test would pass even if the policies are broken.");
    process.exit(1);
  }

  const stamp = Date.now();
  const email = (n) => `verify-isolation-${stamp}-${n}@example.invalid`;

  // --- setup (owner role) ---------------------------------------------------
  const userA1 = await db.user.create({ data: { email: email("a1"), name: "A1" } });
  const userA2 = await db.user.create({ data: { email: email("a2"), name: "A2" } });
  const userB1 = await db.user.create({ data: { email: email("b1"), name: "B1" } });

  const hubA = await db.hub.create({ data: { name: "Verify Hub A", createdById: userA1.id } });
  const hubB = await db.hub.create({ data: { name: "Verify Hub B", createdById: userB1.id } });

  await db.hubMembership.createMany({
    data: [
      { hubId: hubA.id, userId: userA1.id, role: "OWNER", status: "ACTIVE", joinedAt: new Date() },
      { hubId: hubA.id, userId: userA2.id, role: "MEMBER", status: "ACTIVE", joinedAt: new Date() },
      { hubId: hubB.id, userId: userB1.id, role: "OWNER", status: "ACTIVE", joinedAt: new Date() },
    ],
  });

  const sharedTaskA = await db.task.create({
    data: { title: "shared in A", hubId: hubA.id, createdById: userA1.id, visibility: "SHARED" },
  });
  const privateTaskA = await db.task.create({
    data: { title: "private in A (A1 only)", hubId: hubA.id, createdById: userA1.id, visibility: "PRIVATE" },
  });
  const taskB = await db.task.create({
    data: { title: "task in B", hubId: hubB.id, createdById: userB1.id, visibility: "SHARED" },
  });

  try {
    // --- assertions (app_user role) -------------------------------------------
    const asA1 = await asAppUser(userA1.id, (tx) => tx.task.findMany({ orderBy: { title: "asc" } }));
    const asA2 = await asAppUser(userA2.id, (tx) => tx.task.findMany({ orderBy: { title: "asc" } }));
    const asB1 = await asAppUser(userB1.id, (tx) => tx.task.findMany({ orderBy: { title: "asc" } }));

    const ids = (rows) => rows.map((r) => r.id).sort();

    check(
      "A1 (creator) sees both Hub A tasks, including their own private one",
      ids(asA1).length === 2 &&
        ids(asA1).includes(privateTaskA.id) &&
        ids(asA1).includes(sharedTaskA.id),
    );
    check(
      "A2 (hub-mate, not creator) sees the shared Hub A task but NOT the private one",
      ids(asA2).length === 1 && ids(asA2)[0] === sharedTaskA.id,
    );
    check("A1 sees zero Hub B tasks", !asA1.some((t) => t.id === taskB.id));
    check("A2 sees zero Hub B tasks", !asA2.some((t) => t.id === taskB.id));
    check(
      "B1 sees only their own Hub B task, zero Hub A tasks",
      ids(asB1).length === 1 && asB1[0].id === taskB.id,
    );

    const a2ReadsPrivateDirect = await asAppUser(userA2.id, (tx) =>
      tx.task.findUnique({ where: { id: privateTaskA.id } }),
    );
    check("A2 gets null reading the private task by id directly", a2ReadsPrivateDirect === null);

    // Attempted write across the boundary must also fail: A2 tries to delete
    // A1's private task. RLS's default USING clause covers UPDATE/DELETE too,
    // so this should affect zero rows, not error — then confirm it still exists.
    const asA2Delete = await asAppUser(userA2.id, (tx) =>
      tx.task.deleteMany({ where: { id: privateTaskA.id } }),
    );
    check("A2's delete of A1's private task affects 0 rows", asA2Delete.count === 0);
    const stillThere = await db.task.findUnique({ where: { id: privateTaskA.id } });
    check("A1's private task still exists after A2's blocked delete", stillThere !== null);
  } finally {
    // --- teardown (owner role) ------------------------------------------------
    await db.task.deleteMany({ where: { id: { in: [sharedTaskA.id, privateTaskA.id, taskB.id] } } });
    await db.hubMembership.deleteMany({ where: { hubId: { in: [hubA.id, hubB.id] } } });
    await db.hub.deleteMany({ where: { id: { in: [hubA.id, hubB.id] } } });
    await db.user.deleteMany({ where: { id: { in: [userA1.id, userA2.id, userB1.id] } } });
  }

  console.log(failures === 0 ? "\nAll isolation checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main()
  .catch(async (e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
