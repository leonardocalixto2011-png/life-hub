import Link from "next/link";
import { format } from "date-fns";

import { dashboard } from "@/lib/data";
import { getUser } from "@/lib/session";
import { countdownLabel, eventTimeRange, money } from "@/lib/format";
import { TaskListCard } from "@/components/TaskListCard";
import { VentureChip } from "@/components/VentureChip";
import { EmptyState, QUICK_ADD_EXAMPLES } from "@/components/EmptyState";

export const dynamic = "force-dynamic";

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
  const [user, d] = await Promise.all([getUser(), dashboard()]);
  const first = user?.name?.split(" ")[0];

  const nothing =
    d.overdue.length +
      d.dueSoon.length +
      d.deadlines.length +
      d.renewals.length +
      d.cancelBys.length +
      d.events.length ===
    0;

  return (
    <div className="space-y-5 p-3">
      <div>
        <h1 className="text-lg font-bold">
          {first ? `Hi, ${first}` : "Today"}
        </h1>
        <p className="text-xs text-[var(--color-text-dim)]">{format(d.now, "EEEE, MMMM d")}</p>
      </div>

      {nothing && (
        <EmptyState
          title="All clear this week. Capture something — the box up top understands plain sentences:"
          examples={QUICK_ADD_EXAMPLES}
        />
      )}

      {d.overdue.length > 0 && (
        <section>
          <SectionHead title={`Overdue · ${d.overdue.length}`} href="/tasks" cta="All tasks" />
          <TaskListCard tasks={d.overdue} />
        </section>
      )}

      {d.dueSoon.length > 0 && (
        <section>
          <SectionHead title="Tasks this week" href="/tasks" cta="All tasks" />
          <TaskListCard tasks={d.dueSoon} />
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

      <section>
        <SectionHead title={`Budget · ${format(d.now, "MMMM")}`} href="/money" cta="Details" />
        <div className="card grid grid-cols-3 divide-x divide-[var(--color-border)] p-0 text-center">
          <div className="p-3">
            <div className="text-sm font-bold tabular-nums text-[var(--color-ok)]">
              {money(d.budget.income)}
            </div>
            <div className="text-[0.58rem] uppercase tracking-wide text-[var(--color-text-dim)]">in</div>
          </div>
          <div className="p-3">
            <div className="text-sm font-bold tabular-nums">{money(d.budget.expense)}</div>
            <div className="text-[0.58rem] uppercase tracking-wide text-[var(--color-text-dim)]">out</div>
          </div>
          <div className="p-3">
            <div
              className="text-sm font-bold tabular-nums"
              style={{ color: d.budget.net < 0 ? "var(--color-danger)" : "var(--color-ok)" }}
            >
              {money(d.budget.net)}
            </div>
            <div className="text-[0.58rem] uppercase tracking-wide text-[var(--color-text-dim)]">net</div>
          </div>
        </div>
      </section>
    </div>
  );
}
