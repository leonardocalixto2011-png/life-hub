import Link from "next/link";
import { CalendarClock, CircleCheck, type LucideIcon } from "lucide-react";
import { isSameDay } from "date-fns";

import { requireUser, listMyHubs } from "@/lib/session";
import { withHub } from "@/lib/hub-context";
import { myItemsInHub, type MyItem } from "@/lib/data";
import { getLang, getT } from "@/lib/i18n-server";
import { fmtDay } from "@/lib/i18n";
import { daysUntil } from "@/lib/format";
import { VentureChip } from "@/components/VentureChip";

export const dynamic = "force-dynamic";

const KIND_ICON: Record<MyItem["kind"], LucideIcon> = {
  task: CircleCheck,
  deadline: CalendarClock,
};

function Row({ item, showHub }: { item: MyItem; showHub: boolean }) {
  const Icon = KIND_ICON[item.kind];
  return (
    <Link href={item.href} className="row">
      <span className="icon-tile" aria-hidden>
        <Icon size={17} strokeWidth={2} />
      </span>
      <div className="row-main">
        <span className="row-title">{item.title}</span>
        {/* The hub chip only tells items apart when there's more than one hub. */}
        {(showHub || item.venture) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {showHub && (
              <span className="chip" style={{ borderColor: item.hub.color, color: item.hub.color }}>
                {item.hub.name}
              </span>
            )}
            {item.venture && <VentureChip name={item.venture.name} color={item.venture.color} />}
          </div>
        )}
      </div>
    </Link>
  );
}

export default async function MinePage() {
  const user = await requireUser();
  const [t, lang] = await Promise.all([getT(), getLang()]);
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
    <div className="page">
      <div className="px-1">
        <h1 className="page-title">{t("Mine")}</h1>
        <p className="page-sub">
          {hubs.length === 1
            ? t("Assigned to you in this hub.")
            : t("Assigned to you, across all {n} of your hubs.", { n: hubs.length })}
        </p>
      </div>

      {items.length === 0 && (
        <p className="card px-5 py-8 text-center text-sm text-[var(--color-text-dim)]">
          {t("Nothing assigned to you right now.")}
        </p>
      )}

      {overdue.length > 0 && (
        <section>
          <h2 className="section-title text-[var(--color-danger)]">
            {t("Overdue")} · {overdue.length}
          </h2>
          <div className="list">
            {overdue.map((i) => (
              <Row key={`${i.hub.id}-${i.kind}-${i.id}`} item={i} showHub={hubs.length > 1} />
            ))}
          </div>
        </section>
      )}

      {days.map(({ date, items: dayItems }) => (
        <section key={date.toISOString()}>
          <h2 className="section-title">
            {isSameDay(date, now) ? t("Today") : fmtDay(date, lang)}
          </h2>
          <div className="list">
            {dayItems.map((i) => (
              <Row key={`${i.hub.id}-${i.kind}-${i.id}`} item={i} showHub={hubs.length > 1} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
