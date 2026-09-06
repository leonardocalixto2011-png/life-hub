import { del } from "@vercel/blob";

import { prisma } from "@/lib/prisma";

/**
 * Account export and erasure — the technical half of GDPR Articles 15/20
 * (access + portability) and 17 (erasure). The legal half (a privacy policy
 * saying what you collect and why, a lawful basis, a retention schedule) is
 * not code and is not written yet; see CLAUDE.md.
 *
 * Erasure here is deliberately NOT `prisma.user.delete()`. Five relations use
 * `onDelete: Restrict` — Hub, Task, Deadline, Event and BudgetEntry all point
 * at their author — so deleting any user who ever created anything fails at
 * the database. And cascading those away would be wrong anyway: a task you
 * wrote in a shared hub is other members' data too, and erasing your account
 * shouldn't silently delete their board.
 *
 * So: rows that are *only* about you are destroyed, and rows that are shared
 * have their link to you severed by repointing authorship at a tombstone
 * user. What survives carries no identifier of yours.
 */

const TOMBSTONE_ID = "deleted-user-tombstone";

/** The stand-in author for content that outlives the person who wrote it. */
async function tombstone(): Promise<string> {
  const existing = await prisma.user.findUnique({ where: { id: TOMBSTONE_ID }, select: { id: true } });
  if (existing) return existing.id;
  // email stays null: User.email is nullable+unique, so this can never collide
  // and can never be signed into (magic link matches on email).
  const created = await prisma.user.create({
    data: { id: TOMBSTONE_ID, name: "Deleted user", email: null, role: "MEMBER" },
    select: { id: true },
  });
  return created.id;
}

/**
 * Everything the database holds about one person, as plain JSON. Includes
 * content they authored in shared hubs, since that's still their personal
 * data even though other people can see it.
 */
export async function exportUserData(userId: string) {
  const [
    user,
    memberships,
    tasksCreated,
    tasksAssigned,
    deadlines,
    events,
    budgetEntries,
    subscriptions,
    debts,
    debtShares,
    mailAccounts,
    pushSubscriptions,
    notificationPref,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, email: true, emailVerified: true, role: true,
        themeId: true, backgroundImageUrl: true, createdAt: true,
      },
    }),
    prisma.hubMembership.findMany({
      where: { userId },
      select: { role: true, status: true, joinedAt: true, createdAt: true, hub: { select: { name: true } } },
    }),
    prisma.task.findMany({ where: { createdById: userId } }),
    prisma.task.findMany({ where: { assignedToId: userId }, select: { id: true, title: true, dueDate: true } }),
    prisma.deadline.findMany({ where: { createdById: userId } }),
    prisma.event.findMany({ where: { createdById: userId } }),
    prisma.budgetEntry.findMany({ where: { createdById: userId } }),
    prisma.subscription.findMany({ where: { ownerId: userId } }),
    prisma.debt.findMany({ where: { ownerId: userId } }),
    prisma.debtShare.findMany({
      where: { ownerId: userId },
      select: { visibility: true, createdAt: true, hub: { select: { name: true } } },
    }),
    // Credentials are excluded on purpose: exporting an encrypted OAuth token
    // or app password would hand a copy of live mailbox access to whoever
    // gets hold of the export file.
    prisma.mailAccount.findMany({
      where: { userId },
      select: { provider: true, emailAddress: true, status: true, lastSyncedAt: true, createdAt: true },
    }),
    prisma.pushSubscription.findMany({
      where: { userId },
      select: { userAgent: true, createdAt: true, lastOkAt: true },
    }),
    prisma.notificationPreference.findUnique({ where: { userId } }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    note:
      "Everything Life Hub stores about this account. Mailbox credentials and " +
      "push endpoints are deliberately omitted — they are secrets, not personal records.",
    user,
    memberships,
    tasksCreated,
    tasksAssignedToMe: tasksAssigned,
    deadlines,
    events,
    budgetEntries,
    subscriptions,
    debts,
    debtShares,
    mailAccounts,
    pushSubscriptions,
    notificationPref,
  };
}

export type DeletionReport = {
  hubsDeleted: number;
  hubsHandedOver: number;
  authorshipAnonymised: number;
};

/**
 * Erase an account. Destroys what is only theirs, severs what is shared.
 *
 * Hub ownership is handled first: a hub whose owner leaves is either handed
 * to the longest-standing remaining member, or — if nobody else is left —
 * deleted outright, which cascades its content away. Skipping this would
 * strand hubs with no one able to administer them.
 */
export async function deleteAccount(userId: string): Promise<DeletionReport> {
  const report: DeletionReport = { hubsDeleted: 0, hubsHandedOver: 0, authorshipAnonymised: 0 };

  const ghostId = await tombstone();
  if (userId === ghostId) throw new Error("Refusing to delete the tombstone user.");

  // Best-effort: the blob lives outside Postgres, so it can't join the
  // transaction. Do it first — an orphaned row is recoverable, an orphaned
  // image in public storage is a leak.
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { backgroundImageUrl: true },
  });
  if (me?.backgroundImageUrl) {
    try {
      await del(me.backgroundImageUrl);
    } catch {
      // Already gone or unreachable — not worth failing the erasure over.
    }
  }

  const ownedHubs = await prisma.hubMembership.findMany({
    where: { userId, role: "OWNER" },
    select: { hubId: true },
  });

  for (const { hubId } of ownedHubs) {
    const heir = await prisma.hubMembership.findFirst({
      where: { hubId, userId: { not: userId }, status: "ACTIVE" },
      orderBy: { joinedAt: "asc" },
      select: { id: true },
    });
    if (heir) {
      await prisma.hubMembership.update({ where: { id: heir.id }, data: { role: "OWNER" } });
      report.hubsHandedOver++;
    } else {
      // Sole member: the hub and everything in it was only ever theirs.
      await prisma.hub.delete({ where: { id: hubId } });
      report.hubsDeleted++;
    }
  }

  // Repoint the Restrict'd authorship links. Hub.createdById is included
  // because a hub handed to someone else still records who made it.
  const [t, d, e, b, h] = await prisma.$transaction([
    prisma.task.updateMany({ where: { createdById: userId }, data: { createdById: ghostId } }),
    prisma.deadline.updateMany({ where: { createdById: userId }, data: { createdById: ghostId } }),
    prisma.event.updateMany({ where: { createdById: userId }, data: { createdById: ghostId } }),
    prisma.budgetEntry.updateMany({ where: { createdById: userId }, data: { createdById: ghostId } }),
    prisma.hub.updateMany({ where: { createdById: userId }, data: { createdById: ghostId } }),
  ]);
  report.authorshipAnonymised = t.count + d.count + e.count + b.count + h.count;

  // Everything else — memberships, debts, debt shares, mail accounts, push
  // subscriptions, notification prefs, sessions, auth accounts — is
  // onDelete: Cascade from User, so this removes them. Subscriptions and
  // assigned tasks are SetNull, which is what we want: the row survives in
  // the hub without pointing at a person.
  await prisma.user.delete({ where: { id: userId } });

  return report;
}
