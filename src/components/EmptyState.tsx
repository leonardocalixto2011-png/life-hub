/**
 * Empty state that teaches: a line of explanation plus a few example phrases the
 * quick-add / assistant box can parse.
 */
export function EmptyState({
  title,
  examples,
}: {
  title: string;
  examples: string[];
}) {
  return (
    <div className="card p-5 text-center">
      <p className="text-sm text-[var(--color-text-dim)]">{title}</p>
      {examples.length > 0 && (
        <ul className="mx-auto mt-3 max-w-xs space-y-1.5 text-left">
          {examples.map((e) => (
            <li
              key={e}
              className="rounded-lg bg-[var(--color-surface-2)] px-2.5 py-1.5 text-xs text-[var(--color-text-dim)]"
            >
              “{e}”
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const QUICK_ADD_EXAMPLES = [
  "Pay Hydro-Québec $180 by Sept 15",
  "Renew Netflix Oct 3",
  "Call the accountant Friday 10am",
];
