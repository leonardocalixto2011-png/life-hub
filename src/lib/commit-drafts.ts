import type { HubTx } from "@/lib/hub-context";
import { dollarsToCents } from "@/lib/money";
import { fromDateInput, fromDateTimeInput } from "@/lib/format";
import type { Draft } from "@/lib/parse";
import { assertVentureInHub } from "@/lib/membership";

/** Draft amounts are typed by people ("4,50", "1 234,56"), so they go
 * through the same locale-aware parser as every form. */
function toCents(s: string | null): number | null {
  return dollarsToCents(s);
}

export type CommitResult =
  | { ok: true; created: string[] }
  | { ok: false; created: string[]; error: string };

/**
 * The actual "turn a Draft into a Task/Deadline/Event/Subscription/
 * BudgetEntry row" logic, pulled out of quick-actions.ts's commitDrafts so
 * it can run without a request/session/cookies — the mail-connector poller
 * (lib/mail/poll.ts) has neither, since it's triggered by an external
 * scheduler hitting /api/mail/poll, not a signed-in user clicking something.
 * Both that poller and the quick-add/review-inbox commitDrafts server action
 * call this with an explicit (tx, hubId, userId) instead.
 */
export async function commitDraftsCore(
  tx: HubTx,
  hubId: string,
  userId: string,
  drafts: Draft[],
): Promise<CommitResult> {
  const created: string[] = [];

  // A draft's ventureId comes from the client (quick-add, review inbox) or a
  // classifier; either way it must name a venture of *this* hub before
  // anything is written.
  for (const d of drafts) {
    try {
      await assertVentureInHub(hubId, d.ventureId);
    } catch (e) {
      return { ok: false, created, error: e instanceof Error ? e.message : "Invalid draft data." };
    }
  }

  for (const d of drafts) {
    if (d.kind === "needs_reply") {
      // Nothing to create — accepting one just marks its ReviewItem handled;
      // see acceptReview in inbox/actions.ts.
      created.push(`Marked handled: ${d.title}`);
    } else if (d.kind === "task") {
      await tx.task.create({
        data: {
          title: d.title,
          notes: d.note,
          hubId,
          dueDate: fromDateInput(d.date),
          priority: d.priority,
          amountCents: toCents(d.amount),
          ventureId: d.ventureId,
          createdById: userId,
          visibility: d.visibility,
        },
      });
      created.push(`Task: ${d.title}`);
    } else if (d.kind === "deadline") {
      await tx.deadline.create({
        data: {
          title: d.title,
          notes: d.note,
          hubId,
          dueDate: fromDateInput(d.date) ?? new Date(),
          ventureId: d.ventureId,
          createdById: userId,
          visibility: d.visibility,
        },
      });
      created.push(`Deadline: ${d.title}`);
    } else if (d.kind === "event") {
      const startAt = fromDateTimeInput(d.time) ?? fromDateInput(d.date) ?? new Date();
      await tx.event.create({
        data: {
          title: d.title,
          notes: d.note,
          hubId,
          startAt,
          endAt: new Date(startAt.getTime() + 3_600_000),
          ventureId: d.ventureId,
          createdById: userId,
          visibility: d.visibility,
        },
      });
      created.push(`Event: ${d.title}`);
    } else if (d.kind === "subscription") {
      const existing = await tx.subscription.findFirst({
        where: { hubId, status: "ACTIVE", name: { equals: d.title, mode: "insensitive" } },
      });
      const renewalDate = fromDateInput(d.date) ?? new Date();
      if (existing) {
        await tx.subscription.update({
          where: { id: existing.id },
          data: {
            renewalDate,
            billingCycle: d.billingCycle,
            costCents: toCents(d.amount) ?? existing.costCents,
          },
        });
        created.push(`Updated subscription: ${existing.name}`);
      } else {
        await tx.subscription.create({
          data: {
            name: d.title,
            hubId,
            costCents: toCents(d.amount) ?? 0,
            billingCycle: d.billingCycle,
            renewalDate,
            ventureId: d.ventureId,
            ownerId: userId,
            notes: d.note,
          },
        });
        created.push(`Subscription: ${d.title}`);
      }
    } else if (d.kind === "budget") {
      const cents = toCents(d.amount);
      if (cents == null || cents <= 0) {
        return { ok: false, created, error: `"${d.title}" needs an amount.` };
      }
      await tx.budgetEntry.create({
        data: {
          type: d.entryType,
          amountCents: cents,
          hubId,
          category: d.title,
          description: d.note,
          date: fromDateInput(d.date) ?? new Date(),
          ventureId: d.ventureId,
          createdById: userId,
        },
      });
      created.push(`${d.entryType === "INCOME" ? "Income" : "Expense"}: ${d.title}`);
    }
  }

  return { ok: true, created };
}
