import Link from "next/link";

import { listTasks, listVentures } from "@/lib/data";
import { requireUser } from "@/lib/session";
import { TaskListCard } from "@/components/TaskListCard";
import { EmptyState, QUICK_ADD_EXAMPLES } from "@/components/EmptyState";

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
  const user = await requireUser();
  const ventures = await listVentures();

  const includeDone = sp.show === "all";
  const mine = sp.mine === "1";

  const tasks = await listTasks({
    ventureSlug: sp.venture,
    mineUserId: mine ? user.id : undefined,
    includeDone,
  });

  return (
    <div className="space-y-3 p-3">
      <h1 className="text-lg font-bold">Tasks</h1>

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
