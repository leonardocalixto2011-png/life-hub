import type { HubTx } from "@/lib/hub-context";
import { dollarsToCents } from "@/lib/money";
import { fromDateInput, fromDateTimeInput } from "@/lib/format";
import type { Draft } from "@/lib/parse";
import { assertActiveMember, assertVentureInHub } from "@/lib/membership";
import { logActivity } from "@/lib/activity";
import { translate, type Lang } from "@/lib/i18n";

/** Draft amounts are typed by people ("4,50", "1 234,56"), so they go
 * through the same locale-aware parser as every form. */
function toCents(s: string | null): number | null {
  return dollarsToCents(s);
}

export type CommitResult =
  | { ok: true; created: string[] }
  | { ok: false; created: string[]; error: string };

/**
 * The split a budget draft asks for, normalised the way budget/actions.ts's
 * `sharing()` does it: only an EXPENSE can be shared, and a shared one with
 * no payer named was paid by whoever is saving it.
 */
export function draftSharing(d: Draft, userId: string) {
  const payerSharePct = d.kind === "budget" && d.entryType === "EXPENSE" ? (d.payerSharePct ?? null) : null;
  const paidById = payerSharePct != null ? (d.paidById ?? userId) : null;
  return { paidById, payerSharePct };
}

/**
 * The actual "turn a Draft into a Task/Deadline/Event/Subscription/
 * BudgetEntry row" logic, pulled out of quick-actions.ts's commitDrafts so
 * it can run without a request/session/cookies — the mail-connector poller
 * (lib/mail/poll.ts) has neither, since it's triggered by an external
 * scheduler hitting /api/mail/poll, not a signed-in user clicking something.
 * Both that poller and the quick-add/review-inbox commitDrafts server action
 * call this with an explicit (tx, hubId, userId) instead.
 *
 * `lang` is for the `created` lines ("Task: …"), which quick-add shows to
 * the person as they are. They are built here, so they are translated here;
 * the poller has nobody to show them to and leaves the default.
 */
export async function commitDraftsCore(
  tx: HubTx,
  hubId: string,
  userId: string,
  drafts: Draft[],
  lang: Lang = "en",
  /**
   * `activity`: write a feed line per item. On for a person saving their own
   * drafts; off (the default) for the mail poller, where nobody "did" anything
   * — an auto-filed bill showing up as "Lucky added…" would be untrue.
   */
  opts: { activity?: boolean } = {},
): Promise<CommitResult> {
  const created: string[] = [];
  const say = (key: string, title: string) => translate(lang, key, { title });
  const log = (
    verb: "TASK_ADDED" | "EVENT_ADDED" | "DEADLINE_ADDED" | "EXPENSE_ADDED",
    entityType: "task" | "event" | "deadline" | "budget",
    entityId: string,
    d: Draft,
    amountCents?: number | null,
  ) =>
    opts.activity
      ? logActivity(tx, {
          hubId,
          actorId: userId,
          verb,
          entityType,
          entityId,
          summary: d.title,
          amountCents,
          // Budget entries have no privacy flag; everything else copies its own.
          visibility: entityType === "budget" ? "SHARED" : d.visibility,
        })
      : Promise.resolve();

  // A draft's ventureId comes from the client (quick-add, review inbox) or a
  // classifier; either way it must name a venture of *this* hub before
  // anything is written.
  for (const d of drafts) {
    try {
      await assertVentureInHub(hubId, d.ventureId);
    } catch (e) {
      return { ok: false, created, error: e instanceof Error ? e.message : "Invalid draft data." };
    }
    // `paidById` is a plain member id with no FK: without this a crafted
    // draft could attribute an expense to anyone in the app.
    const { paidById } = draftSharing(d, userId);
    if (paidById && paidById !== userId) {
      try {
        await assertActiveMember(hubId, paidById);
      } catch (e) {
        return { ok: false, created, error: e instanceof Error ? e.message : "Invalid draft data." };
      }
    }
  }

  for (const d of drafts) {
    if (d.kind === "needs_reply") {
      // Nothing to create — accepting one just marks its ReviewItem handled;
      // see acceptReview in inbox/actions.ts.
      created.push(say("Marked handled: {title}", d.title));
    } else if (d.kind === "task") {
      const row = await tx.task.create({
        data: {
          title: d.title,
          notes: d.note,
          hubId,
          dueDate: fromDateInput(d.date),
          priority: d.priority,
          amountCents: toCents(d.amount),
          imageUrl: d.imageUrl ?? null,
          ventureId: d.ventureId,
          createdById: userId,
          visibility: d.visibility,
        },
        select: { id: true },
      });
      await log("TASK_ADDED", "task", row.id, d);
      created.push(say("Task: {title}", d.title));
    } else if (d.kind === "deadline") {
      const row = await tx.deadline.create({
        data: {
          title: d.title,
          notes: d.note,
          hubId,
          dueDate: fromDateInput(d.date) ?? new Date(),
          ventureId: d.ventureId,
          createdById: userId,
          visibility: d.visibility,
        },
        select: { id: true },
      });
      await log("DEADLINE_ADDED", "deadline", row.id, d);
      created.push(say("Deadline: {title}", d.title));
    } else if (d.kind === "event") {
      const startAt = fromDateTimeInput(d.time) ?? fromDateInput(d.date) ?? new Date();
      const row = await tx.event.create({
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
        select: { id: true },
      });
      await log("EVENT_ADDED", "event", row.id, d);
      created.push(say("Event: {title}", d.title));
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
        created.push(say("Updated subscription: {title}", existing.name));
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
        created.push(say("Subscription: {title}", d.title));
      }
    } else if (d.kind === "budget") {
      const cents = toCents(d.amount);
      if (cents == null || cents <= 0) {
        return { ok: false, created, error: say("“{title}” needs an amount.", d.title) };
      }
      // One entry, whatever produced the split: a preset, or a receipt read
      // line by line — the itemised detail is only ever a way to arrive at
      // the percentage, and is not stored.
      const row = await tx.budgetEntry.create({
        data: {
          type: d.entryType,
          amountCents: cents,
          hubId,
          category: d.title,
          description: d.note,
          date: fromDateInput(d.date) ?? new Date(),
          ventureId: d.ventureId,
          createdById: userId,
          ...draftSharing(d, userId),
        },
        select: { id: true },
      });
      if (d.entryType === "EXPENSE") await log("EXPENSE_ADDED", "budget", row.id, d, cents);
      created.push(say(d.entryType === "INCOME" ? "Income: {title}" : "Expense: {title}", d.title));
    }
  }

  return { ok: true, created };
}
