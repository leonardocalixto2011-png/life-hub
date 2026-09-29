import type { Lang } from "@/lib/i18n";
import { Tr } from "@/components/Tr";

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
    <div className="card px-5 py-8 text-center">
      <p className="display text-[1.375rem] leading-tight">{headline ?? <Tr k="Nothing here yet." />}</p>
      <p className="mx-auto mt-2 max-w-[34ch] text-sm text-[var(--color-text-dim)]">{title}</p>
      {examples.length > 0 && (
        <ul className="mx-auto mt-5 max-w-xs space-y-2 text-left">
          {examples.map((e) => (
            <li
              key={e}
              className="rounded-xl bg-[var(--color-surface-2)] px-3.5 py-2.5 text-sm text-[var(--color-text-dim)]"
            >
              “{e}”
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const EXAMPLES: Record<Lang, string[]> = {
  en: [
    "Pay Hydro-Québec $180 by Sept 15",
    "Renew Netflix Oct 3",
    "Call the accountant Friday 10am",
  ],
  fr: [
    "Payer Hydro-Québec 180 $ avant le 15 sept",
    "Renouveler Netflix le 3 oct",
    "Appeler le comptable vendredi 10 h",
  ],
};

/** The quick-add box parses either language, so the examples follow the person. */
export function quickAddExamples(lang: Lang): string[] {
  return EXAMPLES[lang];
}

export const QUICK_ADD_EXAMPLES = EXAMPLES.en;
