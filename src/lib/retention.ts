import { prisma } from "@/lib/prisma";

/**
 * Retention sweep, run from the daily digest cron (the only daily job this
 * deployment has). Schedule documented in DATA-INVENTORY.md §5.
 *
 * Review-inbox items hold parsed email — subject, a snippet, the sender's
 * address, amounts. Once an item is accepted its useful content already lives
 * on as the task/bill/event it became, and a discarded one is of no further
 * use, so neither needs to be kept. 90 days from the day the mail arrived,
 * whatever its status:
 *
 *   1. Still PENDING after 90 days → marked DISCARDED. Nobody is going to
 *      review a three-month-old bill, and this clears it from the inbox badge
 *      even if step 2 were to fail.
 *   2. Anything not PENDING and older than 90 days → deleted, row and parsed
 *      content together (which now includes what step 1 just expired).
 *
 * Trusted client: this spans every hub and runs with no session.
 */
export const REVIEW_RETENTION_DAYS = 90;

/**
 * The activity feed ("who did what") is a recent-history cue, not a record:
 * past 90 days a line is of no use to anyone and still names a person, so it
 * is deleted. Same job, same trusted client, same reasoning as above.
 */
export const ACTIVITY_RETENTION_DAYS = 90;

export async function pruneActivity(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - ACTIVITY_RETENTION_DAYS * 864e5);
  const { count } = await prisma.activity.deleteMany({ where: { createdAt: { lt: cutoff } } });
  return count;
}

export async function pruneReviewItems(
  now: Date = new Date(),
): Promise<{ expired: number; deleted: number }> {
  const cutoff = new Date(now.getTime() - REVIEW_RETENTION_DAYS * 864e5);

  const expired = await prisma.reviewItem.updateMany({
    where: { status: "PENDING", createdAt: { lt: cutoff } },
    data: { status: "DISCARDED", reviewedAt: now },
  });
  const deleted = await prisma.reviewItem.deleteMany({
    where: { status: { not: "PENDING" }, createdAt: { lt: cutoff } },
  });
  return { expired: expired.count, deleted: deleted.count };
}

/**
 * Unused sign-in links. Auth.js deletes a token when it is used, but one that
 * was never clicked stays forever, and its `identifier` is an email address.
 * Expired tokens can't sign anyone in, so they go at the next daily sweep.
 */
export async function pruneExpiredSignInTokens(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.verificationToken.deleteMany({ where: { expires: { lt: now } } });
  return count;
}

/**
 * Account-system leftovers (DATA-INVENTORY.md §5), all holding an email
 * address or a person's link to a hub they never joined:
 *
 *   - app invitations: deleted 30 days after they stopped being usable
 *     (used, cancelled or expired). The account they created keeps
 *     `invitedById`; the address typed into the invitation has no further use;
 *   - pending address changes past their hour;
 *   - hub invitations and join requests nobody answered in 60 days — the
 *     owner can invite again, the person can ask again;
 *   - accounts made by the old hub-invite flow for an address that never
 *     signed in, after 30 days: a User row was created the moment an owner
 *     typed an address, before that person agreed to anything. Only rows that
 *     provably never got used: never verified, never onboarded, no hub they
 *     are active in, nothing they authored.
 */
export const UNANSWERED_MEMBERSHIP_DAYS = 60;

export async function pruneAccountLeftovers(now: Date = new Date()) {
  const day = 864e5;
  const inviteCutoff = new Date(now.getTime() - 30 * day);
  const invites = await prisma.appInvite.deleteMany({
    where: {
      OR: [
        { usedAt: { lt: inviteCutoff } },
        { revokedAt: { lt: inviteCutoff } },
        { expiresAt: { lt: inviteCutoff } },
      ],
    },
  });
  const emailChanges = await prisma.emailChange.deleteMany({ where: { expiresAt: { lt: now } } });
  const memberships = await prisma.hubMembership.deleteMany({
    where: {
      status: { in: ["INVITED", "REQUESTED"] },
      createdAt: { lt: new Date(now.getTime() - UNANSWERED_MEMBERSHIP_DAYS * day) },
    },
  });
  const ghosts = await prisma.user.deleteMany({
    where: {
      email: { not: null },
      role: "MEMBER",
      emailVerified: null,
      onboardedAt: null,
      createdAt: { lt: inviteCutoff },
      accounts: { none: {} },
      hubMemberships: { none: { status: "ACTIVE" } },
      createdHubs: { none: {} },
      createdTasks: { none: {} },
      createdDeadlines: { none: {} },
      createdEvents: { none: {} },
      budgetEntries: { none: {} },
      specialDates: { none: {} },
      trips: { none: {} },
    },
  });
  return {
    invites: invites.count,
    emailChanges: emailChanges.count,
    memberships: memberships.count,
    neverUsedAccounts: ghosts.count,
  };
}
