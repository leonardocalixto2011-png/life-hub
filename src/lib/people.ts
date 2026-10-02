/**
 * How a hub member is named on screen. Plain module — server components,
 * client components and server actions all import it.
 *
 * Members see each other's NAME, not their email address (Law 25: an address
 * is personal information nobody needs in order to assign a task). The data
 * layer strips other people's addresses before they reach a component —
 * `listMembers` / `listHubRoster` in lib/data.ts — and returns one only for
 * the viewer themself, for a member who chose to show theirs in that hub, or
 * to the owner for a pending invite. So an `email` that does arrive here may
 * be shown; when there is neither a name nor an address the neutral fallback
 * is used. Never add a query that selects another person's email to "fix" a
 * blank name.
 */
export type PersonLike = { name?: string | null; email?: string | null } | null | undefined;

/** Pass the translated fallback: `personName(m, t("Member"))`. */
export function personName(p: PersonLike, fallback = "Member"): string {
  return p?.name?.trim() || p?.email || fallback;
}

/** First name only — for chips and compact rows. */
export function personFirstName(p: PersonLike, fallback = "Member"): string {
  const name = p?.name?.trim();
  if (name) return name.split(/\s+/)[0];
  if (p?.email) return p.email.split("@")[0];
  return fallback;
}
