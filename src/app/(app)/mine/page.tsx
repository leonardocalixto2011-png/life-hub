import Link from "next/link";
import { format, isSameDay } from "date-fns";

import { requireUser, listMyHubs } from "@/lib/session";
import { withHub } from "@/lib/hub-context";
import { myItemsInHub, type MyItem } from "@/lib/data";
import { daysUntil } from "@/lib/format";
import { VentureChip } from "@/components/VentureChip";

export const dynamic = "force-dynamic";

const KIND_ICON: Record<MyItem["kind"], string> = {
  task: "✓",
  deadline: "⏳",
  event: "📅",
};

function Row({ item }: { item: MyItem }) {
  return (
    <Link href={item.href} className="flex items-start gap-3 px-3 py-2.5">
      <span className="mt-0.5 w-4 shrink-0 text-center text-sm">{KIND_ICON[item.kind]}</span>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-[0.95rem]">{item.title}</span>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span
            className="chip"
            style={{ borderColor: item.hub.color, color: item.hub.color }}
          >
            {item.hub.name}
          </span>
          {item.venture && <VentureChip name={item.venture.name} color={item.venture.color} />}
        </div>
      </div>
    </Link>
  );
}

export default async function MinePage() {
  const user = await requireUser();
  const hubs = await listMyHubs(user.id);

  const perHub = await withHub(user.id, (tx) =>
    Promise.all(hubs.map((hub) => myItemsInHub(tx, hub.id, user.id).then((items) => ({ hub, items })))),
  );

  const items: MyItem[] = perHub
    .flatMap(({ hub, items }) => items.map((it): MyItem => ({ ...it, hub })))
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const now = new Date();
  const overdue = items.filter((i) => daysUntil(i.at) < 0);
  const upcoming = items.filter((i) => daysUntil(i.at) >= 0);

  const days: { date: Date; items: MyItem[] }[] = [];
  for (const it of upcoming) {
    const last = days[days.length - 1];
    if (last && isSameDay(last.date, it.at)) last.items.push(it);
    else days.push({ date: it.at, items: [it] });
  }

  return (
    <div className="space-y-4 p-3">
      <div>
        <h1 className="text-lg font-bold">Mine</h1>
        <p className="text-xs text-[var(--color-text-dim)]">
          Assigned to you, across all {hubs.length} of your hub{hubs.length === 1 ? "" : "s"}.
        </p>
      </div>

      {items.length === 0 && (
        <p className="card p-6 text-center text-sm text-[var(--color-text-dim)]">
          Nothing assigned to you right now.
        </p>
      )}

      {overdue.length > 0 && (
        <section>
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-danger)]">
            Overdue · {overdue.length}
          </h2>
          <div className="card divide-y divide-[var(--color-border)]">
            {overdue.map((i) => (
              <Row key={`${i.hub.id}-${i.kind}-${i.id}`} item={i} />
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
              <Row key={`${i.hub.id}-${i.kind}-${i.id}`} item={i} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
