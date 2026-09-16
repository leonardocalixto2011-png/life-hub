import Link from "next/link";
import { Figure } from "@/components/Figure";
import { addDays, startOfDay } from "date-fns";

import { dashboard, hubChrome } from "@/lib/data";
import { listShifts, planHref, planItemsBetween } from "@/lib/plans";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { getLang, getT } from "@/lib/i18n-server";
import { fmt, fmtDay, fmtTime } from "@/lib/i18n";
import { countdownLabel, eventTimeRange, money } from "@/lib/format";
import { TaskListCard } from "@/components/TaskListCard";
import { VentureChip } from "@/components/VentureChip";
import { EmptyState, quickAddExamples } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

const SHORTCUTS = [
  { href: "/calendar", label: "Calendar", icon: "📅" },
  { href: "/schedule", label: "Schedules", icon: "🕐" },
  { href: "/trips", label: "Trips", icon: "✈️" },
  { href: "/calendar/dates", label: "Dates", icon: "🎂" },
  { href: "/agenda", label: "Agenda", icon: "📋" },
];

function SectionHead({ title, href, cta }: { title: string; href: string; cta: string }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between">
      <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
        {title}
      </h2>
      <Link href={href} className="text-[0.7rem] font-semibold text-[var(--color-primary)]">
        {cta}
      </Link>
    </div>
  );
}

export default async function DashboardPage() {
  const { user, hub } = await requireHub();
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const now = new Date();
  const todayStart = startOfDay(now);

  const [[d, plans, shifts], { ventures, members: membersRaw }] = await Promise.all([
    withHub(user.id, (tx) =>
      Promise.all([
        dashboard(tx, hub.id, user.id),
        planItemsBetween(tx, hub, user.id, now, addDays(todayStart, 21), lang),
        listShifts(tx, hub.id, user.id, todayStart, addDays(todayStart, 1)),
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
    <div className="space-y-5 p-3">
      <div>
        {/* The greeting is the app addressing a person by name — the clearest
            case for the display serif, and the first thing seen each morning. */}
        <h1 className="display text-2xl">
          {first ? t("Hi, {name}", { name: first }) : t("Today")}
        </h1>
        <p className="text-xs text-[var(--color-text-dim)]">
          {fmt(d.now, lang === "fr" ? "EEEE d MMMM" : "EEEE, MMMM d", lang)}
        </p>
      </div>

      <nav className="-mx-3 flex gap-1.5 overflow-x-auto px-3" aria-label={t("Plan")}>
        {SHORTCUTS.map((s) => (
          <Link key={s.href} href={s.href} className="chip shrink-0">
            {s.icon} {t(s.label)}
          </Link>
        ))}
      </nav>

      {nothing && (
        <EmptyState
          headline={t("All clear this week.")}
          title={t("Capture something — the box up top understands plain sentences:")}
          examples={quickAddExamples(lang)}
        />
      )}

      {shifts.length > 0 && (
        <section>
          <SectionHead title={t("Schedules today")} href="/schedule" cta={t("Week")} />
          <div className="card divide-y divide-[var(--color-border)]">
            {shifts.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="truncate">
                  {(s.personId && memberName.get(s.personId)) || s.title}
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--color-text-dim)]">
                  {fmtTime(s.startAt, lang)}–{fmtTime(s.endAt, lang)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {d.overdue.length > 0 && (
        <section>
          <SectionHead title={`${t("Overdue")} · ${d.overdue.length}`} href="/tasks" cta={t("All tasks")} />
          <TaskListCard tasks={d.overdue} ventures={vOpts} members={membersRaw} />
        </section>
      )}

      {d.dueSoon.length > 0 && (
        <section>
          <SectionHead title={t("Tasks this week")} href="/tasks" cta={t("All tasks")} />
          <TaskListCard tasks={d.dueSoon} ventures={vOpts} members={membersRaw} />
        </section>
      )}

      {d.events.length > 0 && (
        <section>
          <SectionHead title={t("This week")} href="/calendar" cta={t("Calendar")} />
          <div className="card divide-y divide-[var(--color-border)]">
            {d.events.map((e) => (
              <Link key={e.id} href={`/calendar/${e.id}`} className="block px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{e.title}</span>
                  <span className="shrink-0 text-xs text-[var(--color-text-dim)]">
                    {fmt(e.startAt, "EEE", lang)} · {eventTimeRange(e.startAt, e.endAt, lang)}
                  </span>
                </div>
                {e.venture && (
                  <div className="mt-1">
                    <VentureChip name={e.venture.name} color={e.venture.color} />
                  </div>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {comingUp.length > 0 && (
        <section>
          <SectionHead title={t("Coming up")} href="/calendar" cta={t("Calendar")} />
          <div className="card divide-y divide-[var(--color-border)]">
            {comingUp.map((p) => {
              const target = planHref(p);
              const body = (
                <>
                  <span className="min-w-0 truncate">
                    {p.emoji} {p.title}
                    {p.meta ? <span className="text-[var(--color-text-dim)]"> · {p.meta}</span> : null}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-[var(--color-text-dim)]">
                    {countdownLabel(p.date, lang)}
                    {p.planAhead ? <span className="text-[var(--color-primary)]"> · {t("plan")}</span> : null}
                  </span>
                </>
              );
              return target ? (
                <Link key={p.key} href={target} className="flex items-center justify-between gap-2 px-3 py-2.5">
                  {body}
                </Link>
              ) : (
                <div key={p.key} className="flex items-center justify-between gap-2 px-3 py-2.5">
                  {body}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {d.deadlines.length > 0 && (
        <section>
          <SectionHead title={t("Upcoming deadlines")} href="/deadlines" cta={t("All")} />
          <div className="card divide-y divide-[var(--color-border)]">
            {d.deadlines.map((x) => (
              <Link key={x.id} href={`/deadlines/${x.id}`} className="flex items-center justify-between px-3 py-2.5">
                <span className="truncate">{x.title}</span>
                <span className="shrink-0 text-xs font-semibold text-[var(--color-text-dim)]">
                  {countdownLabel(x.dueDate, lang)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {(d.renewals.length > 0 || d.cancelBys.length > 0) && (
        <section>
          <SectionHead title={t("Subscriptions")} href="/subscriptions" cta={t("All")} />
          <div className="card divide-y divide-[var(--color-border)]">
            {d.cancelBys.map((s) => (
              <Link key={`c${s.id}`} href={`/subscriptions/${s.id}`} className="flex items-center justify-between px-3 py-2.5">
                <span className="truncate">{s.name}</span>
                <span className="shrink-0 text-xs font-semibold text-[var(--color-danger)]">
                  {t("cancel by")} {countdownLabel(s.cancelByDate!, lang)}
                </span>
              </Link>
            ))}
            {d.renewals.map((s) => (
              <Link key={`r${s.id}`} href={`/subscriptions/${s.id}`} className="flex items-center justify-between px-3 py-2.5">
                <span className="truncate">{s.name}</span>
                <span className="shrink-0 text-xs text-[var(--color-text-dim)]">
                  {t("renews")} {countdownLabel(s.renewalDate, lang)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {d.debts.length > 0 && (
        <section>
          <SectionHead title={t("Payments due")} href="/debts" cta={t("All debts")} />
          <div className="card divide-y divide-[var(--color-border)]">
            {d.debts.map((x) => (
              <Link
                key={x.id}
                href={`/debts/${x.id}`}
                className="flex items-center justify-between px-3 py-2.5"
              >
                <span className="truncate">{x.name}</span>
                <span className="shrink-0 text-xs font-semibold text-[var(--color-text-dim)]">
                  {x.actualPaymentCents ?? x.minimumPaymentCents
                    ? `${money(x.actualPaymentCents ?? x.minimumPaymentCents!, currency, locale)} · `
                    : ""}
                  {countdownLabel(x.dueDate!, lang)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHead
          title={`${t("Budget")} · ${fmt(d.now, "MMMM", lang)}`}
          href="/budget"
          cta={t("Details")}
        />
        <div className="card grid grid-cols-3 divide-x divide-[var(--color-border)] p-0">
          <div className="p-3">
            <Figure cents={d.budget.income} currency={currency} locale={locale} label={t("in")} tone="ok" />
          </div>
          <div className="p-3">
            <Figure cents={d.budget.expense} currency={currency} locale={locale} label={t("out")} />
          </div>
          <div className="p-3">
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
