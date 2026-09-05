"use client";

import type { Draft, DraftKind } from "@/app/(app)/quick-actions";

const KIND_LABEL: Record<DraftKind, string> = {
  task: "Task",
  event: "Event",
  deadline: "Deadline",
  subscription: "Subscription",
  budget: "Budget",
  needs_reply: "Needs a reply",
};

const DATE_LABEL: Record<DraftKind, string> = {
  task: "Due",
  event: "Starts",
  deadline: "Due",
  subscription: "Renews",
  budget: "Date",
  needs_reply: "Received",
};

export function DraftCard({
  draft,
  ventures,
  onChange,
  onRemove,
}: {
  draft: Draft;
  ventures: { id: string; name: string }[];
  onChange: (patch: Partial<Draft>) => void;
  onRemove: () => void;
}) {
  const showAmount =
    draft.kind === "budget" || draft.kind === "subscription" || draft.kind === "task";
  const isNeedsReply = draft.kind === "needs_reply";

  return (
    <div className="card space-y-2 p-3">
      <div className="flex items-center gap-2">
        <select
          value={draft.kind}
          onChange={(e) => onChange({ kind: e.target.value as DraftKind })}
          className="chip"
          style={{ background: "var(--color-primary)", borderColor: "var(--color-primary)", color: "#fff" }}
          disabled={isNeedsReply}
        >
          {(Object.keys(KIND_LABEL) as DraftKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <input
          value={draft.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="field flex-1"
          aria-label="Title"
          disabled={isNeedsReply}
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Discard"
          className="text-[var(--color-text-dim)]"
        >
          ✕
        </button>
      </div>

      {isNeedsReply ? (
        <>
          {draft.note && (
            <p className="rounded-lg bg-[var(--color-surface)] p-2 text-xs text-[var(--color-text-dim)]">
              {draft.note}
            </p>
          )}
          <label className="block text-[0.7rem] font-semibold text-[var(--color-text-dim)]">
            Suggested reply — edit before sending it yourself, Life Hub never sends on your behalf
            <textarea
              value={draft.suggestedReply ?? ""}
              onChange={(e) => onChange({ suggestedReply: e.target.value })}
              rows={4}
              className="field mt-1"
              placeholder="No suggested reply — write your own."
            />
          </label>
        </>
      ) : (
      <div className="grid grid-cols-2 gap-2">
        {draft.kind === "event" ? (
          <label className="text-[0.7rem] font-semibold text-[var(--color-text-dim)]">
            {DATE_LABEL.event}
            <input
              type="datetime-local"
              value={draft.time ?? ""}
              onChange={(e) => onChange({ time: e.target.value || null })}
              className="field mt-1"
            />
          </label>
        ) : (
          <label className="text-[0.7rem] font-semibold text-[var(--color-text-dim)]">
            {DATE_LABEL[draft.kind]}
            <input
              type="date"
              value={draft.date ?? ""}
              onChange={(e) => onChange({ date: e.target.value || null })}
              className="field mt-1"
            />
          </label>
        )}

        {showAmount && (
          <label className="text-[0.7rem] font-semibold text-[var(--color-text-dim)]">
            Amount
            <input
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={draft.amount ?? ""}
              onChange={(e) => onChange({ amount: e.target.value || null })}
              className="field mt-1"
            />
          </label>
        )}

        {draft.kind === "budget" && (
          <label className="text-[0.7rem] font-semibold text-[var(--color-text-dim)]">
            Direction
            <select
              value={draft.entryType}
              onChange={(e) => onChange({ entryType: e.target.value as "INCOME" | "EXPENSE" })}
              className="field mt-1"
            >
              <option value="EXPENSE">Expense</option>
              <option value="INCOME">Income</option>
            </select>
          </label>
        )}

        {draft.kind === "subscription" && (
          <label className="text-[0.7rem] font-semibold text-[var(--color-text-dim)]">
            Cycle
            <select
              value={draft.billingCycle}
              onChange={(e) => onChange({ billingCycle: e.target.value as Draft["billingCycle"] })}
              className="field mt-1"
            >
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
              <option value="YEARLY">Yearly</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </label>
        )}

        {draft.kind === "task" && (
          <label className="text-[0.7rem] font-semibold text-[var(--color-text-dim)]">
            Priority
            <select
              value={draft.priority}
              onChange={(e) => onChange({ priority: e.target.value as Draft["priority"] })}
              className="field mt-1"
            >
              <option value="LOW">Low</option>
              <option value="MED">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </label>
        )}

        <label className="text-[0.7rem] font-semibold text-[var(--color-text-dim)]">
          Venture
          <select
            value={draft.ventureId ?? ""}
            onChange={(e) => onChange({ ventureId: e.target.value || null })}
            className="field mt-1"
          >
            <option value="">—</option>
            {ventures.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      )}

      {(draft.kind === "task" || draft.kind === "deadline" || draft.kind === "event") && (
        <label className="flex items-center gap-2 text-[0.7rem] font-semibold text-[var(--color-text-dim)]">
          <input
            type="checkbox"
            checked={draft.visibility === "PRIVATE"}
            onChange={(e) => onChange({ visibility: e.target.checked ? "PRIVATE" : "SHARED" })}
          />
          Private (only you see this)
        </label>
      )}
    </div>
  );
}
