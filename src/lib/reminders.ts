import { differenceInCalendarDays, startOfDay } from "date-fns";

import { prisma } from "@/lib/prisma";
import { withHub } from "@/lib/hub-context";
import { listMyHubs } from "@/lib/session";
import { sendPushToUser } from "@/lib/push";
import { dueLabel } from "@/lib/format";
import { logInfo, reportError } from "@/lib/observability";

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
 */

const ENTITY_DEADLINE = "deadline";

type DueReminder = {
  entityType: string;
  entityId: string;
  daysBefore: number;
  title: string;
  dueDate: Date;
  hubName: string;
};

/**
 * Deadlines this user can see whose due date lands exactly on one of their
 * configured thresholds today, minus anything already sent.
 *
 * `differenceInCalendarDays` rather than a millisecond window: a deadline due
 * "in 3 days" must match the 3-day threshold regardless of the time of day it
 * was created or the hour the cron happens to run.
 */
export async function collectDueReminders(
  userId: string,
): Promise<{ due: DueReminder[]; multiHub: boolean }> {
  const hubs = await listMyHubs(userId);
  if (hubs.length === 0) return { due: [], multiHub: false };

  const today = startOfDay(new Date());

  const perHub = await withHub(userId, (tx) =>
    Promise.all(
      hubs.map(async (hub) => {
        const deadlines = await tx.deadline.findMany({
          where: {
            hubId: hub.id,
            doneAt: null,
            dueDate: { gte: today },
            // Mirrors the RLS privacy clause, as everywhere else in this
            // codebase — a private deadline must not generate a push to
            // someone who can't open it.
            OR: [{ visibility: "SHARED" }, { createdById: userId }],
          },
          select: { id: true, title: true, dueDate: true, remindDaysBefore: true },
        });

        return deadlines.flatMap((d) => {
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
            }));
        });
      }),
    ),
  );

  const multiHub = hubs.length > 1;
  const candidates = perHub.flat();
  if (candidates.length === 0) return { due: [], multiHub };

  const alreadySent = await prisma.reminderSent.findMany({
    where: {
      userId,
      entityType: ENTITY_DEADLINE,
      entityId: { in: candidates.map((c) => c.entityId) },
    },
    select: { entityId: true, daysBefore: true },
  });
  const sent = new Set(alreadySent.map((r) => `${r.entityId}:${r.daysBefore}`));

  return {
    due: candidates.filter((c) => !sent.has(`${c.entityId}:${c.daysBefore}`)),
    multiHub,
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
  try {
    const collected = await collectDueReminders(userId);
    due = collected.due;
    multiHub = collected.multiHub;
  } catch (err) {
    await reportError("reminders.collect_failed", err, { userId });
    return 0;
  }

  for (const r of due) {
    try {
      const result = await sendPushToUser(userId, {
        title: r.daysBefore === 0 ? "Due today" : `Due in ${r.daysBefore} day${r.daysBefore === 1 ? "" : "s"}`,
        body: multiHub ? `${r.title} — ${dueLabel(r.dueDate)} [${r.hubName}]` : `${r.title} — ${dueLabel(r.dueDate)}`,
        url: "/deadlines",
        tag: `reminder-${r.entityId}-${r.daysBefore}`,
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
