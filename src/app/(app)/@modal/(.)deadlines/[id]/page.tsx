import { getDeadline, hubChrome } from "@/lib/data";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { getLang, getT } from "@/lib/i18n-server";
import { countdownLabel, toDateInput } from "@/lib/format";
import { SheetTitle } from "@/components/EditSheet";
import { DeadlineForm } from "@/app/(app)/deadlines/DeadlineForm";

export const dynamic = "force-dynamic";

/** /deadlines/<id> in the edit sheet. Same data, same form as the full page. */
export default async function DeadlineSheet({ params }: { params: Promise<{ id: string }> }) {
  const { user, hub } = await requireHub();
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const { id } = await params;
  const [deadline, { ventures }] = await Promise.all([
    withHub(user.id, (tx) => getDeadline(tx, hub.id, user.id, id)),
    hubChrome(user.id, hub.id),
  ]);
  if (!deadline) return <SheetTitle title={t("Not found.")} />;

  return (
    <>
      <SheetTitle
        title={deadline.title}
        sub={deadline.doneAt ? t("Done") : countdownLabel(deadline.dueDate, lang)}
      />
      <DeadlineForm
        ventures={ventures.map((v) => ({ id: v.id, name: v.name }))}
        existing={{
          id: deadline.id,
          title: deadline.title,
          notes: deadline.notes,
          dueDate: toDateInput(deadline.dueDate),
          ventureId: deadline.ventureId,
          remindDaysBefore: deadline.remindDaysBefore,
          visibility: deadline.visibility,
        }}
      />
    </>
  );
}
