import Link from "next/link";
import { format, isSameDay } from "date-fns";

import { agendaItems, type AgendaItem } from "@/lib/data";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { daysUntil } from "@/lib/format";
import { VentureChip } from "@/components/VentureChip";
import { EmptyState, QUICK_ADD_EXAMPLES } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

const KIND_ICON: Record<AgendaItem["kind"], string> = {
  task: "✓",
  deadline: "⏳",
  event: "📅",
};

function Row({ item }: { item: AgendaItem }) {
  return (
    <Link href={item.href} className="flex items-start gap-3 px-3 py-2.5">
      <span className="mt-0.5 w-4 shrink-0 text-center text-sm">{KIND_ICON[item.kind]}</span>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[0.95rem]">{item.title}</span>
        {(item.venture || item.meta || !item.allDay) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {!item.allDay && (
              <span className="text-[0.72rem] font-semibold text-[var(--color-text-dim)]">
                {format(item.at, "h:mm a")}
              </span>
            )}
            {item.venture && <VentureChip name={item.venture.name} color={item.venture.color} />}
            {item.meta && (
              <span className="truncate text-[0.72rem] text-[var(--color-text-dim)]">{item.meta}</span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}

export default async function AgendaPage() {
  const { user, hub } = await requireHub();
  const { now, items } = await withHub(user.id, (tx) => agendaItems(tx, hub.id, 30));

  const overdue = items.filter((i) => daysUntil(i.at) < 0);
  const upcoming = items.filter((i) => daysUntil(i.at) >= 0);

  const days: { date: Date; items: AgendaItem[] }[] = [];
  for (const it of upcoming) {
    const last = days[days.length - 1];
    if (last && isSameDay(last.date, it.at)) last.items.push(it);
    else days.push({ date: it.at, items: [it] });
  }

  return (
    <div className="space-y-4 p-3">
      <div>
        <h1 className="text-lg font-bold">Agenda</h1>
        <p className="text-xs text-[var(--color-text-dim)]">
          Tasks, deadlines and events on one timeline · next 30 days
        </p>
      </div>

      {items.length === 0 && (
        <EmptyState
          title="Nothing scheduled. Add something with a date — the box up top understands plain sentences:"
          examples={QUICK_ADD_EXAMPLES}
        />
      )}

      {overdue.length > 0 && (
        <section>
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-danger)]">
            Overdue · {overdue.length}
          </h2>
          <div className="card divide-y divide-[var(--color-border)]">
            {overdue.map((i) => (
              <Row key={`${i.kind}-${i.id}`} item={i} />
            ))}
          </div>
        </section>
      )}

      {days.map(({ date, items: dayItems }) => (
        <section key={date.toISOString()}>
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
            {isSameDay(date, now) ? "Today" : format(date, "EEEE, MMM d")}
          </h2>
          <div className="card divide-y divide-[var(--color-border)]">
            {dayItems.map((i) => (
              <Row key={`${i.kind}-${i.id}`} item={i} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
