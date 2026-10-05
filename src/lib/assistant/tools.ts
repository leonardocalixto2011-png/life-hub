import type Anthropic from "@anthropic-ai/sdk";
import { format } from "date-fns";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { withHub } from "@/lib/hub-context";
import { prisma } from "@/lib/prisma";
import type { SessionHub, SessionUser } from "@/lib/session";
import type { Lang } from "@/lib/i18n";
import {
  agendaItems,
  budgetMonth,
  dashboard,
  getEvent,
  getTask,
  listDeadlines,
  listMyDebts,
  listPendingReviews,
  listSubscriptions,
  listTasks,
} from "@/lib/data";
import { searchHub } from "@/lib/search";
import { hasConsent } from "@/lib/consent";
import { centsToInput } from "@/lib/money";
import { visibleTo } from "@/lib/visibility";
import {
  contactsFor,
  conversationTitle,
  getConversation,
  listConversations,
  listMessages,
  openDirect,
  postMessage,
} from "@/lib/chat";

import { createTask, setTaskDone, updateTask, deleteTask } from "@/app/(app)/tasks/actions";
import { createDeadline, deleteDeadline, toggleDeadlineDone } from "@/app/(app)/deadlines/actions";
import { createEvent, deleteEvent, updateEvent } from "@/app/(app)/calendar/actions";
import { createSpecialDate, deleteSpecialDate } from "@/app/(app)/calendar/dates/actions";
import {
  createSubscription,
  deleteSubscription,
  setSubscriptionStatus,
} from "@/app/(app)/subscriptions/actions";
import { createEntry, deleteEntry, setBudgetTarget, settleUp } from "@/app/(app)/budget/actions";
import { createDebt, logDebtPayment, setDebtStatus } from "@/app/(app)/debts/actions";
import {
  addTripItem,
  addTripSavings,
  createTrip,
  deleteTrip,
  deleteTripItem,
  toggleTripItem,
} from "@/app/(app)/trips/actions";
import { createShifts } from "@/app/(app)/schedule/actions";
import { acceptReview, discardReview } from "@/app/(app)/inbox/actions";
import type { Draft } from "@/lib/parse";

/**
 * The assistant's hands. Every tool that changes something calls the SAME
 * server action the app's own forms call, with the same FormData — so it gets
 * the same validation, the same membership/venture/consent checks, the same
 * activity lines and push notifications, and it runs as the signed-in person
 * under withHub/RLS. Nothing here writes to the database on its own authority;
 * the assistant can do exactly what the person could do by tapping, no more.
 *
 * Reads use the same data.ts helpers the pages use.
 *
 * Two tools never act straight away — deleting something and messaging
 * another person. They return a pending action the person confirms with a
 * tap (see `confirm` below and resolvePending in lib/assistant/agent.ts).
 */

export type ToolCtx = { user: SessionUser; hub: SessionHub; lang: Lang };

type Schema = Anthropic.Tool.InputSchema;
type Json = Record<string, unknown>;

export type AppTool = {
  name: string;
  description: string;
  input_schema: Schema;
  /** Short label for the step list under the reply ("Added a task"). English, i18n key. */
  label: string;
  run: (ctx: ToolCtx, input: Json) => Promise<unknown>;
  /** When present, the tool doesn't run: this returns what the person is asked to confirm. */
  confirm?: (ctx: ToolCtx, input: Json) => Promise<string>;
};

// ---- schema helpers: strict mode needs every property listed in `required`;
// "optional" is expressed as a nullable type. ---------------------------------
const str = (description: string) => ({ type: "string", description });
const optStr = (description: string) => ({ type: ["string", "null"], description });
const optNum = (description: string) => ({ type: ["number", "null"], description });
const bool = (description: string) => ({ type: "boolean", description });
const en = (values: string[], description: string) => ({ type: "string", enum: values, description });
const optEn = (values: string[], description: string) => ({
  type: ["string", "null"],
  enum: [...values, null],
  description,
});
function obj(properties: Record<string, unknown>): Schema {
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false } as Schema;
}
const DATE = "YYYY-MM-DD";

// ---- helpers ----------------------------------------------------------------
function fd(fields: Record<string, string | number | boolean | null | undefined | string[]>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v == null || v === false) continue;
    if (Array.isArray(v)) for (const x of v) f.append(k, x);
    else f.set(k, v === true ? "on" : String(v));
  }
  return f;
}
const s = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const amount = (v: unknown) => (n(v) == null ? null : (n(v) as number).toFixed(2));
const day = (d: Date | null | undefined) => (d ? format(d, "yyyy-MM-dd") : null);
const dayTime = (d: Date | null | undefined) => (d ? format(d, "yyyy-MM-dd'T'HH:mm") : null);
const cents = (c: number | null | undefined) => (c == null ? null : c / 100);

/** Runs a server action; a redirect() after success counts as success. */
async function act<T>(fn: () => Promise<T>): Promise<T | { redirectedTo: string }> {
  try {
    const r = await fn();
    if (r && typeof r === "object" && "error" in r && (r as { error?: string }).error) {
      throw new Error((r as { error: string }).error);
    }
    return r;
  } catch (e) {
    if (isRedirectError(e)) {
      const url = String((e as { digest?: string }).digest ?? "").split(";")[2] ?? "";
      return { redirectedTo: url };
    }
    throw e;
  }
}

function hubScope(ctx: ToolCtx) {
  return { hubId: ctx.hub.id, userId: ctx.user.id, currency: ctx.hub.currency, locale: ctx.user.locale ?? undefined, lang: ctx.lang };
}

// ---- the tools ---------------------------------------------------------------
export const TOOLS: AppTool[] = [
  // ================= reading =================
  {
    name: "get_overview",
    label: "Looked at your day",
    description:
      "What needs attention in the current hub: overdue tasks, tasks due this week, events this week, deadlines and subscription renewals in the next two weeks, debt payments due (if the person tracks debts) and this month's budget in/out/net. Use for 'what's up', 'brief me', 'what do I have this week'.",
    input_schema: obj({}),
    run: async (ctx) => {
      const d = await withHub(ctx.user.id, (tx) => dashboard(tx, ctx.hub.id, ctx.user.id, ctx.hub.currency));
      return {
        overdueTasks: d.overdue.map((t) => ({ id: t.id, title: t.title, due: day(t.dueDate) })),
        tasksThisWeek: d.dueSoon.map((t) => ({ id: t.id, title: t.title, due: day(t.dueDate), assignedTo: t.assignedTo?.name ?? null })),
        events: d.events.map((e) => ({ id: e.id, title: e.title, start: dayTime(e.startAt), location: e.location })),
        deadlines: d.deadlines.map((x) => ({ id: x.id, title: x.title, due: day(x.dueDate) })),
        renewals: d.renewals.map((r) => ({ id: r.id, name: r.name, renews: day(r.renewalDate), cost: cents(r.costCents) })),
        cancelBy: d.cancelBys.map((r) => ({ id: r.id, name: r.name, cancelBy: day(r.cancelByDate) })),
        debtPayments: d.debts.map((x) => ({ id: x.id, name: x.name, due: day(x.dueDate), payment: cents(x.actualPaymentCents ?? x.minimumPaymentCents) })),
        budgetThisMonth: { income: cents(d.budget.income), expense: cents(d.budget.expense), net: cents(d.budget.net), currency: ctx.hub.currency },
      };
    },
  },
  {
    name: "search",
    label: "Searched",
    description: "Full-text search across the current hub: tasks, events, deadlines, subscriptions, budget entries, trips, debts, special dates. Returns ids you can act on.",
    input_schema: obj({ query: str("Words to look for") }),
    run: async (ctx, i) => {
      const groups = await withHub(ctx.user.id, (tx) => searchHub(tx, hubScope(ctx), String(i.query ?? "")));
      return groups.map((g) => ({ type: g.type, hits: g.hits.map((h) => ({ id: h.id, title: h.title, detail: h.meta ?? null })) }));
    },
  },
  {
    name: "get_agenda",
    label: "Checked the agenda",
    description: "Everything dated in the next N days, in order: tasks, deadlines, events, subscription renewals, debt payments.",
    input_schema: obj({ days: optNum("How many days ahead, 1-90 (default 14)") }),
    run: async (ctx, i) => {
      const days = Math.min(90, Math.max(1, Math.round(n(i.days) ?? 14)));
      const items = await withHub(ctx.user.id, (tx) =>
        agendaItems(tx, ctx.hub.id, ctx.user.id, days, { currency: ctx.hub.currency, locale: ctx.user.locale ?? undefined }),
      );
      return items.items.map((x) => ({ kind: x.kind, id: x.id, title: x.title, at: dayTime(x.at), detail: x.meta }));
    },
  },
  {
    name: "list_tasks",
    label: "Looked at tasks",
    description: "Tasks in the current hub. scope: open (default), mine (assigned to the person), done (include finished), to_buy (shopping list).",
    input_schema: obj({ scope: en(["open", "mine", "done", "to_buy"], "Which tasks") }),
    run: async (ctx, i) => {
      const scope = String(i.scope ?? "open");
      const rows = await withHub(ctx.user.id, (tx) =>
        listTasks(tx, ctx.hub.id, ctx.user.id, {
          mineUserId: scope === "mine" ? ctx.user.id : undefined,
          includeDone: scope === "done",
          toBuy: scope === "to_buy",
        }),
      );
      return rows.slice(0, 60).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        due: day(t.dueDate),
        priority: t.priority,
        assignedTo: t.assignedTo?.name ?? null,
        venture: t.venture?.name ?? null,
        amount: cents(t.amountCents),
        private: t.visibility === "PRIVATE",
        recurring: t.isRecurring ? t.recurrence : null,
      }));
    },
  },
  {
    name: "list_deadlines",
    label: "Looked at deadlines",
    description: "Open deadlines in the current hub (with reminders), soonest first.",
    input_schema: obj({}),
    run: async (ctx) => {
      const rows = await withHub(ctx.user.id, (tx) => listDeadlines(tx, ctx.hub.id, ctx.user.id));
      return rows.map((d) => ({ id: d.id, title: d.title, due: day(d.dueDate), remindDaysBefore: d.remindDaysBefore, venture: d.venture?.name ?? null }));
    },
  },
  {
    name: "list_subscriptions",
    label: "Looked at subscriptions",
    description: "Recurring costs in the current hub (streaming, rent, insurance, phone…), with renewal and cancel-by dates.",
    input_schema: obj({ include_cancelled: bool("Also list cancelled ones") }),
    run: async (ctx, i) => {
      const rows = await withHub(ctx.user.id, (tx) => listSubscriptions(tx, ctx.hub.id, { includeCancelled: i.include_cancelled === true }));
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        cost: cents(r.costCents),
        cycle: r.billingCycle,
        renews: day(r.renewalDate),
        cancelBy: day(r.cancelByDate),
        status: r.status,
        owner: r.owner?.name ?? null,
      }));
    },
  },
  {
    name: "get_budget",
    label: "Looked at the budget",
    description: "Budget for one month in the current hub: income, expenses, net, spending by category and the entries.",
    input_schema: obj({ month: optStr("YYYY-MM, default this month") }),
    run: async (ctx, i) => {
      const m = s(i.month);
      const when = m && /^\d{4}-\d{2}$/.test(m) ? new Date(Number(m.slice(0, 4)), Number(m.slice(5)) - 1, 15) : new Date();
      const b = await withHub(ctx.user.id, (tx) => budgetMonth(tx, ctx.hub.id, when));
      return {
        currency: ctx.hub.currency,
        income: cents(b.income),
        expense: cents(b.expense),
        net: cents(b.net),
        byCategory: b.categories.map((c) => ({ category: c.category, spent: cents(c.cents) })),
        entries: b.entries.slice(0, 80).map((e) => ({
          id: e.id,
          date: day(e.date),
          type: e.type,
          amount: cents(e.amountCents),
          category: e.category,
          description: e.description,
          settlement: e.isSettlement,
        })),
      };
    },
  },
  {
    name: "list_debts",
    label: "Looked at your debts",
    description: "The person's own debts in this hub (balance, payment, due date, status). Only works once they have given debt consent on the Debts page.",
    input_schema: obj({}),
    run: async (ctx) => {
      if (!(await hasConsent(ctx.user.id, "DEBTS_SENSITIVE"))) {
        return { error: "No debt consent yet. The person must open the Debts page and give consent first; you cannot do it for them." };
      }
      const rows = await withHub(ctx.user.id, (tx) => listMyDebts(tx, ctx.user.id, ctx.hub.id));
      return rows.map((d) => ({
        id: d.id,
        name: d.name,
        type: d.type,
        balance: cents(d.balanceCents),
        payment: cents(d.actualPaymentCents ?? d.minimumPaymentCents),
        frequency: d.paymentFrequency,
        due: day(d.dueDate),
        status: d.status,
      }));
    },
  },
  {
    name: "list_trips",
    label: "Looked at trips",
    description: "Trips in the current hub with dates, budget and savings.",
    input_schema: obj({}),
    run: async (ctx) => {
      const rows = await withHub(ctx.user.id, (tx) =>
        tx.trip.findMany({
          where: { hubId: ctx.hub.id, ...visibleTo(ctx.user.id) },
          orderBy: { startDate: "asc" },
          select: { id: true, title: true, destination: true, startDate: true, endDate: true, budgetCents: true, savedCents: true },
        }),
      );
      return rows.map((t) => ({ id: t.id, title: t.title, destination: t.destination, start: day(t.startDate), end: day(t.endDate), budget: cents(t.budgetCents), saved: cents(t.savedCents) }));
    },
  },
  {
    name: "get_trip",
    label: "Opened a trip",
    description: "One trip's checklist and itinerary items (bookings, to-dos, packing, activities, savings deposits, stops, budget lines, tips).",
    input_schema: obj({ trip_id: str("Trip id") }),
    run: async (ctx, i) => {
      const trip = await withHub(ctx.user.id, (tx) =>
        tx.trip.findFirst({
          where: { id: String(i.trip_id), hubId: ctx.hub.id, ...visibleTo(ctx.user.id) },
          select: {
            id: true,
            title: true,
            destination: true,
            startDate: true,
            endDate: true,
            budgetCents: true,
            savedCents: true,
            notes: true,
            items: {
              orderBy: [{ date: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
              select: { id: true, kind: true, title: true, done: true, date: true, endDate: true, costCents: true, note: true },
            },
          },
        }),
      );
      if (!trip) return { error: "Trip not found in this hub." };
      return {
        ...trip,
        startDate: day(trip.startDate),
        endDate: day(trip.endDate),
        budget: cents(trip.budgetCents),
        saved: cents(trip.savedCents),
        items: trip.items.map((x) => ({ ...x, date: day(x.date), endDate: day(x.endDate), cost: cents(x.costCents), costCents: undefined })),
      };
    },
  },
  {
    name: "list_inbox",
    label: "Checked the review inbox",
    description: "Items detected from email that wait for the person's review (bills, renewals, appointments, replies needed), with the draft each would become.",
    input_schema: obj({}),
    run: async (ctx) => {
      const rows = await withHub(ctx.user.id, (tx) => listPendingReviews(tx, ctx.user.id));
      return rows.slice(0, 30).map((r) => ({ id: r.id, from: r.fromAddress, snippet: r.sourceSnippet, category: r.category, draft: r.draft }));
    },
  },
  {
    name: "list_chats",
    label: "Looked at your chats",
    description: "The person's chats with other people (one-to-one, groups, hub chats) with the latest message and whether it's unread. Also lists the people they can message.",
    input_schema: obj({}),
    run: async (ctx) => {
      const [rows, contacts] = await Promise.all([listConversations(ctx.user.id), contactsFor(ctx.user.id)]);
      return {
        chats: rows
          .filter((c) => c.kind !== "AI")
          .slice(0, 30)
          .map((c) => ({ id: c.id, kind: c.kind, title: conversationTitle(c, ctx.lang), unread: c.unread, last: c.last?.body?.slice(0, 200) ?? null })),
        canMessage: contacts.map((c) => ({ id: c.id, name: c.name, username: c.username })),
      };
    },
  },
  {
    name: "read_chat",
    label: "Read a chat",
    description: "The latest messages in one of the person's chats with other people.",
    input_schema: obj({ chat_id: str("Chat id from list_chats") }),
    run: async (ctx, i) => {
      const rows = await withHub(ctx.user.id, async (tx) => {
        const c = await getConversation(tx, ctx.user.id, String(i.chat_id));
        if (!c || c.kind === "AI") return null;
        return listMessages(tx, c.id, { take: 30 });
      });
      if (!rows) return { error: "Chat not found." };
      return rows.reverse().map((m) => ({ from: m.author?.name ?? "?", at: dayTime(m.createdAt), text: m.body }));
    },
  },

  // ================= tasks =================
  {
    name: "create_task",
    label: "Added a task",
    description: "Create a task in the current hub.",
    input_schema: obj({
      title: str("Short title"),
      due_date: optStr(DATE),
      priority: optEn(["LOW", "MED", "HIGH"], "Default MED"),
      assigned_to_id: optStr("Member id to assign, from the people list"),
      venture_id: optStr("Venture id, from the ventures list"),
      notes: optStr("Details"),
      amount: optNum("Amount in dollars if it is a bill to pay"),
      recurrence: optEn(["weekly", "monthly"], "Repeats"),
      private: bool("Only the person can see it (default false: shared with the hub)"),
    }),
    run: async (ctx, i) =>
      act(() =>
        createTask(
          fd({
            title: s(i.title),
            dueDate: s(i.due_date),
            priority: s(i.priority) ?? "MED",
            assignedToId: s(i.assigned_to_id),
            ventureId: s(i.venture_id),
            notes: s(i.notes),
            amount: amount(i.amount),
            isRecurring: Boolean(s(i.recurrence)),
            recurrence: s(i.recurrence),
            visibility: i.private === true ? "PRIVATE" : "SHARED",
          }),
        ),
      ),
  },
  {
    name: "update_task",
    label: "Updated a task",
    description: "Change a task. Pass null for anything to leave as it is; to clear a due date or assignee pass the string \"none\".",
    input_schema: obj({
      task_id: str("Task id"),
      title: optStr("New title"),
      due_date: optStr(`${DATE}, or "none"`),
      priority: optEn(["LOW", "MED", "HIGH"], "New priority"),
      assigned_to_id: optStr('Member id, or "none"'),
      venture_id: optStr('Venture id, or "none"'),
      notes: optStr("Replaces the notes"),
      amount: optNum("Bill amount in dollars"),
      private: { type: ["boolean", "null"], description: "true = private, false = shared, null = unchanged" },
    }),
    run: async (ctx, i) => {
      const t = await withHub(ctx.user.id, (tx) => getTask(tx, ctx.hub.id, ctx.user.id, String(i.task_id)));
      if (!t) return { error: "Task not found in this hub." };
      const pick = (v: unknown, cur: string | null) => (v === "none" ? null : (s(v) ?? cur));
      return act(() =>
        updateTask(
          fd({
            id: t.id,
            inSheet: "1",
            title: s(i.title) ?? t.title,
            notes: s(i.notes) ?? t.notes,
            dueDate: pick(i.due_date, day(t.dueDate)),
            priority: s(i.priority) ?? t.priority,
            assignedToId: pick(i.assigned_to_id, t.assignedToId),
            ventureId: pick(i.venture_id, t.ventureId),
            amount: amount(i.amount) ?? (t.amountCents != null ? centsToInput(t.amountCents) : null),
            isRecurring: t.isRecurring,
            recurrence: t.recurrence,
            visibility: i.private === true ? "PRIVATE" : i.private === false ? "SHARED" : t.visibility,
          }),
        ),
      );
    },
  },
  {
    name: "set_task_done",
    label: "Ticked a task",
    description: "Mark a task done (or reopen it). Finishing a recurring task schedules the next one.",
    input_schema: obj({ task_id: str("Task id"), done: bool("true = done, false = reopen") }),
    run: async (_ctx, i) => act(() => setTaskDone(String(i.task_id), i.done !== false)),
  },

  // ================= calendar =================
  {
    name: "create_event",
    label: "Added to the calendar",
    description: "Create a calendar event. For a weekly repeat give repeat_weekdays and repeat_until.",
    input_schema: obj({
      title: str("Title"),
      start: str("YYYY-MM-DDTHH:MM, local time"),
      end: optStr("YYYY-MM-DDTHH:MM; default one hour after start"),
      location: optStr("Place"),
      notes: optStr("Details"),
      attendee_ids: { type: "array", items: { type: "string" }, description: "Member ids attending (may be empty)" },
      venture_id: optStr("Venture id"),
      repeat_weekdays: { type: "array", items: { type: "integer" }, description: "0=Sunday … 6=Saturday; empty for a one-off" },
      repeat_until: optStr(`${DATE}, needed with repeat_weekdays`),
      private: bool("Only the person can see it"),
    }),
    run: async (_ctx, i) => {
      const days = Array.isArray(i.repeat_weekdays) ? (i.repeat_weekdays as number[]).map(String) : [];
      return act(() =>
        createEvent(
          fd({
            title: s(i.title),
            startAt: s(i.start),
            endAt: s(i.end),
            location: s(i.location),
            notes: s(i.notes),
            ventureId: s(i.venture_id),
            attendeeIds: Array.isArray(i.attendee_ids) ? (i.attendee_ids as string[]) : [],
            repeatDays: days,
            repeatUntil: days.length ? s(i.repeat_until) : null,
            visibility: i.private === true ? "PRIVATE" : "SHARED",
          }),
        ),
      );
    },
  },
  {
    name: "update_event",
    label: "Moved an event",
    description: "Change one calendar event. Pass null to leave a field as it is.",
    input_schema: obj({
      event_id: str("Event id"),
      title: optStr("New title"),
      start: optStr("YYYY-MM-DDTHH:MM"),
      end: optStr("YYYY-MM-DDTHH:MM"),
      location: optStr("Place"),
      notes: optStr("Details"),
    }),
    run: async (ctx, i) => {
      const e = await withHub(ctx.user.id, (tx) => getEvent(tx, ctx.hub.id, ctx.user.id, String(i.event_id)));
      if (!e) return { error: "Event not found in this hub." };
      // Moving the start without an end keeps the same length.
      let end = s(i.end);
      if (!end && s(i.start)) {
        const len = e.endAt.getTime() - e.startAt.getTime();
        const st = new Date(String(i.start));
        if (!Number.isNaN(st.getTime())) end = dayTime(new Date(st.getTime() + len));
      }
      return act(() =>
        updateEvent(
          fd({
            id: e.id,
            inSheet: "1",
            title: s(i.title) ?? e.title,
            startAt: s(i.start) ?? dayTime(e.startAt),
            endAt: end ?? dayTime(e.endAt),
            location: s(i.location) ?? e.location,
            notes: s(i.notes) ?? e.notes,
            ventureId: e.ventureId,
            attendeeIds: e.attendeeIds,
            visibility: e.visibility,
          }),
        ),
      );
    },
  },
  {
    name: "create_special_date",
    label: "Saved a special date",
    description: "A birthday, anniversary or other date that comes back every year, with reminders.",
    input_schema: obj({
      title: str("e.g. Chantelle's birthday"),
      kind: en(["BIRTHDAY", "ANNIVERSARY", "OTHER"], "Kind"),
      date: str(`${DATE}; use any year if unknown and set year_unknown`),
      year_unknown: bool("The year isn't known"),
      private: bool("Only the person can see it"),
    }),
    run: async (_ctx, i) =>
      act(() =>
        createSpecialDate(
          fd({ title: s(i.title), kind: s(i.kind), date: s(i.date), yearUnknown: i.year_unknown === true, visibility: i.private === true ? "PRIVATE" : "SHARED" }),
        ),
      ),
  },
  {
    name: "create_work_shifts",
    label: "Added work shifts",
    description: "Add someone's work schedule (shifts) — used to find time free together.",
    input_schema: obj({
      person_id: str("Member id whose shifts these are"),
      start_time: str("HH:MM"),
      end_time: str("HH:MM (earlier than start = ends next day)"),
      from_date: str(DATE),
      until_date: optStr(`${DATE}, default from_date`),
      weekdays: { type: "array", items: { type: "integer" }, description: "0=Sunday … 6=Saturday; empty = every day" },
      label: optStr("e.g. Work"),
    }),
    run: async (_ctx, i) =>
      act(() =>
        createShifts(
          fd({
            personId: s(i.person_id),
            startTime: s(i.start_time),
            endTime: s(i.end_time),
            fromDate: s(i.from_date),
            untilDate: s(i.until_date),
            days: Array.isArray(i.weekdays) ? (i.weekdays as number[]).map(String) : [],
            label: s(i.label),
          }),
        ),
      ),
  },

  // ================= deadlines =================
  {
    name: "create_deadline",
    label: "Added a deadline",
    description: "A dated deadline with reminders before it (taxes, renewals, forms).",
    input_schema: obj({
      title: str("Title"),
      due_date: str(DATE),
      remind_days_before: { type: "array", items: { type: "integer" }, description: "e.g. [7,3,1]; empty for none" },
      notes: optStr("Details"),
      venture_id: optStr("Venture id"),
      private: bool("Only the person can see it"),
    }),
    run: async (_ctx, i) =>
      act(() =>
        createDeadline(
          fd({
            title: s(i.title),
            dueDate: s(i.due_date),
            remindDaysBefore: Array.isArray(i.remind_days_before) ? (i.remind_days_before as number[]).join(",") : "7,3,1",
            notes: s(i.notes),
            ventureId: s(i.venture_id),
            visibility: i.private === true ? "PRIVATE" : "SHARED",
          }),
        ),
      ),
  },
  {
    name: "set_deadline_done",
    label: "Wrapped up a deadline",
    description: "Mark a deadline done or not done.",
    input_schema: obj({ deadline_id: str("Deadline id"), done: bool("true = done") }),
    run: async (_ctx, i) => act(() => toggleDeadlineDone(fd({ id: s(i.deadline_id), done: i.done === false ? "false" : "true" }))),
  },

  // ================= money =================
  {
    name: "add_budget_entry",
    label: "Logged in the budget",
    description: "Record money in or out that already happened. For a shared expense between members, set split (payer's share in %).",
    input_schema: obj({
      type: en(["EXPENSE", "INCOME"], "Direction"),
      amount: { type: "number", description: "Dollars, positive" },
      category: str("e.g. Épicerie, Essence, Restaurant, Salaire"),
      date: optStr(`${DATE}, default today`),
      description: optStr("Merchant or note"),
      venture_id: optStr("Venture id"),
      paid_by_id: optStr("Member id who paid, if not the person"),
      split: optEn(["50", "60", "40", "0"], "Shared expense: the payer's share in %; null = not shared"),
    }),
    run: async (_ctx, i) =>
      act(() =>
        createEntry(
          fd({
            type: s(i.type),
            amount: amount(i.amount),
            category: s(i.category),
            date: s(i.date),
            description: s(i.description),
            ventureId: s(i.venture_id),
            paidById: s(i.paid_by_id),
            split: s(i.split) ?? "none",
          }),
        ),
      ),
  },
  {
    name: "set_budget_target",
    label: "Set a budget limit",
    description: "A monthly spending limit for one category.",
    input_schema: obj({ category: str("Category"), monthly_amount: { type: "number", description: "Dollars per month" } }),
    run: async (_ctx, i) => act(() => setBudgetTarget(fd({ category: s(i.category), amount: amount(i.monthly_amount) }))),
  },
  {
    name: "settle_up",
    label: "Recorded a settle-up",
    description: "Record that a member paid back money they owed for shared expenses.",
    input_schema: obj({ from_id: str("Member id who paid back"), amount: { type: "number", description: "Dollars" } }),
    run: async (_ctx, i) => act(() => settleUp(fd({ fromId: s(i.from_id), toName: "", amount: amount(i.amount) }))),
  },
  {
    name: "create_subscription",
    label: "Added a subscription",
    description: "A recurring cost (streaming, phone, rent, insurance, gym…).",
    input_schema: obj({
      name: str("Name"),
      cost: { type: "number", description: "Dollars per billing cycle" },
      billing_cycle: en(["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"], "Cycle"),
      renewal_date: str(`Next renewal, ${DATE}`),
      cancel_by_date: optStr(`${DATE}, if there's a date to cancel by`),
      owner_id: optStr("Member id who owns it"),
      venture_id: optStr("Venture id"),
      notes: optStr("Details"),
    }),
    run: async (_ctx, i) =>
      act(() =>
        createSubscription(
          fd({
            name: s(i.name),
            cost: amount(i.cost),
            billingCycle: s(i.billing_cycle),
            renewalDate: s(i.renewal_date),
            cancelByDate: s(i.cancel_by_date),
            ownerId: s(i.owner_id),
            ventureId: s(i.venture_id),
            notes: s(i.notes),
          }),
        ),
      ),
  },
  {
    name: "set_subscription_status",
    label: "Updated a subscription",
    description: "Mark a subscription cancelled, or active again.",
    input_schema: obj({ subscription_id: str("Subscription id"), status: en(["ACTIVE", "CANCELLED"], "Status") }),
    run: async (_ctx, i) => act(() => setSubscriptionStatus(fd({ id: s(i.subscription_id), status: s(i.status) }))),
  },
  {
    name: "create_debt",
    label: "Added a debt",
    description: "Track one of the person's own debts. Needs their debt consent (Debts page) — if it fails for consent, tell them to give it there.",
    input_schema: obj({
      name: str("Creditor / name"),
      balance: { type: "number", description: "Dollars owed now" },
      type: en(["CREDIT_CARD", "LINE_OF_CREDIT", "LOAN", "CAR_LOAN", "BNPL", "OTHER"], "Type"),
      apr_percent: optNum("Interest rate %"),
      payment: optNum("Payment per period, dollars"),
      payment_frequency: en(["WEEKLY", "BIWEEKLY", "MONTHLY"], "How often it's paid"),
      due_date: optStr(`Next payment, ${DATE}`),
    }),
    run: async (_ctx, i) =>
      act(() =>
        createDebt(
          fd({
            name: s(i.name),
            balance: amount(i.balance),
            type: s(i.type),
            apr: n(i.apr_percent) != null ? String(i.apr_percent) : null,
            minimumPayment: amount(i.payment),
            paymentFrequency: s(i.payment_frequency),
            dueDate: s(i.due_date),
          }),
        ),
      ),
  },
  {
    name: "log_debt_payment",
    label: "Logged a debt payment",
    description: "Record a payment on one of the person's debts: lowers the balance, logs the expense, moves the due date forward.",
    input_schema: obj({ debt_id: str("Debt id"), amount: { type: "number", description: "Dollars paid" }, date: optStr(`${DATE}, default today`) }),
    run: async (_ctx, i) => act(() => logDebtPayment(fd({ id: s(i.debt_id), amount: amount(i.amount), date: s(i.date) }))),
  },
  {
    name: "set_debt_status",
    label: "Updated a debt",
    description: "Change a debt's status.",
    input_schema: obj({ debt_id: str("Debt id"), status: en(["CURRENT", "DEFAULT", "PAID_OFF"], "Status") }),
    run: async (_ctx, i) => act(() => setDebtStatus(fd({ id: s(i.debt_id), status: s(i.status) }))),
  },

  // ================= trips =================
  {
    name: "create_trip",
    label: "Started a trip",
    description: "Create a trip.",
    input_schema: obj({
      title: str("Title"),
      destination: optStr("Where"),
      start_date: str(DATE),
      end_date: str(DATE),
      budget: optNum("Dollars"),
      notes: optStr("Details"),
      private: bool("Only the person can see it"),
    }),
    run: async (_ctx, i) => {
      const r = await act(() =>
        createTrip(
          fd({
            title: s(i.title),
            destination: s(i.destination),
            startDate: s(i.start_date),
            endDate: s(i.end_date),
            budget: amount(i.budget),
            notes: s(i.notes),
            visibility: i.private === true ? "PRIVATE" : "SHARED",
          }),
        ),
      );
      const to = (r as { redirectedTo?: string })?.redirectedTo;
      return to ? { tripId: to.split("/").pop() } : r;
    },
  },
  {
    name: "add_trip_item",
    label: "Added to a trip",
    description: "Add to a trip: BOOK (reservation), TODO, PACK (packing list), ACTIVITY (dated), SAVE (dated savings deposit), STOP (place with date and end_date), BUDGET (estimate line, needs cost), TIP (good to know).",
    input_schema: obj({
      trip_id: str("Trip id"),
      kind: en(["BOOK", "TODO", "PACK", "ACTIVITY", "SAVE", "STOP", "BUDGET", "TIP"], "Kind"),
      title: str("Title"),
      cost: optNum("Dollars"),
      date: optStr(DATE),
      end_date: optStr(DATE),
      note: optStr("Details"),
      url: optStr("Web link"),
      place: optStr("Address or place name"),
    }),
    run: async (_ctx, i) =>
      act(() =>
        addTripItem(
          String(i.trip_id),
          fd({ kind: s(i.kind), title: s(i.title), cost: amount(i.cost), date: s(i.date), endDate: s(i.end_date), note: s(i.note), url: s(i.url), place: s(i.place) }),
        ),
      ),
  },
  {
    name: "toggle_trip_item",
    label: "Ticked a trip item",
    description: "Tick or untick a trip checklist item (flips it).",
    input_schema: obj({ item_id: str("Trip item id") }),
    run: async (_ctx, i) => act(() => toggleTripItem(fd({ id: s(i.item_id) }))),
  },
  {
    name: "add_trip_savings",
    label: "Added to trip savings",
    description: "Put money aside for a trip (negative to take some back).",
    input_schema: obj({ trip_id: str("Trip id"), amount: { type: "number", description: "Dollars" } }),
    run: async (_ctx, i) => act(() => addTripSavings(String(i.trip_id), fd({ amount: amount(i.amount) }))),
  },

  // ================= review inbox =================
  {
    name: "accept_inbox_item",
    label: "Filed a mail item",
    description: "Accept one review-inbox item, filing its first draft as is (task, event, deadline, subscription…).",
    input_schema: obj({ item_id: str("Review item id from list_inbox") }),
    run: async (ctx, i) => {
      const rows = await withHub(ctx.user.id, (tx) => listPendingReviews(tx, ctx.user.id));
      const item = rows.find((r) => r.id === String(i.item_id));
      const draft = (item?.draft ?? null) as Draft | null;
      if (!item || !draft) return { error: "Item not found or has nothing to file." };
      return act(() => acceptReview(item.id, draft));
    },
  },
  {
    name: "discard_inbox_item",
    label: "Dismissed a mail item",
    description: "Dismiss one review-inbox item.",
    input_schema: obj({ item_id: str("Review item id") }),
    run: async (_ctx, i) => act(() => discardReview(String(i.item_id))),
  },

  // ================= needs a tap to confirm =================
  {
    name: "send_message",
    label: "Message to send",
    description:
      "Send a chat message to another person (by their id, from the people list or list_chats) or into an existing chat (chat_id). Not sent until the person taps Confirm.",
    input_schema: obj({
      to_person_id: optStr("Person id, for a one-to-one message"),
      chat_id: optStr("Existing chat id (group or hub chat)"),
      text: str("The message, written as the person would write it"),
    }),
    confirm: async (ctx, i) => {
      const text = String(i.text ?? "").slice(0, 400);
      if (s(i.chat_id)) {
        const rows = await listConversations(ctx.user.id);
        const c = rows.find((r) => r.id === s(i.chat_id) && r.kind !== "AI");
        if (!c) throw new Error("Chat not found.");
        return `→ ${conversationTitle(c, ctx.lang)}: « ${text} »`;
      }
      const who = (await contactsFor(ctx.user.id)).find((c) => c.id === s(i.to_person_id));
      if (!who) throw new Error("You can only message people you share a hub with.");
      return `→ ${who.name ?? "?"}: « ${text} »`;
    },
    run: async (ctx, i) => {
      const chatId = s(i.chat_id) ?? (await openDirect(ctx.user.id, String(i.to_person_id)));
      await postMessage(ctx.user, chatId, String(i.text ?? ""));
      return { sent: true, chatId };
    },
  },
  {
    name: "delete_item",
    label: "Delete",
    description: "Delete something. Not deleted until the person taps Confirm.",
    input_schema: obj({
      type: en(["task", "event", "deadline", "subscription", "budget_entry", "trip", "trip_item", "special_date"], "What kind"),
      id: str("Its id"),
    }),
    confirm: async (ctx, i) => {
      const title = await titleOf(ctx, String(i.type), String(i.id));
      if (!title) throw new Error("Not found in this hub.");
      return `🗑 ${title}`;
    },
    run: async (_ctx, i) => {
      const id = String(i.id);
      switch (i.type) {
        case "task":
          return act(() => deleteTask(fd({ id, inSheet: "1" })));
        case "event":
          return act(() => deleteEvent(fd({ id, inSheet: "1" })));
        case "deadline":
          return act(() => deleteDeadline(fd({ id, inSheet: "1" })));
        case "subscription":
          return act(() => deleteSubscription(fd({ id, inSheet: "1" })));
        case "budget_entry":
          return act(() => deleteEntry(id));
        case "trip":
          return act(() => deleteTrip(fd({ id })));
        case "trip_item":
          return act(() => deleteTripItem(fd({ id })));
        case "special_date":
          return act(() => deleteSpecialDate(fd({ id })));
        default:
          return { error: "Unknown type." };
      }
    },
  },
];

/** The thing's own title, read the way its page would (hub + privacy), for the confirm card. */
async function titleOf(ctx: ToolCtx, type: string, id: string): Promise<string | null> {
  const u = ctx.user.id;
  const h = ctx.hub.id;
  return withHub(u, async (tx) => {
    switch (type) {
      case "task":
        return (await tx.task.findFirst({ where: { id, hubId: h, ...visibleTo(u) }, select: { title: true } }))?.title ?? null;
      case "event":
        return (await tx.event.findFirst({ where: { id, hubId: h, ...visibleTo(u) }, select: { title: true } }))?.title ?? null;
      case "deadline":
        return (await tx.deadline.findFirst({ where: { id, hubId: h, ...visibleTo(u) }, select: { title: true } }))?.title ?? null;
      case "subscription":
        return (await tx.subscription.findFirst({ where: { id, hubId: h }, select: { name: true } }))?.name ?? null;
      case "budget_entry": {
        const e = await tx.budgetEntry.findFirst({ where: { id, hubId: h }, select: { category: true, amountCents: true } });
        return e ? `${e.category} ${(e.amountCents / 100).toFixed(2)} $` : null;
      }
      case "trip":
        return (await tx.trip.findFirst({ where: { id, hubId: h, ...visibleTo(u) }, select: { title: true } }))?.title ?? null;
      case "trip_item":
        return (await tx.tripItem.findFirst({ where: { id, trip: { hubId: h, ...visibleTo(u) } }, select: { title: true } }))?.title ?? null;
      case "special_date":
        return (await tx.specialDate.findFirst({ where: { id, hubId: h, ...visibleTo(u) }, select: { title: true } }))?.title ?? null;
      default:
        return null;
    }
  });
}

export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** What the API sees. Strict: inputs always match the schema. */
export function apiTools(): Anthropic.Beta.BetaTool[] {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Beta.BetaTool.InputSchema,
    strict: true,
  }));
}

/** Context the model needs to pick ids without a lookup: people, ventures, hubs. */
export async function hubContext(ctx: ToolCtx) {
  const [members, ventures, hubs] = await Promise.all([
    prisma.hubMembership.findMany({
      where: { hubId: ctx.hub.id, status: "ACTIVE" },
      select: { user: { select: { id: true, name: true, username: true } } },
    }),
    prisma.venture.findMany({ where: { hubId: ctx.hub.id, archived: false }, select: { id: true, name: true } }),
    prisma.hubMembership.findMany({ where: { userId: ctx.user.id, status: "ACTIVE" }, select: { hub: { select: { name: true } } } }),
  ]);
  return {
    people: members.map((m) => m.user),
    ventures,
    otherHubs: hubs.map((h) => h.hub.name).filter((n) => n !== ctx.hub.name),
  };
}

export { getConversation };
