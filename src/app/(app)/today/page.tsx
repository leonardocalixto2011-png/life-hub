import Link from "next/link";
import { format } from "date-fns";

import { todayView } from "@/lib/data";
import { TaskListCard } from "@/components/TaskListCard";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const { overdue, today, upcoming, undatedCount } = await todayView();
  const nothing = overdue.length + today.length + upcoming.length === 0;

  return (
    <div className="space-y-5 p-3">
      <div>
        <h1 className="text-lg font-bold">Today</h1>
        <p className="text-xs text-[var(--color-text-dim)]">
          {format(new Date(), "EEEE, MMM d")}
        </p>
      </div>

      {nothing && (
        <div className="card p-6 text-center text-sm text-[var(--color-text-dim)]">
          Nothing due. Add a task above, or check{" "}
          <Link href="/tasks" className="font-semibold text-[var(--color-primary)]">
            all tasks
          </Link>
          .
        </div>
      )}

      {overdue.length > 0 && (
        <section>
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-danger)]">
            Overdue · {overdue.length}
          </h2>
          <TaskListCard tasks={overdue} />
        </section>
      )}

      {today.length > 0 && (
        <section>
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
            Due today · {today.length}
          </h2>
          <TaskListCard tasks={today} />
        </section>
      )}

      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
            Next 7 days · {upcoming.length}
          </h2>
          <TaskListCard tasks={upcoming} />
        </section>
      )}

      {undatedCount > 0 && (
        <Link
          href="/tasks"
          className="block text-center text-xs font-semibold text-[var(--color-text-dim)]"
        >
          + {undatedCount} task{undatedCount === 1 ? "" : "s"} with no due date
        </Link>
      )}
    </div>
  );
}
