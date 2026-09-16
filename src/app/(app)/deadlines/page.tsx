import Link from "next/link";

import { hubChrome, listDeadlines, type DeadlineWithRefs } from "@/lib/data";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { getLang, getT } from "@/lib/i18n-server";
import type { Lang, T } from "@/lib/i18n";
import { daysUntil } from "@/lib/format";
import { Countdown } from "@/components/Countdown";
import { VentureChip } from "@/components/VentureChip";
import { DeadlineForm } from "./DeadlineForm";
import { toggleDeadlineDone } from "./actions";

export const dynamic = "force-dynamic";

function Row({ d, t, lang }: { d: DeadlineWithRefs; t: T; lang: Lang }) {
  const done = Boolean(d.doneAt);
  return (
    <div className="flex items-start gap-3 px-3 py-3">
      <form action={toggleDeadlineDone}>
        <input type="hidden" name="id" value={d.id} />
        <input type="hidden" name="done" value={String(!done)} />
        <button
          type="submit"
          aria-label={done ? t("Mark not done") : t("Mark done")}
          className="mt-0.5 grid h-5 w-5 place-items-center rounded-full border text-white"
          style={{
            borderColor: done ? "var(--color-ok)" : "var(--color-border)",
            background: done ? "var(--color-ok)" : "transparent",
          }}
        >
          {done ? "✓" : ""}
        </button>
      </form>

      <div className="min-w-0 flex-1">
        <Link
          href={`/deadlines/${d.id}`}
          className="block truncate font-medium"
          style={{
            textDecoration: done ? "line-through" : "none",
            color: done ? "var(--color-text-dim)" : "var(--color-text)",
          }}
        >
          {d.title}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {d.venture && <VentureChip name={d.venture.name} color={d.venture.color} />}
          {!done && d.remindDaysBefore.length > 0 && (
            <span className="text-[0.68rem] text-[var(--color-text-dim)]">
              {t("reminds {days}d before", { days: d.remindDaysBefore.join("/") })}
            </span>
          )}
        </div>
        {d.notes && (
          <p className="mt-1 line-clamp-2 text-xs text-[var(--color-text-dim)]">{d.notes}</p>
        )}
      </div>

      <Countdown date={d.dueDate} done={done} lang={lang} />
    </div>
  );
}

export default async function DeadlinesPage() {
  const { user, hub } = await requireHub();
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const [deadlines, { ventures }] = await Promise.all([
    withHub(user.id, (tx) => listDeadlines(tx, hub.id, user.id, { includeDone: true })),
    hubChrome(user.id, hub.id),
  ]);

  const open = deadlines.filter((d) => !d.doneAt);
  const done = deadlines.filter((d) => d.doneAt);
  const sections = [
    { title: t("Overdue"), items: open.filter((d) => daysUntil(d.dueDate) < 0) },
    { title: t("Next 7 days"), items: open.filter((d) => daysUntil(d.dueDate) >= 0 && daysUntil(d.dueDate) <= 7) },
    { title: t("Later"), items: open.filter((d) => daysUntil(d.dueDate) > 7) },
    { title: t("Done"), items: done },
  ];

  return (
    <div className="space-y-4 p-3">
      <h1 className="text-lg font-bold">{t("Deadlines")}</h1>

      <DeadlineForm ventures={ventures.map((v) => ({ id: v.id, name: v.name }))} />

      {deadlines.length === 0 && (
        <p className="card p-6 text-center text-sm text-[var(--color-text-dim)]">
          {t("No deadlines yet. Add filings, renewals, permits — anything with a hard date.")}
        </p>
      )}

      {sections.map(
        (s) =>
          s.items.length > 0 && (
            <section key={s.title}>
              <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
                {s.title} · {s.items.length}
              </h2>
              <div className="card divide-y divide-[var(--color-border)]">
                {s.items.map((d) => (
                  <Row key={d.id} d={d} t={t} lang={lang} />
                ))}
              </div>
            </section>
          ),
      )}
    </div>
  );
}
