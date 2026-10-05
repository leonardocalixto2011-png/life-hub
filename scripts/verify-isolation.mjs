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

  const chatIds = [];
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

    // --- debt sharing ---------------------------------------------------------
    // A1 owns debts. Hidden by default, SUMMARY must expose NO rows, FULL must.
    const debtA1 = await db.debt.create({
      data: {
        name: "A1 private card",
        ownerId: userA1.id,
        hubId: hubA.id,
        balanceCents: 100000,
        minimumPaymentCents: 5000,
      },
    });

    const a2SeesHidden = await asAppUser(userA2.id, (tx) => tx.debt.findMany());
    check(
      "A2 sees zero of A1's debts with no share (private by default)",
      !a2SeesHidden.some((d) => d.id === debtA1.id),
    );

    await db.debtShare.create({
      data: { ownerId: userA1.id, hubId: hubA.id, visibility: "SUMMARY" },
    });
    const a2SeesSummary = await asAppUser(userA2.id, (tx) => tx.debt.findMany());
    check(
      "A2 still sees zero DEBT ROWS under a SUMMARY share (totals come from a trusted aggregate, not RLS)",
      !a2SeesSummary.some((d) => d.id === debtA1.id),
    );
    const a2SummaryById = await asAppUser(userA2.id, (tx) =>
      tx.debt.findUnique({ where: { id: debtA1.id } }),
    );
    check("A2 gets null reading a SUMMARY-shared debt by id directly", a2SummaryById === null);

    await db.debtShare.update({
      where: { ownerId_hubId: { ownerId: userA1.id, hubId: hubA.id } },
      data: { visibility: "FULL" },
    });
    const a2SeesFull = await asAppUser(userA2.id, (tx) => tx.debt.findMany());
    check(
      "A2 CAN see the debt once A1 switches that hub to FULL",
      a2SeesFull.some((d) => d.id === debtA1.id),
    );

    const b1SeesShared = await asAppUser(userB1.id, (tx) => tx.debt.findMany());
    check(
      "B1 (different hub) sees nothing even though A1 shared FULL into Hub A",
      !b1SeesShared.some((d) => d.id === debtA1.id),
    );

    // A FULL share is read-only: a viewer must not be able to edit or delete.
    // A FULL share admits SELECT only — debt_update and debt_delete both key
    // their USING off ownership, so a viewer's write matches no rows at all.
    // (This is why the policy is split per command: a single policy would
    // authorise DELETE from the permissive read condition.)
    let editBlocked = false;
    try {
      const r = await asAppUser(userA2.id, (tx) =>
        tx.debt.updateMany({ where: { id: debtA1.id }, data: { balanceCents: 1 } }),
      );
      editBlocked = r.count === 0; // debt_update USING is owner-only, so nothing matches
    } catch {
      editBlocked = true; // or WITH CHECK refuses it outright
    }
    check("A2 cannot edit a FULL-shared debt", editBlocked);
    const a2Delete = await asAppUser(userA2.id, (tx) =>
      tx.debt.deleteMany({ where: { id: debtA1.id } }),
    );
    check("A2 cannot delete a FULL-shared debt (0 rows)", a2Delete.count === 0);
    const debtIntact = await db.debt.findUnique({ where: { id: debtA1.id } });
    check(
      "A1's debt survives A2's blocked write attempts, unchanged",
      debtIntact !== null && debtIntact.balanceCents === 100000,
    );

    // --- planning tables: trips, their checklists, special dates -------------
    // Created here, torn down by the hub delete below (both cascade from Hub).
    const privateTrip = await db.trip.create({
      data: {
        title: "A1 surprise trip",
        hubId: hubA.id,
        createdById: userA1.id,
        visibility: "PRIVATE",
        startDate: new Date(),
        endDate: new Date(),
      },
    });
    const privateTripItem = await db.tripItem.create({
      data: { tripId: privateTrip.id, hubId: hubA.id, title: "book the hotel" },
    });
    const sharedDateA = await db.specialDate.create({
      data: { title: "shared birthday", hubId: hubA.id, createdById: userA1.id, month: 1, day: 1 },
    });

    const a2Trips = await asAppUser(userA2.id, (tx) => tx.trip.findMany({ where: { hubId: hubA.id } }));
    check("A2 cannot see A1's private trip", !a2Trips.some((t) => t.id === privateTrip.id));

    const a2Items = await asAppUser(userA2.id, (tx) => tx.tripItem.findMany({ where: { hubId: hubA.id } }));
    check(
      "A2 cannot see the checklist of A1's private trip (TripItem follows its trip)",
      !a2Items.some((i) => i.id === privateTripItem.id),
    );

    const a1Items = await asAppUser(userA1.id, (tx) =>
      tx.tripItem.findMany({ where: { tripId: privateTrip.id } }),
    );
    check("A1 sees their own private trip's checklist", a1Items.length === 1);

    const a2Dates = await asAppUser(userA2.id, (tx) => tx.specialDate.findMany({ where: { hubId: hubA.id } }));
    check("A2 sees Hub A's shared special date", a2Dates.some((d) => d.id === sharedDateA.id));

    const b1Dates = await asAppUser(userB1.id, (tx) => tx.specialDate.findMany());
    check("B1 (other hub) sees none of Hub A's special dates", !b1Dates.some((d) => d.id === sharedDateA.id));

    let crossItemInsertBlocked = false;
    try {
      await asAppUser(userB1.id, (tx) =>
        tx.tripItem.create({ data: { tripId: privateTrip.id, hubId: hubA.id, title: "injected" } }),
      );
    } catch {
      crossItemInsertBlocked = true;
    }
    check("B1 cannot add an item to a Hub A trip", crossItemInsertBlocked);

    // --- quick-add favourites: personal, not just hub-scoped -----------------
    // Torn down by the hub delete below (QuickFavorite cascades from Hub).
    const favA1 = await db.quickFavorite.create({
      data: { hubId: hubA.id, createdById: userA1.id, label: "Essence", kind: "BUDGET", amountCents: 6000 },
    });

    const a1Favs = await asAppUser(userA1.id, (tx) => tx.quickFavorite.findMany());
    check("A1 sees their own favourite", a1Favs.some((f) => f.id === favA1.id));

    const a2Favs = await asAppUser(userA2.id, (tx) => tx.quickFavorite.findMany());
    check("A2 (same hub) cannot see A1's favourite", !a2Favs.some((f) => f.id === favA1.id));
    const a2FavById = await asAppUser(userA2.id, (tx) =>
      tx.quickFavorite.findUnique({ where: { id: favA1.id } }),
    );
    check("A2 gets null reading A1's favourite by id", a2FavById === null);

    const b1Favs = await asAppUser(userB1.id, (tx) => tx.quickFavorite.findMany());
    check("B1 (other hub) cannot see A1's favourite", !b1Favs.some((f) => f.id === favA1.id));

    const a2FavDelete = await asAppUser(userA2.id, (tx) =>
      tx.quickFavorite.deleteMany({ where: { id: favA1.id } }),
    );
    const b1FavDelete = await asAppUser(userB1.id, (tx) =>
      tx.quickFavorite.deleteMany({ where: { id: favA1.id } }),
    );
    const favIntact = await db.quickFavorite.findUnique({ where: { id: favA1.id } });
    check(
      "Neither A2 nor B1 can delete A1's favourite (0 rows, still there)",
      a2FavDelete.count === 0 && b1FavDelete.count === 0 && favIntact !== null,
    );

    let a2Relabel = 0;
    try {
      a2Relabel = (
        await asAppUser(userA2.id, (tx) =>
          tx.quickFavorite.updateMany({ where: { id: favA1.id }, data: { label: "hijacked" } }),
        )
      ).count;
    } catch {
      a2Relabel = 0;
    }
    check("A2 cannot rename A1's favourite", a2Relabel === 0);

    let a2ImpersonateBlocked = false;
    try {
      await asAppUser(userA2.id, (tx) =>
        tx.quickFavorite.create({ data: { hubId: hubA.id, createdById: userA1.id, label: "planted", kind: "TASK" } }),
      );
    } catch {
      a2ImpersonateBlocked = true;
    }
    check("A2 cannot insert a favourite in A1's name", a2ImpersonateBlocked);

    let b1CrossHubBlocked = false;
    try {
      await asAppUser(userB1.id, (tx) =>
        tx.quickFavorite.create({ data: { hubId: hubA.id, createdById: userB1.id, label: "intruder", kind: "TASK" } }),
      );
    } catch {
      b1CrossHubBlocked = true;
    }
    check("B1 cannot insert a favourite into Hub A", b1CrossHubBlocked);

    // --- consent ledger: strictly self-only, even inside a shared hub --------
    // Torn down with the users below (Consent cascades from User).
    const consentA1 = await db.consent.create({
      data: { userId: userA1.id, kind: "DEBT_SHARE", hubId: hubA.id, policyVersion: "verify" },
    });

    const a1Consents = await asAppUser(userA1.id, (tx) => tx.consent.findMany());
    check("A1 sees their own consent row", a1Consents.some((c) => c.id === consentA1.id));
    check(
      "A1 sees ONLY their own consent rows",
      a1Consents.every((c) => c.userId === userA1.id),
    );

    const a2Consents = await asAppUser(userA2.id, (tx) => tx.consent.findMany());
    check("A2 (same hub) cannot see A1's consent", !a2Consents.some((c) => c.id === consentA1.id));
    const a2ConsentById = await asAppUser(userA2.id, (tx) =>
      tx.consent.findUnique({ where: { id: consentA1.id } }),
    );
    check("A2 gets null reading A1's consent by id", a2ConsentById === null);

    const b1Consents = await asAppUser(userB1.id, (tx) => tx.consent.findMany());
    check("B1 (other hub) cannot see A1's consent", !b1Consents.some((c) => c.id === consentA1.id));

    // Revoking is an UPDATE: nobody but the person themself may close a consent.
    let a2Revoked = 0;
    try {
      a2Revoked = (
        await asAppUser(userA2.id, (tx) =>
          tx.consent.updateMany({ where: { id: consentA1.id }, data: { revokedAt: new Date() } }),
        )
      ).count;
    } catch {
      a2Revoked = 0;
    }
    const consentIntact = await db.consent.findUnique({ where: { id: consentA1.id } });
    check(
      "A2 cannot revoke A1's consent (0 rows, still active)",
      a2Revoked === 0 && consentIntact !== null && consentIntact.revokedAt === null,
    );

    // Forging a consent is the dangerous direction: it would switch on mail
    // analysis or debt sharing in someone else's name.
    let a2ForgeBlocked = false;
    try {
      await asAppUser(userA2.id, (tx) =>
        tx.consent.create({
          data: { userId: userA1.id, kind: "MAIL_AI", hubId: hubA.id, policyVersion: "forged" },
        }),
      );
    } catch {
      a2ForgeBlocked = true;
    }
    check("A2 cannot record a consent in A1's name", a2ForgeBlocked);

    let a1OwnWrite = false;
    try {
      const own = await asAppUser(userA1.id, (tx) =>
        tx.consent.create({ data: { userId: userA1.id, kind: "AGE_18", policyVersion: "verify" } }),
      );
      const closed = await asAppUser(userA1.id, (tx) =>
        tx.consent.updateMany({ where: { id: own.id }, data: { revokedAt: new Date() } }),
      );
      a1OwnWrite = closed.count === 1;
    } catch {
      a1OwnWrite = false;
    }
    check("A1 can give and revoke their OWN consent as app_user", a1OwnWrite);

    // The ledger is append-and-revoke: the app role has no DELETE at all, so
    // history can't be erased from a request path — not even one's own.
    let ledgerDeleteBlocked = false;
    try {
      const r = await asAppUser(userA1.id, (tx) => tx.consent.deleteMany({ where: { id: consentA1.id } }));
      ledgerDeleteBlocked = r.count === 0;
    } catch {
      ledgerDeleteBlocked = true;
    }
    const consentStillThere = await db.consent.findUnique({ where: { id: consentA1.id } });
    check(
      "app_user cannot delete a consent row, even its own (still there)",
      ledgerDeleteBlocked && consentStillThere !== null,
    );

    // --- account system: invitations and address changes are server-only ----
    // Torn down with the users below (both cascade from User).
    const inviteA1 = await db.appInvite.create({
      data: {
        tokenHash: `verify-${stamp}`, createdById: userA1.id, email: email("invitee"),
        expiresAt: new Date(Date.now() + 864e5),
      },
    });
    const changeA1 = await db.emailChange.create({
      data: { userId: userA1.id, newEmail: email("new"), tokenHash: `verify-${stamp}`, expiresAt: new Date(Date.now() + 36e5) },
    });
    let ownInvitesRead = null;
    try {
      ownInvitesRead = await asAppUser(userA1.id, (tx) => tx.appInvite.findMany({ where: { id: inviteA1.id } }));
    } catch {
      ownInvitesRead = null;
    }
    check(
      "app_user cannot read invitations, not even its own (no grant / RLS)",
      ownInvitesRead === null || ownInvitesRead.length === 0,
    );
    let ownChangeRead = null;
    try {
      ownChangeRead = await asAppUser(userA1.id, (tx) => tx.emailChange.findMany({ where: { id: changeA1.id } }));
    } catch {
      ownChangeRead = null;
    }
    check(
      "app_user cannot read pending address changes (no grant / RLS)",
      ownChangeRead === null || ownChangeRead.length === 0,
    );

    // A join request is the requester's own row: other people — even the
    // hub's members — don't see it through the app role, and it can't be
    // turned into a membership by the requester themself except by the
    // server's owner-checked approval (enforced in code; RLS keeps it private).
    const requestB1toA = await db.hubMembership.create({
      data: { hubId: hubA.id, userId: userB1.id, role: "MEMBER", status: "REQUESTED" },
    });
    const a1SeesRequest = await asAppUser(userA1.id, (tx) =>
      tx.hubMembership.findMany({ where: { id: requestB1toA.id } }),
    );
    check("A1 (owner of A) sees no one else's membership row via app_user", a1SeesRequest.length === 0);
    const b1Tasks = await asAppUser(userB1.id, (tx) => tx.task.findMany({ where: { hubId: hubA.id } }));
    check("B1 with a pending REQUEST to Hub A sees none of its tasks", b1Tasks.length === 0);
    await db.hubMembership.delete({ where: { id: requestB1toA.id } });

    // --- activity feed: hub-scoped, a private item's line is its actor's only --
    // Torn down by the hub delete below (Activity cascades from Hub).
    const sharedActA1 = await db.activity.create({
      data: {
        hubId: hubA.id, actorId: userA1.id, verb: "TASK_DONE", entityType: "task",
        entityId: sharedTaskA.id, summary: "shared in A", visibility: "SHARED",
      },
    });
    const privateActA1 = await db.activity.create({
      data: {
        hubId: hubA.id, actorId: userA1.id, verb: "TASK_ADDED", entityType: "task",
        entityId: privateTaskA.id, summary: "private in A (A1 only)", visibility: "PRIVATE",
      },
    });

    const a1Feed = await asAppUser(userA1.id, (tx) => tx.activity.findMany());
    check(
      "A1 sees both of their own activity lines, private one included",
      a1Feed.some((a) => a.id === sharedActA1.id) && a1Feed.some((a) => a.id === privateActA1.id),
    );
    const a2Feed = await asAppUser(userA2.id, (tx) => tx.activity.findMany());
    check(
      "A2 (hub-mate) sees A1's shared activity line but NOT the private item's line",
      a2Feed.some((a) => a.id === sharedActA1.id) && !a2Feed.some((a) => a.id === privateActA1.id),
    );
    const a2PrivateActById = await asAppUser(userA2.id, (tx) =>
      tx.activity.findUnique({ where: { id: privateActA1.id } }),
    );
    check("A2 gets null reading the private activity line by id", a2PrivateActById === null);
    const b1Feed = await asAppUser(userB1.id, (tx) => tx.activity.findMany());
    check(
      "B1 (other hub) sees none of Hub A's activity",
      !b1Feed.some((a) => a.hubId === hubA.id),
    );

    // Forging a line in someone else's name is the dangerous direction.
    let a2ForgedActivity = false;
    try {
      await asAppUser(userA2.id, (tx) =>
        tx.activity.create({
          data: { hubId: hubA.id, actorId: userA1.id, verb: "TASK_DONE", entityType: "task", summary: "forged" },
        }),
      );
    } catch {
      a2ForgedActivity = true;
    }
    check("A2 cannot write an activity line in A1's name", a2ForgedActivity);

    let b1CrossHubActivity = false;
    try {
      await asAppUser(userB1.id, (tx) =>
        tx.activity.create({
          data: { hubId: hubA.id, actorId: userB1.id, verb: "TASK_DONE", entityType: "task", summary: "intruder" },
        }),
      );
    } catch {
      b1CrossHubActivity = true;
    }
    check("B1 cannot write an activity line into Hub A", b1CrossHubActivity);

    let a2OwnActivity = false;
    try {
      const own = await asAppUser(userA2.id, (tx) =>
        tx.activity.create({
          data: { hubId: hubA.id, actorId: userA2.id, verb: "TASK_ADDED", entityType: "task", summary: "A2's own" },
        }),
      );
      a2OwnActivity = Boolean(own.id);
    } catch {
      a2OwnActivity = false;
    }
    check("A2 CAN write an activity line in their own name", a2OwnActivity);

    // The "merci" reaction is an UPDATE of one column on someone else's line.
    // The app role holds UPDATE on thankedById only, so the text is not editable.
    let a2Rewrote = 0;
    try {
      a2Rewrote = (
        await asAppUser(userA2.id, (tx) =>
          tx.activity.updateMany({ where: { id: sharedActA1.id }, data: { summary: "rewritten" } }),
        )
      ).count;
    } catch {
      a2Rewrote = 0;
    }
    const actIntact = await db.activity.findUnique({ where: { id: sharedActA1.id } });
    check(
      "A2 cannot rewrite the text of A1's activity line",
      a2Rewrote === 0 && actIntact?.summary === "shared in A",
    );

    const a2Thanked = await asAppUser(
      userA2.id,
      (tx) => tx.$executeRaw`
        UPDATE "Activity" SET "thankedById" = array_append("thankedById", ${userA2.id})
         WHERE "id" = ${sharedActA1.id} AND NOT (${userA2.id} = ANY("thankedById"))`,
    );
    const a2ThankedTwice = await asAppUser(
      userA2.id,
      (tx) => tx.$executeRaw`
        UPDATE "Activity" SET "thankedById" = array_append("thankedById", ${userA2.id})
         WHERE "id" = ${sharedActA1.id} AND NOT (${userA2.id} = ANY("thankedById"))`,
    );
    const thankedRow = await db.activity.findUnique({ where: { id: sharedActA1.id } });
    check(
      "A2 can thank A1's shared line exactly once (second attempt changes 0 rows)",
      a2Thanked === 1 && a2ThankedTwice === 0 && thankedRow?.thankedById.length === 1,
    );

    const a2ThankPrivate = await asAppUser(
      userA2.id,
      (tx) => tx.$executeRaw`
        UPDATE "Activity" SET "thankedById" = array_append("thankedById", ${userA2.id})
         WHERE "id" = ${privateActA1.id}`,
    );
    const b1Thank = await asAppUser(
      userB1.id,
      (tx) => tx.$executeRaw`
        UPDATE "Activity" SET "thankedById" = array_append("thankedById", ${userB1.id})
         WHERE "id" = ${sharedActA1.id}`,
    );
    check(
      "A2 cannot thank a private line, and B1 cannot thank anything in Hub A (0 rows each)",
      a2ThankPrivate === 0 && b1Thank === 0,
    );

    const a2DeleteAct = await asAppUser(userA2.id, (tx) =>
      tx.activity.deleteMany({ where: { id: sharedActA1.id } }),
    );
    const actStillThere = await db.activity.findUnique({ where: { id: sharedActA1.id } });
    check(
      "A2 cannot delete A1's activity line (0 rows, still there)",
      a2DeleteAct.count === 0 && actStillThere !== null,
    );

    // --- chats: direct, group, hub, assistant ---------------------------------
    const direct = await db.conversation.create({
      data: {
        kind: "DIRECT",
        uniqueKey: `verify-direct-${stamp}`,
        createdById: userA1.id,
        members: { create: [{ userId: userA1.id }, { userId: userA2.id }] },
        messages: { create: [{ authorId: userA1.id, role: "USER", body: "hi A2" }] },
      },
    });
    const aiChat = await db.conversation.create({
      data: {
        kind: "AI",
        createdById: userA1.id,
        members: { create: [{ userId: userA1.id }] },
        messages: {
          create: [
            { authorId: userA1.id, role: "USER", body: "my private question" },
            { authorId: null, role: "ASSISTANT", body: "my private answer" },
          ],
        },
      },
    });
    const hubChat = await db.conversation.create({
      data: {
        kind: "HUB",
        hubId: hubA.id,
        uniqueKey: `verify-hub-${stamp}`,
        messages: { create: [{ authorId: userA2.id, role: "USER", body: "hello hub" }] },
      },
    });
    chatIds.push(direct.id, aiChat.id, hubChat.id);

    const convIds = (rows) => new Set(rows.map((r) => r.id));
    const a2Convs = convIds(await asAppUser(userA2.id, (tx) => tx.conversation.findMany()));
    const b1Convs = convIds(await asAppUser(userB1.id, (tx) => tx.conversation.findMany()));
    check("A2 sees the direct chat with A1 and Hub A's chat", a2Convs.has(direct.id) && a2Convs.has(hubChat.id));
    check("A2 cannot see A1's assistant conversation", !a2Convs.has(aiChat.id));
    check(
      "B1 (other hub) sees none of the three chats",
      !b1Convs.has(direct.id) && !b1Convs.has(hubChat.id) && !b1Convs.has(aiChat.id),
    );

    const a2AiMsgs = await asAppUser(userA2.id, (tx) =>
      tx.chatMessage.findMany({ where: { conversationId: aiChat.id } }),
    );
    const b1Msgs = await asAppUser(userB1.id, (tx) =>
      tx.chatMessage.findMany({ where: { conversationId: { in: [direct.id, hubChat.id] } } }),
    );
    check("A2 reads none of A1's assistant messages", a2AiMsgs.length === 0);
    check("B1 reads no messages from Hub A's chats", b1Msgs.length === 0);

    const blocked = async (fn) => {
      try {
        await fn();
        return false;
      } catch {
        return true;
      }
    };
    check(
      "A2 cannot post a message signed as A1",
      await blocked(() =>
        asAppUser(userA2.id, (tx) =>
          tx.chatMessage.create({ data: { conversationId: direct.id, authorId: userA1.id, role: "USER", body: "forged" } }),
        ),
      ),
    );
    check(
      "B1 cannot post into the A1–A2 chat",
      await blocked(() =>
        asAppUser(userB1.id, (tx) =>
          tx.chatMessage.create({ data: { conversationId: direct.id, authorId: userB1.id, role: "USER", body: "intruder" } }),
        ),
      ),
    );
    check(
      "Nobody can forge an assistant reply outside their own assistant chat",
      (await blocked(() =>
        asAppUser(userA1.id, (tx) =>
          tx.chatMessage.create({ data: { conversationId: direct.id, authorId: null, role: "ASSISTANT", body: "fake bot" } }),
        ),
      )) &&
        (await blocked(() =>
          asAppUser(userA2.id, (tx) =>
            tx.chatMessage.create({ data: { conversationId: aiChat.id, authorId: null, role: "ASSISTANT", body: "fake bot" } }),
          ),
        )),
    );
    check(
      "B1 cannot seat themselves in the A1–A2 chat",
      await blocked(() =>
        asAppUser(userB1.id, (tx) => tx.conversationMember.create({ data: { conversationId: direct.id, userId: userB1.id } })),
      ),
    );
    check(
      "app_user cannot create a conversation at all (server-only)",
      await blocked(() =>
        asAppUser(userA1.id, (tx) =>
          tx.conversation.create({ data: { kind: "DIRECT", uniqueKey: `verify-forged-${stamp}`, createdById: userA1.id } }),
        ),
      ),
    );
    const a2DeletesA1Msg = await asAppUser(userA2.id, (tx) =>
      tx.chatMessage.deleteMany({ where: { conversationId: direct.id, authorId: userA1.id } }),
    );
    check("A2 cannot delete A1's message (0 rows)", a2DeletesA1Msg.count === 0);
    check(
      "A2 CAN post in the A1–A2 chat as themselves",
      !(await blocked(() =>
        asAppUser(userA2.id, (tx) =>
          tx.chatMessage.create({ data: { conversationId: direct.id, authorId: userA2.id, role: "USER", body: "hi A1" } }),
        ),
      )),
    );

    // --- Claude credit: server-only ledger -----------------------------------
    await db.creditWallet.create({ data: { userId: userA1.id, balanceMillicents: 100_000 } });
    check(
      "app_user cannot read any credit wallet",
      await blocked(() => asAppUser(userA1.id, (tx) => tx.creditWallet.findMany())),
    );
    check(
      "app_user cannot write a credit entry, even for themselves",
      await blocked(() =>
        asAppUser(userA1.id, (tx) => tx.creditEntry.create({ data: { userId: userA1.id, kind: "TOPUP", amountMillicents: 1 } })),
      ),
    );
  } finally {
    // --- teardown (owner role) ------------------------------------------------
    await db.conversation.deleteMany({ where: { id: { in: chatIds } } });
    await db.debtShare.deleteMany({ where: { ownerId: { in: [userA1.id, userA2.id, userB1.id] } } });
    await db.debt.deleteMany({ where: { ownerId: { in: [userA1.id, userA2.id, userB1.id] } } });
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
