import Link from "next/link";
import { CalendarDays, Cake, Clock, ListOrdered, Plane, type LucideIcon } from "lucide-react";
import { Figure } from "@/components/Figure";
import { addDays, startOfDay } from "date-fns";

import { dashboard, hubChrome, weekRecap } from "@/lib/data";
import { daypartOf } from "@/lib/daypart";
import { GreetingBand } from "@/components/GreetingBand";
import { WeekRecap } from "@/components/WeekRecap";
import { listShifts, planHref, planItemsBetween } from "@/lib/plans";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { getLang, getT } from "@/lib/i18n-server";
import { fmt, fmtTime } from "@/lib/i18n";
import { countdownLabel, eventTimeRange, money } from "@/lib/format";
import { TaskListCard } from "@/components/TaskListCard";
import { VentureChip } from "@/components/VentureChip";
import { EmptyState, quickAddExamples } from "@/components/EmptyState";
import { WeekStrip } from "@/components/viz/WeekStrip";
import { SectionHeader } from "@/components/SectionHeader";
import { DayCard } from "@/components/DayCard";

export const dynamic = "force-dynamic";

const SHORTCUTS: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: "/calendar", label: "Calendar", Icon: CalendarDays },
  { href: "/schedule", label: "Schedules", Icon: Clock },
  { href: "/trips", label: "Trips", Icon: Plane },
  { href: "/calendar/dates", label: "Dates", Icon: Cake },
  { href: "/agenda", label: "Agenda", Icon: ListOrdered },
];

export default async function DashboardPage() {
  const { user, hub } = await requireHub();
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const now = new Date();
  const todayStart = startOfDay(now);

  const [[d, plans, shifts, recap], { ventures, members: membersRaw }] = await Promise.all([
    withHub(user.id, (tx) =>
      Promise.all([
        dashboard(tx, hub.id, user.id, hub.currency),
        planItemsBetween(tx, hub, user.id, now, addDays(todayStart, 21), lang),
        listShifts(tx, hub.id, user.id, todayStart, addDays(todayStart, 1)),
        weekRecap(tx, hub.id, user.id, hub.currency),
      ]),
    ),
    hubChrome(user.id, hub.id),
  ]);
  const first = user.name?.split(" ")[0];
  const vOpts = ventures.map((v) => ({ id: v.id, name: v.name }));
  const memberName = new Map(membersRaw.map((m) => [m.id, (m.name ?? m.email ?? "").split(/[\s@]/)[0]]));
  const comingUp = plans.slice(0, 6);
  const currency = hub.currency;
  const locale = user.locale ?? "en-CA";

  const nothing =
    d.overdue.length +
      d.dueSoon.length +
      d.deadlines.length +
      d.renewals.length +
      d.cancelBys.length +
      d.events.length +
      d.debts.length +
      comingUp.length +
      shifts.length ===
    0;

  return (
    <div className="space-y-6 px-3 pb-8 pt-4">
      <GreetingBand
        daypart={daypartOf(d.now)}
        greeting={first ? t("Hi, {name}", { name: first }) : t("Today")}
        date={fmt(d.now, lang === "fr" ? "EEEE d MMMM" : "EEEE, MMMM d", lang)}
      />

      {/* Your day: today's progress ring plus up to three tappable figures. A
          .card, so it stays opaque and legible over a background photo
          without any [data-photo] special-casing. */}
      <DayCard day={d.day} currency={currency} locale={locale} t={t} />

      {/* Last week, looked back on once — first visit of a new week only. */}
      <WeekRecap
        data={recap}
        formatMoney={{ in: money(recap.inCents, currency, locale), out: money(recap.outCents, currency, locale) }}
      />

      <nav className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3" aria-label={t("Plan")}>
        {SHORTCUTS.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="chip chip-filter shrink-0">
            <Icon size={15} strokeWidth={2} aria-hidden />
            {t(label)}
          </Link>
        ))}
      </nav>

      <WeekStrip userId={user.id} hub={hub} lang={lang} />

      {nothing && (
        <EmptyState
          headline={t("All clear this week.")}
          title={t("Add something by voice 🎤 or in a few plain words.")}
          examples={quickAddExamples(lang)}
        />
      )}

      {shifts.length > 0 && (
        <section>
          <SectionHeader title={t("Schedules today")} href="/schedule" cta={t("Week")} />
          <div className="list">
            {shifts.map((s) => (
              <div key={s.id} className="row justify-between">
                <span className="row-title">
                  {(s.personId && memberName.get(s.personId)) || s.title}
                </span>
                <span className="row-end">
                  {fmtTime(s.startAt, lang)}–{fmtTime(s.endAt, lang)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {d.overdue.length > 0 && (
        <section>
          <SectionHeader title={`${t("Overdue")} · ${d.overdue.length}`} href="/tasks" cta={t("All tasks")} tone="danger" />
          <TaskListCard tasks={d.overdue} ventures={vOpts} members={membersRaw} />
        </section>
      )}

      {d.dueSoon.length > 0 && (
        <section>
          <SectionHeader title={t("Tasks this week")} href="/tasks" cta={t("All tasks")} />
          <TaskListCard tasks={d.dueSoon} ventures={vOpts} members={membersRaw} />
        </section>
      )}

      {d.events.length > 0 && (
        <section>
          <SectionHeader title={t("This week")} href="/calendar" cta={t("Calendar")} />
          <div className="list">
            {d.events.map((e) => (
              <Link key={e.id} href={`/calendar/${e.id}`} className="row">
                <span className="icon-tile" aria-hidden>
                  <CalendarDays size={17} strokeWidth={2} />
                </span>
                <div className="row-main">
                  <span className="row-title">{e.title}</span>
                  {e.venture && (
                    <div className="mt-1">
                      <VentureChip name={e.venture.name} color={e.venture.color} />
                    </div>
                  )}
                </div>
                <span className="row-end">
                  <span className="block first-letter:uppercase">{fmt(e.startAt, "EEE", lang)}</span>
                  <span className="block font-medium">{eventTimeRange(e.startAt, e.endAt, lang)}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {comingUp.length > 0 && (
        <section>
          <SectionHeader title={t("Coming up")} href="/calendar" cta={t("Calendar")} />
          <div className="list">
            {comingUp.map((p) => {
              const target = planHref(p);
              const body = (
                <>
                  <span className="icon-tile" aria-hidden>
                    {p.emoji}
                  </span>
                  <span className="row-main">
                    <span className="row-title">{p.title}</span>
                    {p.meta ? <span className="row-sub">{p.meta}</span> : null}
                  </span>
                  <span className="row-end">
                    {countdownLabel(p.date, lang)}
                    {p.planAhead ? <span className="text-[var(--color-primary)]"> · {t("plan")}</span> : null}
                  </span>
                </>
              );
              return target ? (
                <Link key={p.key} href={target} className="row">
                  {body}
                </Link>
              ) : (
                <div key={p.key} className="row">
                  {body}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {d.deadlines.length > 0 && (
        <section>
          <SectionHeader title={t("Upcoming deadlines")} href="/deadlines" cta={t("All")} />
          <div className="list">
            {d.deadlines.map((x) => (
              <Link key={x.id} href={`/deadlines/${x.id}`} className="row justify-between">
                <span className="row-title">{x.title}</span>
                <span className="row-end">
                  {countdownLabel(x.dueDate, lang)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {(d.renewals.length > 0 || d.cancelBys.length > 0) && (
        <section>
          <SectionHeader title={t("Subscriptions")} href="/subscriptions" cta={t("All")} />
          <div className="list">
            {d.cancelBys.map((s) => (
              <Link key={`c${s.id}`} href={`/subscriptions/${s.id}`} className="row justify-between">
                <span className="row-title">{s.name}</span>
                <span className="row-end text-[var(--color-danger)]">
                  {t("cancel by")} {countdownLabel(s.cancelByDate!, lang)}
                </span>
              </Link>
            ))}
            {d.renewals.map((s) => (
              <Link key={`r${s.id}`} href={`/subscriptions/${s.id}`} className="row justify-between">
                <span className="row-title">{s.name}</span>
                <span className="row-end font-medium">
                  {t("renews")} {countdownLabel(s.renewalDate, lang)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {d.debts.length > 0 && (
        <section>
          <SectionHeader title={t("Payments due")} href="/debts" cta={t("All debts")} />
          <div className="list">
            {d.debts.map((x) => {
              // The query has no lower bound, so a missed payment stays here —
              // flagged, rather than quietly dropping off the day after.
              const overdue = x.dueDate! < todayStart;
              return (
                <Link
                  key={x.id}
                  href={`/debts/${x.id}`}
                  className="row"
                >
                  <span className="row-main">
                    <span className="row-title">{x.name}</span>
                    <span
                      className="row-sub font-semibold"
                      style={overdue ? { color: "var(--color-danger)" } : undefined}
                    >
                      {overdue ? `${t("Overdue")} · ` : ""}
                      {countdownLabel(x.dueDate!, lang)}
                    </span>
                  </span>
                  {x.actualPaymentCents ?? x.minimumPaymentCents ? (
                    <span className="row-end row-amount">
                      {money(x.actualPaymentCents ?? x.minimumPaymentCents!, currency, locale)}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <SectionHeader
          title={`${t("Budget")} · ${fmt(d.now, "MMMM", lang)}`}
          href="/budget"
          cta={t("Details")}
        />
        <div className="card grid grid-cols-3 divide-x divide-[var(--color-border)] p-0">
          <div className="px-2 py-4">
            <Figure cents={d.budget.income} currency={currency} locale={locale} label={t("in")} tone="ok" />
          </div>
          <div className="px-2 py-4">
            <Figure cents={d.budget.expense} currency={currency} locale={locale} label={t("out")} />
          </div>
          <div className="px-2 py-4">
            <Figure
              cents={d.budget.net}
              currency={currency}
              locale={locale}
              label={t("net")}
              tone={d.budget.net < 0 ? "danger" : "ok"}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
