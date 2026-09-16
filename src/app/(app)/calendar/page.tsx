import Link from "next/link";
import { endOfDay, format, isSameDay, startOfDay } from "date-fns";

import { hubChrome, listEvents, type EventWithRefs } from "@/lib/data";
import { planHref, planItemsBetween, type PlanItem } from "@/lib/plans";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { getLang, getT } from "@/lib/i18n-server";
import { fmtDay } from "@/lib/i18n";
import { EventForm } from "./EventForm";
import { CalendarList } from "./CalendarList";

export const dynamic = "force-dynamic";

type SP = { title?: string; date?: string };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const now = new Date();
  const from = startOfDay(now);
  const to = endOfDay(new Date(now.getTime() + 44 * 864e5)); // ~6 weeks out

  const { user, hub } = await requireHub();
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const [[events, plans], { ventures, members }] = await Promise.all([
    withHub(user.id, (tx) =>
      Promise.all([
        listEvents(tx, hub.id, user.id, { from, to }),
        planItemsBetween(tx, hub, user.id, from, to, lang),
      ]),
    ),
    hubChrome(user.id, hub.id),
  ]);

  // One slot per calendar day that has an event or a plan item. Day labels
  // are formatted here, on the server that also parsed the inputs, so the
  // list and the edit form can never disagree about which day something is.
  const byDay = new Map<string, { date: Date; items: EventWithRefs[]; plans: PlanItem[] }>();
  const slot = (d: Date) => {
    const k = format(d, "yyyy-MM-dd");
    let s = byDay.get(k);
    if (!s) {
      s = { date: startOfDay(d), items: [], plans: [] };
      byDay.set(k, s);
    }
    return s;
  };
  for (const e of events) slot(e.startAt).items.push(e);
  for (const p of plans) slot(p.date).plans.push(p);

  const days = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, s]) => ({
      key,
      label: isSameDay(s.date, now) ? t("Today") : fmtDay(s.date, lang),
      items: s.items,
      plans: s.plans.map((p) => ({
        key: p.key,
        label: `${p.emoji} ${p.title}${p.meta ? ` · ${p.meta}` : ""}`,
        href: planHref(p),
        planAhead: p.planAhead,
      })),
    }));

  // A valid ?date= from a "plan something" link pre-fills the form at 6 p.m.
  const prefill =
    sp.title || (sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date))
      ? {
          title: sp.title?.slice(0, 200) ?? "",
          startAt: sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? `${sp.date}T18:00` : "",
        }
      : undefined;

  return (
    <div className="space-y-4 p-3">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-bold">{t("Calendar")}</h1>
        <div className="flex gap-3 text-[0.7rem] font-semibold">
          <Link href="/calendar/dates" className="text-[var(--color-primary)]">
            🎂 {t("Special dates")}
          </Link>
          <Link href="/schedule" className="text-[var(--color-primary)]">
            🕐 {t("Schedules")}
          </Link>
        </div>
      </div>

      <EventForm
        key={prefill ? `${prefill.title}-${prefill.startAt}` : "new"}
        ventures={ventures.map((v) => ({ id: v.id, name: v.name }))}
        members={members}
        prefill={prefill}
      />

      {days.length === 0 && (
        <p className="card p-6 text-center text-sm text-[var(--color-text-dim)]">
          {t("Nothing in the next six weeks. Add an event above.")}
        </p>
      )}

      <CalendarList days={days} members={members} />
    </div>
  );
}
