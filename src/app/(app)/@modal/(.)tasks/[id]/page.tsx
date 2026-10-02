import { getTask, hubChrome } from "@/lib/data";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
import { toDateInput } from "@/lib/format";
import { centsToInput } from "@/lib/money";
import { personName } from "@/lib/people";
import { SheetTitle } from "@/components/EditSheet";
import { TaskEditForm } from "@/app/(app)/tasks/[id]/TaskEditForm";
import { TaskPhoto } from "@/app/(app)/tasks/[id]/TaskPhoto";

export const dynamic = "force-dynamic";

/** /tasks/<id> in the edit sheet. Same data, same form as the full page. */
export default async function TaskSheet({ params }: { params: Promise<{ id: string }> }) {
  const { user, hub } = await requireHub();
  const t = await getT();
  const { id } = await params;
  const [task, { ventures, members }] = await Promise.all([
    withHub(user.id, (tx) => getTask(tx, hub.id, user.id, id)),
    hubChrome(user.id, hub.id),
  ]);
  if (!task) return <SheetTitle title={t("Not found.")} />;

  return (
    <>
      <SheetTitle
        title={task.title}
        sub={t("Added by {name}", { name: personName(task.createdBy, t("Member")) })}
      />
      <TaskPhoto taskId={task.id} title={task.title} imageUrl={task.imageUrl} userId={user.id} />
      <TaskEditForm
        task={{
          id: task.id,
          title: task.title,
          notes: task.notes,
          ventureId: task.ventureId,
          assignedToId: task.assignedToId,
          dueDate: toDateInput(task.dueDate),
          amount: centsToInput(task.amountCents),
          priority: task.priority,
          isRecurring: task.isRecurring,
          recurrence: (task.recurrence as "weekly" | "monthly" | null) ?? null,
          visibility: task.visibility,
        }}
        ventures={ventures.map((v) => ({ id: v.id, name: v.name }))}
        members={members}
      />
    </>
  );
}
