import { del } from "@vercel/blob";

import { prisma } from "@/lib/prisma";
import { deleteBlobIfUnreferenced } from "@/lib/blob-delete";

/**
 * Account export and erasure — the technical half of GDPR Articles 15/20
 * (access + portability) and 17 (erasure). The legal half (a privacy policy
 * saying what you collect and why, a lawful basis, a retention schedule) is
 * not code and is not written yet; see CLAUDE.md.
 *
 * Erasure here is deliberately NOT `prisma.user.delete()`. Seven relations use
 * `onDelete: Restrict` — Hub, Task, Deadline, Event, BudgetEntry, SpecialDate
 * and Trip all point at their author — so deleting any user who ever created
 * anything fails at the database. And cascading those away would be wrong
 * anyway: a task you wrote in a shared hub is other members' data too, and
 * erasing your account shouldn't silently delete their board.
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
    specialDates,
    trips,
    subscriptions,
    debts,
    debtShares,
    mailAccounts,
    pushSubscriptions,
    notificationPref,
    quickFavorites,
    consents,
    activity,
    chatMessages,
    creditWallet,
    creditEntries,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, email: true, emailVerified: true, role: true,
        themeId: true, backgroundImageUrl: true, createdAt: true,
        locale: true, onboardedAt: true, interests: true, aiNoticeAt: true,
        username: true, avatarUrl: true, invitedBy: { select: { name: true } },
        // Invitations they sent: when and whether used. The addresses they
        // typed are left out — those are other people's.
        appInvitesSent: {
          select: { createdAt: true, expiresAt: true, usedAt: true, revokedAt: true, hub: { select: { name: true } } },
        },
      },
    }),
    prisma.hubMembership.findMany({
      where: { userId },
      select: {
        role: true, status: true, joinedAt: true, createdAt: true, showEmail: true, requestNote: true,
        hub: { select: { name: true } },
      },
    }),
    prisma.task.findMany({ where: { createdById: userId } }),
    prisma.task.findMany({ where: { assignedToId: userId }, select: { id: true, title: true, dueDate: true } }),
    prisma.deadline.findMany({ where: { createdById: userId } }),
    // Includes work shifts recorded *for* this person by someone else.
    prisma.event.findMany({ where: { OR: [{ createdById: userId }, { personId: userId }] } }),
    prisma.budgetEntry.findMany({ where: { OR: [{ createdById: userId }, { paidById: userId }] } }),
    prisma.specialDate.findMany({ where: { createdById: userId } }),
    prisma.trip.findMany({ where: { createdById: userId }, include: { items: true } }),
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
    prisma.quickFavorite.findMany({ where: { createdById: userId } }),
    // The whole ledger, revoked rows included — it is the record of what they
    // agreed to and when.
    prisma.consent.findMany({
      where: { userId },
      select: { kind: true, hubId: true, grantedAt: true, revokedAt: true, policyVersion: true },
      orderBy: { grantedAt: "asc" },
    }),
    // The feed lines about what they did (kept 90 days). Lines by other
    // people are not theirs, even where they were thanked or assigned.
    prisma.activity.findMany({
      where: { actorId: userId },
      select: {
        verb: true, entityType: true, summary: true, amountCents: true,
        visibility: true, createdAt: true, hub: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    // What they wrote in chats, and their conversations with the assistant
    // (both sides: the replies were written for them). Other people's
    // messages in shared chats are theirs, not this person's.
    prisma.chatMessage.findMany({
      where: {
        OR: [
          { authorId: userId },
          { role: "ASSISTANT", conversation: { kind: "AI", createdById: userId } },
        ],
      },
      select: {
        role: true, body: true, createdAt: true, editedAt: true, hidden: true,
        conversation: { select: { kind: true, title: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.creditWallet.findUnique({
      where: { userId },
      select: { balanceMillicents: true, monthlyLimitCents: true, welcomeGrantedAt: true, createdAt: true },
    }),
    prisma.creditEntry.findMany({
      where: { userId },
      select: {
        kind: true, amountMillicents: true, feature: true, model: true,
        inputTokens: true, outputTokens: true, note: true, createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
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
    specialDates,
    trips,
    subscriptions,
    debts,
    debtShares,
    mailAccounts,
    pushSubscriptions,
    notificationPref,
    quickFavorites,
    consents,
    activity,
    chatMessages,
    creditWallet,
    creditEntries,
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
    select: { backgroundImageUrl: true, avatarUrl: true },
  });
  // Cleared on the row first, then each file deleted only if nothing else
  // points at it: a stored URL is any file on our Blob host, so a blind del()
  // could take someone else's photo with it (see lib/blob-delete.ts).
  if (me?.backgroundImageUrl || me?.avatarUrl) {
    await prisma.user.update({ where: { id: userId }, data: { backgroundImageUrl: null, avatarUrl: null } });
    await deleteBlobIfUnreferenced(me.backgroundImageUrl);
    await deleteBlobIfUnreferenced(me.avatarUrl);
  }

  // Their PRIVATE items. Nobody else can see them, so handing them to the
  // tombstone below would keep personal data that no one can ever reach or
  // erase: under Law 25 erasure they go. Photos pinned to those tasks go too.
  const privatePhotos = await prisma.task.findMany({
    where: { createdById: userId, visibility: "PRIVATE", imageUrl: { not: null } },
    select: { imageUrl: true },
  });
  // Private trips take their cover and item photos with them.
  const privateTrips = await prisma.trip.findMany({
    where: { createdById: userId, visibility: "PRIVATE" },
    select: { coverImageUrl: true, items: { where: { imageUrl: { not: null } }, select: { imageUrl: true } } },
  });
  const privateTripPhotos = privateTrips.flatMap((t) => [t.coverImageUrl, ...t.items.map((i) => i.imageUrl)]);
  await prisma.$transaction([
    prisma.task.deleteMany({ where: { createdById: userId, visibility: "PRIVATE" } }),
    prisma.deadline.deleteMany({ where: { createdById: userId, visibility: "PRIVATE" } }),
    prisma.event.deleteMany({ where: { createdById: userId, visibility: "PRIVATE" } }),
    prisma.specialDate.deleteMany({ where: { createdById: userId, visibility: "PRIVATE" } }),
    prisma.trip.deleteMany({ where: { createdById: userId, visibility: "PRIVATE" } }),
    // Their assistant conversations (the replies go with them) and every
    // message they wrote to other people. Like their activity lines, a
    // message is theirs to erase, not to leave behind unsigned.
    prisma.conversation.deleteMany({ where: { kind: "AI", createdById: userId } }),
    prisma.chatMessage.deleteMany({ where: { authorId: userId } }),
  ]);

  const ownedHubs = await prisma.hubMembership.findMany({
    where: { userId, role: "OWNER" },
    select: { hubId: true },
  });
  const blobsToDelete = [
    ...privatePhotos.map((p) => p.imageUrl!),
    ...privateTripPhotos.filter((u): u is string => !!u),
  ];

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
      // Sole member: the hub and everything in it was only ever theirs,
      // including its cover photo and any photos pinned to its tasks.
      const hub = await prisma.hub.findUnique({ where: { id: hubId }, select: { coverImageUrl: true } });
      if (hub?.coverImageUrl) blobsToDelete.push(hub.coverImageUrl);
      const photos = await prisma.task.findMany({
        where: { hubId, imageUrl: { not: null } },
        select: { imageUrl: true },
      });
      blobsToDelete.push(...photos.map((p) => p.imageUrl!));
      const trips = await prisma.trip.findMany({
        where: { hubId },
        select: { coverImageUrl: true, items: { where: { imageUrl: { not: null } }, select: { imageUrl: true } } },
      });
      for (const tr of trips) {
        if (tr.coverImageUrl) blobsToDelete.push(tr.coverImageUrl);
        blobsToDelete.push(...tr.items.map((i) => i.imageUrl!));
      }
      await prisma.hub.delete({ where: { id: hubId } });
      report.hubsDeleted++;
    }
  }

  // Repoint the Restrict'd authorship links. Hub.createdById is included
  // because a hub handed to someone else still records who made it. The
  // plain member-id columns (who paid, whose shift, who's on a trip task) have
  // no FK to cascade, so they're severed explicitly in the same transaction.
  const [t, d, e, b, sd, tr, h, paid, shifts, tripTasks, travellers] = await prisma.$transaction([
    prisma.task.updateMany({ where: { createdById: userId }, data: { createdById: ghostId } }),
    prisma.deadline.updateMany({ where: { createdById: userId }, data: { createdById: ghostId } }),
    prisma.event.updateMany({ where: { createdById: userId }, data: { createdById: ghostId } }),
    prisma.budgetEntry.updateMany({ where: { createdById: userId }, data: { createdById: ghostId } }),
    prisma.specialDate.updateMany({ where: { createdById: userId }, data: { createdById: ghostId } }),
    prisma.trip.updateMany({ where: { createdById: userId }, data: { createdById: ghostId } }),
    prisma.hub.updateMany({ where: { createdById: userId }, data: { createdById: ghostId } }),
    prisma.budgetEntry.updateMany({ where: { paidById: userId }, data: { paidById: ghostId } }),
    prisma.event.updateMany({ where: { personId: userId }, data: { personId: ghostId } }),
    prisma.tripItem.updateMany({ where: { assignedToId: userId }, data: { assignedToId: null } }),
    // An array column, which updateMany can't edit element-wise.
    prisma.$executeRaw`UPDATE "Trip" SET "travelerIds" = array_remove("travelerIds", ${userId}) WHERE ${userId} = ANY("travelerIds")`,
    // The activity feed. Their own lines are destroyed (also what the cascade
    // from User would do — explicit so it doesn't depend on it); in other
    // people's lines they are removed as the assignee and from the thanks.
    prisma.activity.deleteMany({ where: { actorId: userId } }),
    prisma.activity.updateMany({ where: { targetId: userId }, data: { targetId: null } }),
    prisma.$executeRaw`UPDATE "Activity" SET "thankedById" = array_remove("thankedById", ${userId}) WHERE ${userId} = ANY("thankedById")`,
  ]);
  // Blobs live outside Postgres; best-effort, like the background above.
  if (blobsToDelete.length) {
    try {
      await del(blobsToDelete);
    } catch {
      // Already gone or unreachable — not worth failing the erasure over.
    }
  }

  report.authorshipAnonymised =
    t.count + d.count + e.count + b.count + sd.count + tr.count + h.count +
    paid.count + shifts.count + tripTasks.count + travellers;

  // Everything else — memberships (and join requests), debts, debt shares,
  // mail accounts, push subscriptions, notification prefs, sessions, auth
  // accounts, the consent ledger, their Claude credit wallet and ledger, chat
  // seats, invitations they sent and pending address
  // changes — is onDelete: Cascade from User, so this removes them. Who
  // invited whom (User.invitedById, HubMembership.invitedById,
  // AppInvite.usedById) is SetNull: the other person's account stays. Subscriptions and
  // assigned tasks are SetNull, which is what we want: the row survives in
  // the hub without pointing at a person.
  await prisma.user.delete({ where: { id: userId } });

  return report;
}
