import type { Lang } from "@/lib/i18n";
import { Tr } from "@/components/Tr";
import { QuickAddAction } from "@/components/QuickAddAction";

/**
 * Empty state that invites one thing: add something. A headline in the app's
 * own voice, one line of help, then the action — "Say it" / "Type it", both
 * of which hand off to the quick-add composer at the top of the app — and,
 * quietly underneath, the example phrases that composer understands.
 *
 * `headline` is one of the few places the display serif is allowed (see
 * `.display` in globals.css). An empty screen is the app talking to a person
 * who has nothing to do yet — the one moment where a warmer voice is the
 * point rather than decoration. The examples stay in the interface sans,
 * because they are literal strings to copy, not prose.
 *
 * No illustration: a drawing would be the loudest thing on a screen whose
 * whole message is "nothing needs you".
 */
export function EmptyState({
  headline,
  title,
  examples,
  action = true,
}: {
  /** Short, in the app's voice. Falls back to a neutral line. */
  headline?: string;
  title: string;
  examples: string[];
  /** Show the "Say it / Type it" buttons. Off where adding makes no sense. */
  action?: boolean;
}) {
  return (
    <div className="card empty-state px-5 py-8 text-center">
      <p className="display text-[1.375rem] leading-tight">{headline ?? <Tr k="Nothing here yet." />}</p>
      <p className="mx-auto mt-2 max-w-[34ch] text-sm text-[var(--color-text-dim)]">{title}</p>
      {action && <QuickAddAction />}
      {examples.length > 0 && (
        <>
          <p className="mt-6 text-[0.6875rem] font-bold uppercase tracking-[0.06em] text-[var(--color-text-dim)]">
            <Tr k="For example" />
          </p>
          <ul className="mx-auto mt-2 max-w-xs space-y-1.5 text-left">
            {examples.map((e) => (
              <li
                key={e}
                className="rounded-xl bg-[var(--color-surface-2)] px-3.5 py-2 text-[0.8125rem] text-[var(--color-text-dim)]"
              >
                “{e}”
              </li>
            ))}
          </ul>
        </>
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
