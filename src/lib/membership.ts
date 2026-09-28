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
