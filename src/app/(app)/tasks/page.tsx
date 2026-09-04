import Link from "next/link";

import {
  listMembers,
  listTasks,
  listVentures,
  recurringSuggestions,
} from "@/lib/data";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { TaskListCard } from "@/components/TaskListCard";
import { EmptyState, QUICK_ADD_EXAMPLES } from "@/components/EmptyState";
import { RecurringNudge } from "@/components/RecurringNudge";

export const dynamic = "force-dynamic";

type SP = { venture?: string; mine?: string; show?: string };

function qs(base: SP, patch: Partial<SP>): string {
  const merged = { ...base, ...patch };
  const p = new URLSearchParams();
  if (merged.venture) p.set("venture", merged.venture);
  if (merged.mine === "1") p.set("mine", "1");
  if (merged.show === "all") p.set("show", "all");
  const s = p.toString();
  return s ? `/tasks?${s}` : "/tasks";
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="chip"
      style={
        active
          ? { background: "var(--color-primary)", borderColor: "var(--color-primary)", color: "#fff" }
          : undefined
      }
    >
      {children}
    </Link>
  );
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const { user, hub } = await requireHub();
  const noFilters = !sp.venture && sp.mine !== "1" && sp.show !== "all";

  const includeDone = sp.show === "all";
  const mine = sp.mine === "1";

  const [ventures, members, suggestions, tasks] = await withHub(user.id, (tx) =>
    Promise.all([
      listVentures(tx, hub.id),
      listMembers(tx, hub.id),
      recurringSuggestions(tx, hub.id, user.id),
      listTasks(tx, hub.id, user.id, {
        ventureSlug: sp.venture,
        mineUserId: mine ? user.id : undefined,
        includeDone,
      }),
    ]),
  );

  return (
    <div className="space-y-3 p-3">
      <h1 className="text-lg font-bold">Tasks</h1>

      {noFilters && suggestions.length > 0 && (
        <RecurringNudge suggestions={suggestions} />
      )}

      <div className="flex flex-wrap gap-1.5">
        <Chip href={qs(sp, { venture: undefined })} active={!sp.venture}>
          All
        </Chip>
        {ventures.map((v) => (
          <Chip
            key={v.id}
            href={qs(sp, { venture: sp.venture === v.slug ? undefined : v.slug })}
            active={sp.venture === v.slug}
          >
            {v.name}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Chip href={qs(sp, { mine: mine ? undefined : "1" })} active={mine}>
          Mine
        </Chip>
        <Chip href={qs(sp, { show: includeDone ? undefined : "all" })} active={includeDone}>
          Show done
        </Chip>
      </div>

      <TaskListCard
        tasks={tasks}
        ventures={ventures.map((v) => ({ id: v.id, name: v.name }))}
        members={members}
        empty={
          mine ? (
            "No tasks assigned to you."
          ) : (
            <EmptyState
              title="No tasks yet. The box up top takes plain sentences:"
              examples={QUICK_ADD_EXAMPLES}
            />
          )
        }
      />
    </div>
  );
}
