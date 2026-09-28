/**
 * App-level mirror of the Task/Deadline/Event RLS privacy clause
 * (`visibility = 'SHARED' OR createdById = app.user_id`), for write actions.
 * Same rule as `visibilityFilter` in lib/data.ts (reads) — kept as its own
 * tiny module so actions can pin their `where` without importing data.ts.
 * Keep in sync with prisma/migrations/*_multihub_rls.
 */
export function visibleTo(userId: string) {
  return { OR: [{ visibility: "SHARED" as const }, { createdById: userId }] };
}
