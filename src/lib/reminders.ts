import { differenceInCalendarDays, startOfDay } from "date-fns";

import { prisma } from "@/lib/prisma";
import { withHub } from "@/lib/hub-context";
import { listMyHubs } from "@/lib/session";
import { sendPushToUser } from "@/lib/push";
import { dueLabel } from "@/lib/format";
import { isPlanAhead, occasionsBetween } from "@/lib/occasions";
import { nextOccurrence } from "@/lib/plans";
import { logInfo, reportError } from "@/lib/observability";
import { langOf, translate } from "@/lib/i18n";

/**
 * Per-item dated reminders — the thing `Deadline.remindDaysBefore` promised
 * and nothing delivered. `/deadlines` has been showing "reminds 7/3/1d
 * before" since Phase 1 while no code read the field.
 *
 * Runs off the daily digest cron rather than its own schedule: Vercel Hobby
 * allows two cron entries and both are already spent. Daily granularity is
 * the right resolution anyway — "3 days before" is a day, not a moment.
 *
 * Dedupe is a ledger row, not a flag on the item, because a deadline shared
 * by a hub owes each member their own reminder. A flag would let whoever the
 * loop reached first silence everyone else.
 *
 * Yearly things (special dates, holidays) key the ledger by occurrence —
 * `<id>:<year>` — so next year's reminder isn't suppressed by this year's.
 */

const ENTITY_DEADLINE = "deadline";
const ENTITY_SPECIAL = "specialDate";
const ENTITY_OCCASION = "occasion";

/** A week's notice for the days that need a gift or a reservation. */
const OCCASION_NOTICE_DAYS = 7;

type DueReminder = {
  entityType: string;
  entityId: string;
  daysBefore: number;
  title: string;
  dueDate: Date;
  hubName: string;
  url: string;
};

/**
 * Items this user can see whose date lands exactly on one of their configured
 * thresholds today, minus anything already sent.
 *
 * `differenceInCalendarDays` rather than a millisecond window: something due
 * "in 3 days" must match the 3-day threshold regardless of the time of day it
 * was created or the hour the cron happens to run.
 */
export async function collectDueReminders(
  userId: string,
): Promise<{ due: DueReminder[]; multiHub: boolean; lang: "en" | "fr" }> {
  const hubs = await listMyHubs(userId);
  if (hubs.length === 0) return { due: [], multiHub: false, lang: "en" };

  const today = startOfDay(new Date());
  const person = await prisma.user.findUnique({ where: { id: userId }, select: { locale: true } });
  const lang = langOf(person?.locale);

  const perHub = await withHub(userId, (tx) =>
    Promise.all(
      hubs.map(async (hub) => {
        // Mirrors the RLS privacy clause, as everywhere else in this codebase
        // — a private item must not generate a push to someone who can't open it.
        const privacy = { OR: [{ visibility: "SHARED" as const }, { createdById: userId }] };

        const [deadlines, specials] = await Promise.all([
          tx.deadline.findMany({
            where: { hubId: hub.id, doneAt: null, dueDate: { gte: today }, ...privacy },
            select: { id: true, title: true, dueDate: true, remindDaysBefore: true },
          }),
          tx.specialDate.findMany({
            where: { hubId: hub.id, ...privacy },
            select: { id: true, title: true, month: true, day: true, remindDaysBefore: true },
          }),
        ]);

        const fromDeadlines = deadlines.flatMap((d) => {
          const away = differenceInCalendarDays(startOfDay(d.dueDate), today);
          return d.remindDaysBefore
            .filter((n) => n === away)
            .map((daysBefore) => ({
              entityType: ENTITY_DEADLINE,
              entityId: d.id,
              daysBefore,
              title: d.title,
              dueDate: d.dueDate,
              hubName: hub.name,
              url: "/deadlines",
            }));
        });

        const fromSpecials = specials.flatMap((s) => {
          const next = nextOccurrence(s.month, s.day, today);
          const away = differenceInCalendarDays(next, today);
          return s.remindDaysBefore
            .filter((n) => n === away)
            .map((daysBefore) => ({
              entityType: ENTITY_SPECIAL,
              entityId: `${s.id}:${next.getFullYear()}`,
              daysBefore,
              title: s.title,
              dueDate: next,
              hubName: hub.name,
              url: "/calendar/dates",
            }));
        });

        return [...fromDeadlines, ...fromSpecials];
      }),
    ),
  );

  // Holidays are the same for every hub, so one heads-up per user no matter
  // how many hubs have them switched on.
  const occasionHub = hubs.find((h) => h.showOccasions);
  const target = new Date(today.getTime() + OCCASION_NOTICE_DAYS * 864e5);
  const fromOccasions = occasionHub
    ? occasionsBetween(target, target, lang)
        .filter((o) => isPlanAhead(o.kind))
        .map((o) => ({
          entityType: ENTITY_OCCASION,
          entityId: o.key,
          daysBefore: OCCASION_NOTICE_DAYS,
          title: `${o.emoji} ${o.title}`,
          dueDate: o.date,
          hubName: occasionHub.name,
          url: "/calendar",
        }))
    : [];

  const multiHub = hubs.length > 1;
  const candidates = [...perHub.flat(), ...fromOccasions];
  if (candidates.length === 0) return { due: [], multiHub, lang };

  const alreadySent = await prisma.reminderSent.findMany({
    where: {
      userId,
      entityType: { in: [ENTITY_DEADLINE, ENTITY_SPECIAL, ENTITY_OCCASION] },
      entityId: { in: candidates.map((c) => c.entityId) },
    },
    select: { entityType: true, entityId: true, daysBefore: true },
  });
  const key = (r: { entityType: string; entityId: string; daysBefore: number }) =>
    `${r.entityType}:${r.entityId}:${r.daysBefore}`;
  const sent = new Set(alreadySent.map(key));

  return {
    due: candidates.filter((c) => !sent.has(key(c))),
    multiHub,
    lang,
  };
}

/**
 * Sends one push per due reminder and records it. The ledger row is written
 * *after* a successful send, so a push failure retries tomorrow rather than
 * marking a reminder delivered that never arrived.
 */
export async function dispatchReminders(userId: string): Promise<number> {
  let sent = 0;

  let due: DueReminder[];
  let multiHub = false;
  let lang: "en" | "fr" = "en";
  try {
    const collected = await collectDueReminders(userId);
    due = collected.due;
    multiHub = collected.multiHub;
    lang = collected.lang;
  } catch (err) {
    await reportError("reminders.collect_failed", err, { userId });
    return 0;
  }

  for (const r of due) {
    try {
      const tr = (k: string, v?: Record<string, string | number>) => translate(lang, k, v);
      const when =
        r.daysBefore === 0
          ? tr("Today")
          : r.daysBefore === 1
            ? tr("Tomorrow")
            : tr("In {n} days", { n: r.daysBefore });
      const result = await sendPushToUser(userId, {
        title:
          r.entityType === ENTITY_DEADLINE
            ? r.daysBefore === 0
              ? tr("Due today")
              : tr("Due in {n} days", { n: r.daysBefore })
            : when,
        body:
          multiHub && r.entityType !== ENTITY_OCCASION
            ? `${r.title} — ${dueLabel(r.dueDate, lang)} [${r.hubName}]`
            : `${r.title} — ${dueLabel(r.dueDate, lang)}`,
        url: r.url,
        tag: `reminder-${r.entityType}-${r.entityId}-${r.daysBefore}`,
      });

      // No push subscriptions on any device is not a failure to retry
      // forever — record it so we stop reconsidering this threshold daily.
      await prisma.reminderSent.create({
        data: {
          userId,
          entityType: r.entityType,
          entityId: r.entityId,
          daysBefore: r.daysBefore,
        },
      });
      if (result.sent > 0) sent++;
    } catch (err) {
      // Unique-violation means a concurrent run already recorded it; anything
      // else is worth knowing about. Either way, don't abort the rest.
      const code = (err as { code?: string })?.code;
      if (code !== "P2002") {
        await reportError("reminders.send_failed", err, { userId, entityId: r.entityId });
      }
    }
  }

  if (sent > 0) logInfo("reminders.sent", { userId, count: sent });
  return sent;
}
