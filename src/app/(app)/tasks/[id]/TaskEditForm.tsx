"use client";

import { deleteTask, updateTask } from "@/app/(app)/tasks/actions";
import { PrivacyToggle } from "@/components/PrivacyToggle";
import { useT } from "@/components/I18nProvider";

type Option = { id: string; name: string | null; email?: string | null };

export function TaskEditForm({
  task,
  ventures,
  members,
}: {
  task: {
    id: string;
    title: string;
    notes: string | null;
    ventureId: string | null;
    assignedToId: string | null;
    dueDate: string; // yyyy-mm-dd or ""
    amount: string; // "12.50" or ""
    priority: "LOW" | "MED" | "HIGH";
    isRecurring: boolean;
    recurrence: "weekly" | "monthly" | null;
    visibility: "PRIVATE" | "SHARED";
  };
  ventures: { id: string; name: string }[];
  members: Option[];
}) {
  const t = useT();
  const label = "block text-xs font-semibold text-[var(--color-text-dim)]";
  return (
    <div className="space-y-4">
      <form action={updateTask} className="card space-y-3 p-4">
        <input type="hidden" name="id" value={task.id} />

        <label className={label}>
          {t("Title")}
          <input name="title" defaultValue={task.title} required className="field mt-1" />
        </label>

        <label className={label}>
          {t("Notes")}
          <textarea name="notes" defaultValue={task.notes ?? ""} rows={3} className="field mt-1" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className={label}>
            {t("Due")}
            <input type="date" name="dueDate" defaultValue={task.dueDate} className="field mt-1" />
          </label>
          <label className={label}>
            {t("Amount (if a bill)")}
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              name="amount"
              defaultValue={task.amount}
              placeholder="0.00"
              className="field mt-1"
            />
          </label>
          <label className={label}>
            {t("Priority")}
            <select name="priority" defaultValue={task.priority} className="field mt-1">
              <option value="LOW">{t("Low")}</option>
              <option value="MED">{t("Medium")}</option>
              <option value="HIGH">{t("High")}</option>
            </select>
          </label>
          <label className={label}>
            {t("Venture")}
            <select name="ventureId" defaultValue={task.ventureId ?? ""} className="field mt-1">
              <option value="">—</option>
              {ventures.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            {t("Assignee")}
            <select name="assignedToId" defaultValue={task.assignedToId ?? ""} className="field mt-1">
              <option value="">{t("Shared / unassigned")}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name ?? m.email}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-dim)]">
            <input type="checkbox" name="isRecurring" defaultChecked={task.isRecurring} />
            {t("Recurring")}
          </label>
          <select name="recurrence" defaultValue={task.recurrence ?? "weekly"} className="field max-w-[8rem]">
            <option value="weekly">{t("Weekly")}</option>
            <option value="monthly">{t("Monthly")}</option>
          </select>
        </div>

        <PrivacyToggle defaultValue={task.visibility} />

        <button type="submit" className="btn btn-primary w-full">
          {t("Save")}
        </button>
      </form>

      <form action={deleteTask}>
        <input type="hidden" name="id" value={task.id} />
        <button type="submit" className="btn w-full text-[var(--color-danger)]">
          {t("Delete task")}
        </button>
      </form>
    </div>
  );
}
