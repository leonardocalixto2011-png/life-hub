import { endOfDay, startOfDay } from "date-fns";

import type { HubTx } from "@/lib/hub-context";
import { withHub } from "@/lib/hub-context";
import { listMyHubs, type SessionHub } from "@/lib/session";
import { advanceLapsedRenewals } from "@/lib/data";

type WithHub<T> = T & { hubName: string };

function tagHub<T>(rows: T[], hub: SessionHub): WithHub<T>[] {
  return rows.map((r) => ({ ...r, hubName: hub.name }));
}

/** Mirrors data.ts's visibilityFilter — see that comment for why this is a
 *  real backstop and not just belt-and-suspenders. */
function vis(userId: string) {
  return { OR: [{ visibility: "SHARED" as const }, { createdById: userId }] };
}

const ventureName = { venture: { select: { name: true } } } as const;

async function collectDigestInHub(tx: HubTx, hubId: string, userId: string, windowHours: number) {
  const now = new Date();
  const horizon = endOfDay(new Date(now.getTime() + windowHours * 3600_000));
  const todayStart = startOfDay(now);

  await advanceLapsedRenewals(tx, hubId);

  const [overdueTasks, dueTasks, deadlines, renewals, cancelBys, events] = await Promise.all([
    tx.task.findMany({
      where: { hubId, status: "OPEN", dueDate: { lt: todayStart }, ...vis(userId) },
      include: ventureName,
      orderBy: { dueDate: "asc" },
    }),
    tx.task.findMany({
      where: { hubId, status: "OPEN", dueDate: { gte: todayStart, lte: horizon }, ...vis(userId) },
      include: ventureName,
      orderBy: { dueDate: "asc" },
    }),
    tx.deadline.findMany({
      where: { hubId, doneAt: null, dueDate: { lte: horizon }, ...vis(userId) },
      include: ventureName,
      orderBy: { dueDate: "asc" },
    }),
    tx.subscription.findMany({
      where: { hubId, status: "ACTIVE", renewalDate: { gte: todayStart, lte: horizon } },
      include: ventureName,
      orderBy: { renewalDate: "asc" },
    }),
    tx.subscription.findMany({
      where: { hubId, status: "ACTIVE", cancelByDate: { gte: todayStart, lte: horizon } },
      include: ventureName,
      orderBy: { cancelByDate: "asc" },
    }),
    // Events feed the push line ("Souper chez maman 18 h") and the email.
    // Shifts stay out, as on every other calendar surface. endAt >= now so a
    // morning digest doesn't list what already happened at 7 a.m.
    tx.event.findMany({
      where: { hubId, kind: "EVENT", endAt: { gte: now }, startAt: { lte: horizon }, ...vis(userId) },
      select: { title: true, startAt: true, ...ventureName },
      orderBy: { startAt: "asc" },
    }),
  ]);

  return { overdueTasks, dueTasks, deadlines, renewals, cancelBys, events };
}

/**
 * Everything a user should look at in the next `windowHours` hours, plus
 * anything already overdue, merged across every hub they belong to. Each hub
 * is queried through withHub() so RLS naturally excludes other hubs' data and
 * other members' private items — this function only ever sees what that one
 * user is allowed to see.
 */
export async function collectDigestForUser(userId: string, windowHours = 48) {
  const now = new Date();
  const hubs = await listMyHubs(userId);

  // Debts are personal, not hub-scoped: querying them inside the per-hub loop
  // would repeat every row once per hub the user belongs to.
  const horizon = endOfDay(new Date(now.getTime() + windowHours * 3600_000));
  const [perHub, debts] = await withHub(userId, (tx) =>
    Promise.all([
      Promise.all(hubs.map((hub) => collectDigestInHub(tx, hub.id, userId, windowHours).then((d) => ({ hub, d })))),
      tx.debt.findMany({
        // Only the recipient's own. A digest must never carry another member's
        // balances into someone else's inbox. Deliberately narrow: name, when,
        // how much — balance, APR and DEFAULT status stay out of email.
        where: { ownerId: userId, status: { not: "PAID_OFF" }, dueDate: { gte: startOfDay(now), lte: horizon } },
        select: { name: true, dueDate: true, actualPaymentCents: true, minimumPaymentCents: true },
        orderBy: { dueDate: "asc" },
      }),
    ]),
  );

  const overdueTasks = perHub.flatMap(({ hub, d }) => tagHub(d.overdueTasks, hub));
  const dueTasks = perHub.flatMap(({ hub, d }) => tagHub(d.dueTasks, hub));
  const deadlines = perHub.flatMap(({ hub, d }) => tagHub(d.deadlines, hub));
  const renewals = perHub.flatMap(({ hub, d }) => tagHub(d.renewals, hub));
  const cancelBys = perHub.flatMap(({ hub, d }) => tagHub(d.cancelBys, hub));
  const events = perHub
    .flatMap(({ hub, d }) => tagHub(d.events, hub))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  const count =
    overdueTasks.length +
    dueTasks.length +
    deadlines.length +
    renewals.length +
    cancelBys.length +
    events.length +
    debts.length;

  return {
    now,
    windowHours,
    multiHub: hubs.length > 1,
    count,
    overdueTasks,
    dueTasks,
    deadlines,
    events,
    renewals,
    cancelBys,
    debts,
  };
}

export type DigestData = Awaited<ReturnType<typeof collectDigestForUser>>;

// ---------------------------------------------------------------------------
// Weekly rollup — one short paragraph, sent Monday mornings.
// ---------------------------------------------------------------------------

async function collectWeeklyInHub(tx: HubTx, hubId: string, userId: string) {
  const now = new Date();
  const start = startOfDay(now);
  const end = endOfDay(new Date(now.getTime() + 7 * 864e5));

  const [dueTasks, overdueTasks, deadlines, renewals, budget] = await Promise.all([
    tx.task.count({ where: { hubId, status: "OPEN", dueDate: { gte: start, lte: end }, ...vis(userId) } }),
    tx.task.count({ where: { hubId, status: "OPEN", dueDate: { lt: start }, ...vis(userId) } }),
    tx.deadline.count({ where: { hubId, doneAt: null, dueDate: { gte: start, lte: end }, ...vis(userId) } }),
    tx.subscription.findMany({
      where: { hubId, status: "ACTIVE", renewalDate: { gte: start, lte: end } },
      select: { name: true, costCents: true, currency: true },
    }),
    (async () => {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const entries = await tx.budgetEntry.findMany({
        where: { hubId, date: { gte: from, lte: now } },
        select: { type: true, amountCents: true },
      });
      let income = 0;
      let expense = 0;
      for (const e of entries) {
        if (e.type === "INCOME") income += e.amountCents;
        else expense += e.amountCents;
      }
      return { income, expense, net: income - expense };
    })(),
  ]);

  return { dueTasks, overdueTasks, deadlines, renewals, budget };
}

/** Same per-user, per-hub merge as collectDigestForUser — see its comment. */
export async function collectWeeklyForUser(userId: string) {
  const now = new Date();
  const hubs = await listMyHubs(userId);

  // Personal, so outside the per-hub loop — see collectDigestForUser.
  const weekStart = startOfDay(now);
  const weekEnd = endOfDay(new Date(now.getTime() + 7 * 864e5));
  const [perHub, debts] = await withHub(userId, (tx) =>
    Promise.all([
      Promise.all(hubs.map((hub) => collectWeeklyInHub(tx, hub.id, userId).then((w) => ({ hub, w })))),
      tx.debt.findMany({
        where: { ownerId: userId, status: { not: "PAID_OFF" }, dueDate: { gte: weekStart, lte: weekEnd } },
        select: { name: true, actualPaymentCents: true, minimumPaymentCents: true },
      }),
    ]),
  );

  const dueTasks = perHub.reduce((n, { w }) => n + w.dueTasks, 0);
  const overdueTasks = perHub.reduce((n, { w }) => n + w.overdueTasks, 0);
  const deadlines = perHub.reduce((n, { w }) => n + w.deadlines, 0);
  const renewals = perHub.flatMap(({ hub, w }) => tagHub(w.renewals, hub));
  const renewalTotal = renewals.reduce((n, r) => n + r.costCents, 0);
  const currency = renewals[0]?.currency ?? "CAD";
  const debtTotal = debts.reduce(
    (n, d) => n + (d.actualPaymentCents ?? d.minimumPaymentCents ?? 0),
    0,
  );
  const budget = perHub.reduce(
    (b, { w }) => ({
      income: b.income + w.budget.income,
      expense: b.expense + w.budget.expense,
      net: b.net + w.budget.net,
    }),
    { income: 0, expense: 0, net: 0 },
  );

  return { now, dueTasks, overdueTasks, deadlines, renewals, renewalTotal, debts, debtTotal, currency, budget };
}

export type WeeklyData = Awaited<ReturnType<typeof collectWeeklyForUser>>;

// Rendering (subject / text / HTML / push, per recipient language) lives in
// digest-text.ts — pure, so it can be checked without a database.
export {
  digestHtml,
  digestPush,
  digestSubject,
  digestText,
  weeklyHtml,
  weeklySubject,
  weeklyText,
  type Reader,
} from "@/lib/digest-text";
