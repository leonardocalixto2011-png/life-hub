import Link from "next/link";
import { addDays, format, isSameDay, startOfDay } from "date-fns";

import { agendaItems, type AgendaItem } from "@/lib/data";
import { planHref, planItemsBetween } from "@/lib/plans";
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
  subscription: "🔁",
  debt: "🏦",
};

/** One timeline row — agenda items and plan items (holidays, dates, trips) alike. */
type Row = {
  key: string;
  icon: string;
  title: string;
  at: Date;
  href: string | null;
  allDay: boolean;
  venture: { name: string; color: string | null } | null;
  meta: string | null;
};

function RowView({ item }: { item: Row }) {
  const body = (
    <>
      <span className="mt-0.5 w-4 shrink-0 text-center text-sm">{item.icon}</span>
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
    </>
  );
  return item.href ? (
    <Link href={item.href} className="flex items-start gap-3 px-3 py-2.5">
      {body}
    </Link>
  ) : (
    <div className="flex items-start gap-3 px-3 py-2.5">{body}</div>
  );
}

export default async function AgendaPage() {
  const { user, hub } = await requireHub();
  const [{ now, items }, plans] = await withHub(user.id, (tx) =>
    Promise.all([
      agendaItems(tx, hub.id, user.id, 30),
      planItemsBetween(tx, hub, user.id, new Date(), addDays(startOfDay(new Date()), 30)),
    ]),
  );

  const rows: Row[] = [
    ...items.map((i) => ({
      key: `${i.kind}-${i.id}`,
      icon: KIND_ICON[i.kind],
      title: i.title,
      at: i.at,
      href: i.href,
      allDay: i.allDay,
      venture: i.venture,
      meta: i.meta,
    })),
    ...plans.map((p) => ({
      key: p.key,
      icon: p.emoji,
      title: p.title,
      at: p.date,
      href: planHref(p),
      allDay: true,
      venture: null,
      meta: p.meta,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  const overdue = rows.filter((i) => daysUntil(i.at) < 0);
  const upcoming = rows.filter((i) => daysUntil(i.at) >= 0);

  const days: { date: Date; items: Row[] }[] = [];
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
          Everything dated on one timeline · next 30 days
        </p>
      </div>

      {rows.length === 0 && (
        <EmptyState
          headline="A clear week ahead."
          title="Add something with a date — the box up top understands plain sentences:"
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
              <RowView key={i.key} item={i} />
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
              <RowView key={i.key} item={i} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
