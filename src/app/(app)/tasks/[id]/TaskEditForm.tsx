"use client";

import { Trash2 } from "lucide-react";

import { deleteTask, updateTask } from "@/app/(app)/tasks/actions";
import { DangerZone, FormSection } from "@/components/Form";
import { ConfirmButton } from "@/components/ConfirmButton";
import { useSheetAction } from "@/components/EditSheet";
import { PrivacyToggle } from "@/components/PrivacyToggle";
import { SubmitButton } from "@/components/SubmitButton";
import { useT } from "@/components/I18nProvider";
import { personName } from "@/lib/people";

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
  const inSheet = useSheetAction();
  return (
    <>
      <form action={inSheet(updateTask)} className="space-y-5">
        <input type="hidden" name="id" value={task.id} />

        <FormSection title={t("Details")}>
          <label className="field-label">
            {t("Title")}
            <input name="title" defaultValue={task.title} required className="field" />
          </label>
          <label className="field-label">
            {t("Notes")}
            <textarea name="notes" defaultValue={task.notes ?? ""} rows={3} className="field" />
          </label>
        </FormSection>

        <FormSection title={t("When")}>
          <div className="form-grid">
            <label className="field-label">
              {t("Due")}
              <input type="date" name="dueDate" defaultValue={task.dueDate} className="field" />
            </label>
            <label className="field-label">
              {t("Amount (if a bill)")}
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                name="amount"
                defaultValue={task.amount}
                placeholder="0.00"
                className="field"
              />
            </label>
          </div>
          <div className="flex items-center justify-between gap-3">
            <label className="check-row">
              <input type="checkbox" name="isRecurring" defaultChecked={task.isRecurring} />
              {t("Recurring")}
            </label>
            <select
              name="recurrence"
              aria-label={t("Repeats")}
              defaultValue={task.recurrence ?? "weekly"}
              className="field max-w-[11rem]"
            >
              <option value="weekly">{t("Weekly")}</option>
              <option value="monthly">{t("Monthly")}</option>
            </select>
          </div>
        </FormSection>

        <FormSection title={t("Who & priority")}>
          <label className="field-label">
            {t("Assignee")}
            <select name="assignedToId" defaultValue={task.assignedToId ?? ""} className="field">
              <option value="">{t("Shared / unassigned")}</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {personName(m, t("Member"))}
                </option>
              ))}
            </select>
          </label>
          <div className="form-grid">
            <label className="field-label">
              {t("Priority")}
              <select name="priority" defaultValue={task.priority} className="field">
                <option value="LOW">{t("Low")}</option>
                <option value="MED">{t("Medium")}</option>
                <option value="HIGH">{t("High")}</option>
              </select>
            </label>
            <label className="field-label">
              {t("Venture")}
              <select name="ventureId" defaultValue={task.ventureId ?? ""} className="field">
                <option value="">—</option>
                {ventures.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <PrivacyToggle defaultValue={task.visibility} />
        </FormSection>

        <SubmitButton className="btn btn-primary btn-lg w-full">{t("Save")}</SubmitButton>
      </form>

      <DangerZone>
        <form action={inSheet(deleteTask)}>
          <input type="hidden" name="id" value={task.id} />
          <ConfirmButton>
            <Trash2 size={16} strokeWidth={2} aria-hidden />
            {t("Delete task")}
          </ConfirmButton>
        </form>
      </DangerZone>
    </>
  );
}
