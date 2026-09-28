import { prisma } from "@/lib/prisma";

/**
 * Throws unless `userId` is an ACTIVE member of `hubId`.
 *
 * For the columns that hold a plain member id with no foreign key into the
 * hub — `Task.assignedToId`, `Event.attendeeIds`, `Subscription.ownerId`,
 * `TripItem.assignedToId`, … RLS checks the *row's* hub, never whose id sits
 * in those fields, so without this a form could name anyone in the app.
 *
 * Trusted client on purpose: HubMembership's policy is self-row-only, so under
 * `withHub` this lookup would only ever find the viewer's own row (the same
 * trap `listMembers` fell into in production). INVITED doesn't count — an
 * unanswered invite is not "in this hub".
 */
export async function assertActiveMember(hubId: string, userId: string): Promise<void> {
  const m = await prisma.hubMembership.findUnique({
    where: { hubId_userId: { hubId, userId } },
    select: { status: true },
  });
  if (!m || m.status !== "ACTIVE") throw new Error("That person isn't a member of this hub.");
}

/**
 * Throws unless `ventureId` is null or a venture of `hubId`.
 *
 * `ventureId` arrives from forms and drafts as a bare id. Venture is its own
 * table with its own hub, and nothing ties a Task's (or Event's, Debt's…)
 * venture to the row's hub — so without this a crafted form could hang one
 * hub's content off another hub's venture, and the other hub's name and
 * colour would render back as a chip. Trusted client, like the member check
 * above: the question is about the venture row, not the viewer's reach.
 */
export async function assertVentureInHub(hubId: string, ventureId: string | null | undefined): Promise<void> {
  if (!ventureId) return;
  const v = await prisma.venture.findUnique({ where: { id: ventureId }, select: { hubId: true } });
  if (!v || v.hubId !== hubId) throw new Error("That venture isn't in this hub.");
}
