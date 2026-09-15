import Link from "next/link";
import { Figure } from "@/components/Figure";
import { addDays, format, startOfDay } from "date-fns";

import { dashboard, hubChrome } from "@/lib/data";
import { listShifts, planHref, planItemsBetween } from "@/lib/plans";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { countdownLabel, eventTimeRange, money } from "@/lib/format";
import { TaskListCard } from "@/components/TaskListCard";
import { VentureChip } from "@/components/VentureChip";
import { EmptyState, QUICK_ADD_EXAMPLES } from "@/components/EmptyState";

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
  const now = new Date();
  const todayStart = startOfDay(now);

  const [[d, plans, shifts], { ventures, members: membersRaw }] = await Promise.all([
    withHub(user.id, (tx) =>
      Promise.all([
        dashboard(tx, hub.id, user.id),
        planItemsBetween(tx, hub, user.id, now, addDays(todayStart, 21)),
        listShifts(tx, hub.id, user.id, todayStart, addDays(todayStart, 1)),
      ]),
    ),
    hubChrome(user.id, hub.id),
  ]);
  const first = user.name?.split(" ")[0];
  const vOpts = ventures.map((v) => ({ id: v.id, name: v.name }));
  const memberName = new Map(membersRaw.map((m) => [m.id, (m.name ?? m.email ?? "").split(/[\s@]/)[0]]));
  const comingUp = plans.slice(0, 6);

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
          {first ? `Hi, ${first}` : "Today"}
        </h1>
        <p className="text-xs text-[var(--color-text-dim)]">{format(d.now, "EEEE, MMMM d")}</p>
      </div>

      <nav className="-mx-3 flex gap-1.5 overflow-x-auto px-3" aria-label="Plan">
        {SHORTCUTS.map((s) => (
          <Link key={s.href} href={s.href} className="chip shrink-0">
            {s.icon} {s.label}
          </Link>
        ))}
      </nav>

      {nothing && (
        <EmptyState
          headline="All clear this week."
          title="Capture something — the box up top understands plain sentences:"
          examples={QUICK_ADD_EXAMPLES}
        />
      )}

      {shifts.length > 0 && (
        <section>
          <SectionHead title="Schedules today" href="/schedule" cta="Week" />
          <div className="card divide-y divide-[var(--color-border)]">
            {shifts.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="truncate">
                  {(s.personId && memberName.get(s.personId)) || s.title}
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--color-text-dim)]">
                  {format(s.startAt, "H:mm")}–{format(s.endAt, "H:mm")}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {d.overdue.length > 0 && (
        <section>
          <SectionHead title={`Overdue · ${d.overdue.length}`} href="/tasks" cta="All tasks" />
          <TaskListCard tasks={d.overdue} ventures={vOpts} members={membersRaw} />
        </section>
      )}

      {d.dueSoon.length > 0 && (
        <section>
          <SectionHead title="Tasks this week" href="/tasks" cta="All tasks" />
          <TaskListCard tasks={d.dueSoon} ventures={vOpts} members={membersRaw} />
        </section>
      )}

      {d.events.length > 0 && (
        <section>
          <SectionHead title="This week" href="/calendar" cta="Calendar" />
          <div className="card divide-y divide-[var(--color-border)]">
            {d.events.map((e) => (
              <Link key={e.id} href={`/calendar/${e.id}`} className="block px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{e.title}</span>
                  <span className="shrink-0 text-xs text-[var(--color-text-dim)]">
                    {format(e.startAt, "EEE")} · {eventTimeRange(e.startAt, e.endAt)}
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
          <SectionHead title="Coming up" href="/calendar" cta="Calendar" />
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
                    {countdownLabel(p.date)}
                    {p.planAhead ? <span className="text-[var(--color-primary)]"> · plan</span> : null}
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
          <SectionHead title="Upcoming deadlines" href="/deadlines" cta="All" />
          <div className="card divide-y divide-[var(--color-border)]">
            {d.deadlines.map((x) => (
              <Link key={x.id} href={`/deadlines/${x.id}`} className="flex items-center justify-between px-3 py-2.5">
                <span className="truncate">{x.title}</span>
                <span className="shrink-0 text-xs font-semibold text-[var(--color-text-dim)]">
                  {countdownLabel(x.dueDate)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {(d.renewals.length > 0 || d.cancelBys.length > 0) && (
        <section>
          <SectionHead title="Subscriptions" href="/subscriptions" cta="All" />
          <div className="card divide-y divide-[var(--color-border)]">
            {d.cancelBys.map((s) => (
              <Link key={`c${s.id}`} href={`/subscriptions/${s.id}`} className="flex items-center justify-between px-3 py-2.5">
                <span className="truncate">{s.name}</span>
                <span className="shrink-0 text-xs font-semibold text-[var(--color-danger)]">
                  cancel by {countdownLabel(s.cancelByDate!)}
                </span>
              </Link>
            ))}
            {d.renewals.map((s) => (
              <Link key={`r${s.id}`} href={`/subscriptions/${s.id}`} className="flex items-center justify-between px-3 py-2.5">
                <span className="truncate">{s.name}</span>
                <span className="shrink-0 text-xs text-[var(--color-text-dim)]">
                  renews {countdownLabel(s.renewalDate)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {d.debts.length > 0 && (
        <section>
          <SectionHead title="Payments due" href="/debts" cta="All debts" />
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
                    ? `${money(x.actualPaymentCents ?? x.minimumPaymentCents!)} · `
                    : ""}
                  {countdownLabel(x.dueDate!)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHead title={`Budget · ${format(d.now, "MMMM")}`} href="/budget" cta="Details" />
        <div className="card grid grid-cols-3 divide-x divide-[var(--color-border)] p-0">
          <div className="p-3">
            <Figure cents={d.budget.income} label="in" tone="ok" />
          </div>
          <div className="p-3">
            <Figure cents={d.budget.expense} label="out" />
          </div>
          <div className="p-3">
            <Figure
              cents={d.budget.net}
              label="net"
              tone={d.budget.net < 0 ? "danger" : "ok"}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
