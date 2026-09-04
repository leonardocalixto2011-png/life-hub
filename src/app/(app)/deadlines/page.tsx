import Link from "next/link";

import { listDeadlines, listVentures, type DeadlineWithRefs } from "@/lib/data";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { daysUntil } from "@/lib/format";
import { Countdown } from "@/components/Countdown";
import { VentureChip } from "@/components/VentureChip";
import { DeadlineForm } from "./DeadlineForm";
import { toggleDeadlineDone } from "./actions";

export const dynamic = "force-dynamic";

function Row({ d }: { d: DeadlineWithRefs }) {
  const done = Boolean(d.doneAt);
  return (
    <div className="flex items-start gap-3 px-3 py-3">
      <form action={toggleDeadlineDone}>
        <input type="hidden" name="id" value={d.id} />
        <input type="hidden" name="done" value={String(!done)} />
        <button
          type="submit"
          aria-label={done ? "Mark not done" : "Mark done"}
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
              reminds {d.remindDaysBefore.join("/")}d before
            </span>
          )}
        </div>
        {d.notes && (
          <p className="mt-1 line-clamp-2 text-xs text-[var(--color-text-dim)]">{d.notes}</p>
        )}
      </div>

      <Countdown date={d.dueDate} done={done} />
    </div>
  );
}

function Section({ title, items }: { title: string; items: DeadlineWithRefs[] }) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
        {title} · {items.length}
      </h2>
      <div className="card divide-y divide-[var(--color-border)]">
        {items.map((d) => (
          <Row key={d.id} d={d} />
        ))}
      </div>
    </section>
  );
}

export default async function DeadlinesPage() {
  const { user, hub } = await requireHub();
  const [deadlines, ventures] = await withHub(user.id, (tx) =>
    Promise.all([listDeadlines(tx, hub.id, { includeDone: true }), listVentures(tx, hub.id)]),
  );

  const open = deadlines.filter((d) => !d.doneAt);
  const done = deadlines.filter((d) => d.doneAt);
  const overdue = open.filter((d) => daysUntil(d.dueDate) < 0);
  const soon = open.filter((d) => daysUntil(d.dueDate) >= 0 && daysUntil(d.dueDate) <= 7);
  const later = open.filter((d) => daysUntil(d.dueDate) > 7);

  return (
    <div className="space-y-4 p-3">
      <h1 className="text-lg font-bold">Deadlines</h1>

      <DeadlineForm ventures={ventures.map((v) => ({ id: v.id, name: v.name }))} />

      {deadlines.length === 0 && (
        <p className="card p-6 text-center text-sm text-[var(--color-text-dim)]">
          No deadlines yet. Add filings, renewals, permits — anything with a hard date.
        </p>
      )}

      <Section title="Overdue" items={overdue} />
      <Section title="Next 7 days" items={soon} />
      <Section title="Later" items={later} />
      <Section title="Done" items={done} />
    </div>
  );
}
