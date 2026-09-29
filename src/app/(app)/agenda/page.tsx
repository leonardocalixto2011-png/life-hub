import Link from "next/link";
import { CalendarDays, CalendarClock, CircleCheck, Landmark, Repeat, type LucideIcon } from "lucide-react";
import { addDays, isSameDay, startOfDay } from "date-fns";

import { agendaItems, type AgendaItem } from "@/lib/data";
import { planHref, planItemsBetween } from "@/lib/plans";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { getLang, getT } from "@/lib/i18n-server";
import { fmtDay, fmtTime } from "@/lib/i18n";
import { daysUntil } from "@/lib/format";
import { VentureChip } from "@/components/VentureChip";
import { EmptyState, quickAddExamples } from "@/components/EmptyState";
import { PageHeader, SectionHeader } from "@/components/SectionHeader";

export const dynamic = "force-dynamic";

/** Line icons for the app's own kinds of item. Holidays, birthdays and trips
 *  keep their emoji — those are content (a cake is the occasion), not UI. */
const KIND_ICON: Record<AgendaItem["kind"], LucideIcon> = {
  task: CircleCheck,
  deadline: CalendarClock,
  event: CalendarDays,
  subscription: Repeat,
  debt: Landmark,
};

/** One timeline row — agenda items and plan items (holidays, dates, trips) alike. */
type Row = {
  key: string;
  icon: React.ReactNode;
  title: string;
  at: Date;
  href: string | null;
  allDay: boolean;
  venture: { name: string; color: string | null } | null;
  meta: string | null;
};

function RowView({ item, lang }: { item: Row; lang: "en" | "fr" }) {
  const body = (
    <>
      <span className="icon-tile" aria-hidden>
        {item.icon}
      </span>
      <div className="row-main">
        <span className="row-title">{item.title}</span>
        {(item.venture || item.meta || !item.allDay) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {!item.allDay && (
              <span className="text-xs font-semibold tabular-nums text-[var(--color-text-dim)]">
                {fmtTime(item.at, lang)}
              </span>
            )}
            {item.venture && <VentureChip name={item.venture.name} color={item.venture.color} />}
            {item.meta && (
              <span className="truncate text-xs text-[var(--color-text-dim)]">{item.meta}</span>
            )}
          </div>
        )}
      </div>
    </>
  );
  return item.href ? (
    <Link href={item.href} className="row">
      {body}
    </Link>
  ) : (
    <div className="row">{body}</div>
  );
}

export default async function AgendaPage() {
  const { user, hub } = await requireHub();
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const [{ now, items }, plans] = await withHub(user.id, (tx) =>
    Promise.all([
      agendaItems(tx, hub.id, user.id, 30),
      planItemsBetween(tx, hub, user.id, new Date(), addDays(startOfDay(new Date()), 30), lang),
    ]),
  );

  const rows: Row[] = [
    ...items.map((i) => ({
      key: `${i.kind}-${i.id}`,
      icon: (() => {
        const Icon = KIND_ICON[i.kind];
        return <Icon size={17} strokeWidth={2} />;
      })(),
      title:
        i.kind === "subscription"
          ? t("{name} renews", { name: i.title.replace(/ renews$/, "") })
          : i.kind === "debt"
            ? t("{name} payment", { name: i.title.replace(/ payment$/, "") })
            : i.title,
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
    <div className="page">
      <PageHeader title={t("Agenda")} sub={t("Everything dated on one timeline · next 30 days")} />

      {rows.length === 0 && (
        <EmptyState
          headline={t("A clear week ahead.")}
          title={t("Anything with a date lands here — say it or type it.")}
          examples={quickAddExamples(lang)}
        />
      )}

      {overdue.length > 0 && (
        <section>
          <SectionHeader title={`${t("Overdue")} · ${overdue.length}`} tone="danger" />
          <div className="list">
            {overdue.map((i) => (
              <RowView key={i.key} item={i} lang={lang} />
            ))}
          </div>
        </section>
      )}

      {days.map(({ date, items: dayItems }) => (
        <section key={date.toISOString()}>
          <SectionHeader
            title={
              isSameDay(date, now) ? (
                <span className="text-[var(--color-primary)]">{t("Today")}</span>
              ) : (
                fmtDay(date, lang)
              )
            }
          />
          <div className="list">
            {dayItems.map((i) => (
              <RowView key={i.key} item={i} lang={lang} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
