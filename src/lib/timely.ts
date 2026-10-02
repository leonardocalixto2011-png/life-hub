import { differenceInCalendarDays, format, startOfDay } from "date-fns";

import { DEBT_CONSENTED } from "@/lib/consent";
import { prisma } from "@/lib/prisma";
import { mapLimit } from "@/lib/async";
import { sendPushToUser, viewAction, type PushPayload } from "@/lib/push";
import { money } from "@/lib/format";
import { fmt, fmtDay, langOf, translate, type Lang } from "@/lib/i18n";
import { logInfo, reportError } from "@/lib/observability";

/**
 * Timely reminders — the pushes that fire *near the moment* something is due,
 * as opposed to the 8 a.m. digest (`/api/cron/digest`) and the day-granular
 * deadline reminders (`lib/reminders.ts`) that ride it.
 *
 * Vercel Hobby only allows daily crons, so this rides the external scheduler
 * that already hits `/api/mail/poll` every 15–30 min (and is exposed on its own
 * at `/api/cron/reminders`, same secret, for a separate schedule later).
 *
 * Sends:
 *  - events (kind EVENT, not SHIFT) starting within the next hour → attendees
 *    + creator; a PRIVATE event → its creator only;
 *  - subscription cancel-by: 3 days before and on the day → the owner only;
 *  - debt payment due tomorrow → the debt's owner only (name, date, payment
 *    amount — never balance, APR or status, same rule as the digests).
 *
 * Tasks are deliberately absent: `Task.dueDate` is a day, not a time, and the
 * morning digest already covers "due today".
 *
 * This is a system job with no session, so it reads with the trusted client
 * and enforces scoping itself: every recipient must be an ACTIVE member of the
 * item's hub, and the visibility/owner rules above mirror the RLS policies.
 *
 * Idempotency: `ReminderSent`, one row per (user, entityType, entityId,
 * daysBefore). Entity ids carry the date/time they were computed for, so a
 * rescheduled event or a rolled-forward due date reminds again, while a
 * 15-minute cadence never double-sends. The row is claimed *before* sending
 * (the unique index arbitrates between overlapping runs) and released if no
 * device accepted the push, so a transient failure retries next run.
 */

export const ENTITY_EVENT_SOON = "eventSoon";
export const ENTITY_CANCEL_BY = "cancelBy";
export const ENTITY_DEBT_DUE = "debtDue";

/** How far ahead an event is announced. */
export const EVENT_LEAD_MS = 60 * 60_000;
/** Day-granular pushes (cancel-by, debt) only go out in waking hours. */
export const DAY_START_HOUR = 9;
export const DAY_END_HOUR = 21;
export const CANCEL_BY_DAYS = [3, 0];

// --------------------------------------------------------------------------
// Pure selection — no I/O, unit-checkable.
// --------------------------------------------------------------------------

export type EventRow = {
  id: string;
  hubId: string;
  title: string;
  startAt: Date;
  location: string | null;
  visibility: "PRIVATE" | "SHARED";
  createdById: string;
  attendeeIds: string[];
  hubName: string;
};
export type SubRow = {
  id: string;
  hubId: string;
  name: string;
  cancelByDate: Date;
  ownerId: string | null;
  costCents: number;
  currency: string;
};
export type DebtRow = {
  id: string;
  hubId: string;
  ownerId: string;
  name: string;
  dueDate: Date;
  paymentCents: number | null;
  currency: string;
};

/** A reminder owed to one person, before language is applied. */
export type Candidate =
  | { kind: "event"; userId: string; entityId: string; daysBefore: 0; row: EventRow }
  | { kind: "cancelBy"; userId: string; entityId: string; daysBefore: number; row: SubRow }
  | { kind: "debt"; userId: string; entityId: string; daysBefore: 1; row: DebtRow };

export const ENTITY_OF: Record<Candidate["kind"], string> = {
  event: ENTITY_EVENT_SOON,
  cancelBy: ENTITY_CANCEL_BY,
  debt: ENTITY_DEBT_DUE,
};

const dayKey = (d: Date) => format(d, "yyyy-MM-dd");

export function isDaytime(now: Date): boolean {
  const h = now.getHours();
  return h >= DAY_START_HOUR && h < DAY_END_HOUR;
}

/** Who may hear about an event: PRIVATE → creator; SHARED → attendees + creator.
 *  Always intersected with the hub's active members. */
export function eventRecipients(e: EventRow, activeMembers: Set<string>): string[] {
  const who = e.visibility === "PRIVATE" ? [e.createdById] : [e.createdById, ...e.attendeeIds];
  return [...new Set(who)].filter((id) => activeMembers.has(`${e.hubId}:${id}`));
}

/**
 * Everything owed right now. `activeMembers` holds `${hubId}:${userId}` keys.
 * Rows are expected to be pre-filtered by the query, but every rule is
 * re-checked here so the function is correct on its own.
 */
export function selectCandidates(input: {
  now: Date;
  events: EventRow[];
  subs: SubRow[];
  debts: DebtRow[];
  activeMembers: Set<string>;
}): Candidate[] {
  const { now, activeMembers } = input;
  const today = startOfDay(now);
  const out: Candidate[] = [];

  for (const e of input.events) {
    const ms = e.startAt.getTime() - now.getTime();
    if (ms <= 0 || ms > EVENT_LEAD_MS) continue;
    for (const userId of eventRecipients(e, activeMembers)) {
      out.push({
        kind: "event",
        userId,
        entityId: `${e.id}:${e.startAt.toISOString()}`,
        daysBefore: 0,
        row: e,
      });
    }
  }

  if (isDaytime(now)) {
    for (const s of input.subs) {
      if (!s.ownerId || !activeMembers.has(`${s.hubId}:${s.ownerId}`)) continue;
      const away = differenceInCalendarDays(startOfDay(s.cancelByDate), today);
      if (!CANCEL_BY_DAYS.includes(away)) continue;
      out.push({
        kind: "cancelBy",
        userId: s.ownerId,
        entityId: `${s.id}:${dayKey(s.cancelByDate)}`,
        daysBefore: away,
        row: s,
      });
    }

    for (const d of input.debts) {
      // Debts are person-owned; the owner is the only recipient, ever.
      if (differenceInCalendarDays(startOfDay(d.dueDate), today) !== 1) continue;
      out.push({
        kind: "debt",
        userId: d.ownerId,
        entityId: `${d.id}:${dayKey(d.dueDate)}`,
        daysBefore: 1,
        row: d,
      });
    }
  }

  return out;
}

/** "18 h" / "18 h 30" / "6 PM" / "6:30 PM" */
function clock(d: Date, lang: Lang): string {
  const whole = d.getMinutes() === 0;
  if (lang === "fr") return fmt(d, whole ? "H 'h'" : "H 'h' mm", lang);
  return fmt(d, whole ? "h a" : "h:mm a", lang);
}

/** The push itself, in the recipient's language. */
export function messageFor(c: Candidate, now: Date, lang: Lang, locale: string | null): PushPayload {
  const t = (k: string, v?: Record<string, string | number>) => translate(lang, k, v);
  const loc = locale ?? undefined;
  const tag = `${ENTITY_OF[c.kind]}-${c.entityId}-${c.daysBefore}`;
  // None of these is a task (see the header), so there is nothing to tick
  // from the notification — just a labelled way in.
  const actions = viewAction(lang);

  if (c.kind === "event") {
    const mins = Math.max(1, Math.round((c.row.startAt.getTime() - now.getTime()) / 60_000));
    const vars = { title: c.row.title, time: clock(c.row.startAt, lang), n: mins };
    return {
      title: mins >= 50 ? t("In 1 h: {title} ({time})", vars) : t("In {n} min: {title} ({time})", vars),
      body: [c.row.location, c.row.hubName].filter(Boolean).join(" · "),
      url: `/calendar/${c.row.id}`,
      tag,
      actions,
    };
  }

  if (c.kind === "cancelBy") {
    return {
      title:
        c.daysBefore === 0
          ? t("Last day to cancel: {name}", { name: c.row.name })
          : t("Cancel {name} within {n} days", { name: c.row.name, n: c.daysBefore }),
      body: t("Otherwise it keeps billing {amount}.", {
        amount: money(c.row.costCents, c.row.currency, loc),
      }),
      url: `/subscriptions/${c.row.id}`,
      tag,
      actions,
    };
  }

  return {
    title: t("Payment due tomorrow: {name}", { name: c.row.name }),
    body:
      c.row.paymentCents != null
        ? t("{amount} due {date}", { amount: money(c.row.paymentCents, c.row.currency, loc), date: fmtDay(c.row.dueDate, lang) })
        : t("Due {date}", { date: fmtDay(c.row.dueDate, lang) }),
    url: `/debts/${c.row.id}`,
    tag,
    actions,
  };
}

// --------------------------------------------------------------------------
// I/O — collect, dedupe, send.
// --------------------------------------------------------------------------

async function collect(now: Date) {
  const today = startOfDay(now);
  const daytime = isDaytime(now);

  const [events, subs, debts] = await Promise.all([
    prisma.event.findMany({
      where: { kind: "EVENT", startAt: { gt: now, lte: new Date(now.getTime() + EVENT_LEAD_MS) } },
      select: {
        id: true,
        hubId: true,
        title: true,
        startAt: true,
        location: true,
        visibility: true,
        createdById: true,
        attendeeIds: true,
        hub: { select: { name: true } },
      },
    }),
    daytime
      ? prisma.subscription.findMany({
          where: {
            status: "ACTIVE",
            ownerId: { not: null },
            cancelByDate: { gte: today, lt: new Date(today.getTime() + 4 * 864e5) },
          },
          select: { id: true, hubId: true, name: true, cancelByDate: true, ownerId: true, costCents: true, currency: true },
        })
      : Promise.resolve([]),
    daytime
      ? prisma.debt.findMany({
          // Deliberately narrow, like the digests: name, when, how much.
          where: {
            owner: DEBT_CONSENTED,
            status: { not: "PAID_OFF" },
            dueDate: { gte: new Date(today.getTime() + 864e5 / 2), lt: new Date(today.getTime() + 2.5 * 864e5) },
          },
          select: {
            id: true,
            hubId: true,
            ownerId: true,
            name: true,
            dueDate: true,
            actualPaymentCents: true,
            minimumPaymentCents: true,
            hub: { select: { currency: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const hubIds = [...new Set([...events.map((e) => e.hubId), ...subs.map((s) => s.hubId)])];
  const memberships = hubIds.length
    ? await prisma.hubMembership.findMany({
        where: { hubId: { in: hubIds }, status: "ACTIVE" },
        select: { hubId: true, userId: true },
      })
    : [];

  return {
    now,
    activeMembers: new Set(memberships.map((m) => `${m.hubId}:${m.userId}`)),
    events: events.map(({ hub, ...e }) => ({ ...e, hubName: hub.name })),
    subs: subs.map((s) => ({ ...s, cancelByDate: s.cancelByDate! })),
    debts: debts.map((d) => ({
      id: d.id,
      hubId: d.hubId,
      ownerId: d.ownerId,
      name: d.name,
      dueDate: d.dueDate!,
      paymentCents: d.actualPaymentCents ?? d.minimumPaymentCents,
      currency: d.hub.currency,
    })),
  };
}

export type TimelyResult = { candidates: number; sent: number; skipped: number; outOfTime: boolean };

export async function dispatchTimelyReminders(budgetMs = 5_000): Promise<TimelyResult> {
  const started = Date.now();
  const now = new Date();
  const candidates = selectCandidates(await collect(now));
  if (candidates.length === 0) return { candidates: 0, sent: 0, skipped: 0, outOfTime: false };

  // Drop what the ledger already has.
  const already = await prisma.reminderSent.findMany({
    where: {
      entityType: { in: Object.values(ENTITY_OF) },
      entityId: { in: candidates.map((c) => c.entityId) },
    },
    select: { userId: true, entityType: true, entityId: true, daysBefore: true },
  });
  const key = (userId: string, type: string, id: string, n: number) => `${userId}|${type}|${id}|${n}`;
  const seen = new Set(already.map((r) => key(r.userId, r.entityType, r.entityId, r.daysBefore)));
  const fresh = candidates.filter((c) => !seen.has(key(c.userId, ENTITY_OF[c.kind], c.entityId, c.daysBefore)));
  if (fresh.length === 0) return { candidates: candidates.length, sent: 0, skipped: 0, outOfTime: false };

  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(fresh.map((c) => c.userId))] } },
    select: {
      id: true,
      locale: true,
      notificationPref: { select: { pushEnabled: true } },
      _count: { select: { pushSubscriptions: true } },
    },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  let sent = 0;
  let skipped = 0;
  let outOfTime = false;

  await mapLimit(fresh, 4, async (c) => {
    if (Date.now() - started > budgetMs) {
      outOfTime = true;
      return;
    }
    const u = byId.get(c.userId);
    // Push off, or no device yet: not recorded, so turning push on within the
    // window still gets the reminder.
    if (!u || !(u.notificationPref?.pushEnabled ?? true) || u._count.pushSubscriptions === 0) {
      skipped++;
      return;
    }
    const entityType = ENTITY_OF[c.kind];
    const ledger = { userId: c.userId, entityType, entityId: c.entityId, daysBefore: c.daysBefore };
    try {
      await prisma.reminderSent.create({ data: ledger });
    } catch (err) {
      if ((err as { code?: string })?.code === "P2002") return; // another run has it
      await reportError("timely.claim_failed", err, { userId: c.userId, entityType });
      return;
    }
    try {
      const r = await sendPushToUser(c.userId, messageFor(c, now, langOf(u.locale), u.locale));
      if (r.sent > 0) sent++;
      else if (r.failed > 0) {
        await prisma.reminderSent.deleteMany({ where: ledger });
      }
    } catch (err) {
      await prisma.reminderSent.deleteMany({ where: ledger }).catch(() => {});
      await reportError("timely.send_failed", err, { userId: c.userId, entityType });
    }
  });

  if (sent > 0 || outOfTime) logInfo("timely.sent", { sent, skipped, outOfTime });
  return { candidates: candidates.length, sent, skipped, outOfTime };
}
