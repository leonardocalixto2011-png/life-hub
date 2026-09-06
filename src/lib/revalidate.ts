import { revalidatePath } from "next/cache";

/**
 * Every route that renders hub content.
 *
 * Actions used to hand-pick paths per entity, which went stale constantly:
 * the aggregate views each read from several models (/today = tasks +
 * deadlines + events + subs + debts + budget, /money's forecast = subs +
 * debts + open task amounts, /agenda = tasks + deadlines + events), so a
 * write to any one model can move a number on a page that model's action
 * never thought to invalidate. Editing a subscription's cost, for instance,
 * only revalidated /subscriptions while /money's "recurring commitments"
 * total kept showing the old figure.
 *
 * Pages are all `force-dynamic`, so this is about Next's client-side Router
 * Cache (which holds visited RSC payloads for ~30s), not the data cache —
 * marking the whole set is cheap and removes the entire class of bug.
 */
const CONTENT_PATHS = [
  "/",
  "/today",
  "/agenda",
  "/tasks",
  "/deadlines",
  "/calendar",
  "/subscriptions",
  "/debts",
  "/money",
  "/inbox",
] as const;

/** Invalidate every content route, plus any detail pages passed in. */
export function revalidateContent(...extra: string[]): void {
  for (const p of CONTENT_PATHS) revalidatePath(p);
  for (const p of extra) revalidatePath(p);
}
