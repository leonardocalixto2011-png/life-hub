/**
 * Empty state that teaches: a headline in the app's own voice, then the
 * example phrases the quick-add box actually parses.
 *
 * `headline` is one of the few places the display serif is allowed (see
 * `.display` in globals.css). An empty screen is the app talking to a person
 * who has nothing to do yet — the one moment where a warmer voice is the
 * point rather than decoration. The examples stay in the interface sans,
 * because they are literal strings to copy, not prose.
 */
export function EmptyState({
  headline,
  title,
  examples,
}: {
  /** Short, in the app's voice. Falls back to a neutral line. */
  headline?: string;
  title: string;
  examples: string[];
}) {
  return (
    <div className="card p-6 text-center">
      <p className="display text-xl leading-tight">{headline ?? "Nothing here yet."}</p>
      <p className="mx-auto mt-1.5 max-w-[34ch] text-sm text-[var(--color-text-dim)]">{title}</p>
      {examples.length > 0 && (
        <ul className="mx-auto mt-4 max-w-xs space-y-1.5 text-left">
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
