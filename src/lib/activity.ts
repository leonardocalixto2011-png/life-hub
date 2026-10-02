import type { ActivityVerb, Visibility } from "@prisma/client";

import type { HubTx } from "@/lib/hub-context";
import type { Lang, T } from "@/lib/i18n";

/**
 * The hub's activity feed — "who did what". One helper writes it
 * (`logActivity`, called by the server action that did the thing, inside that
 * action's own transaction) and a few read it (/today's card, /activity).
 *
 * Three rules, all enforced here rather than at each call site:
 *   - A line copies its item's visibility. A PRIVATE task's "added" / "done"
 *     is stored PRIVATE and shown to its actor only (RLS activity_select, and
 *     `activityScope` below as the app-level mirror).
 *   - Debts never appear. No debt action calls this, and `logDebtPayment`'s
 *     budget entry is written directly, not through a logged path.
 *   - Logging is best-effort: it must never fail the action it describes.
 */

export type ActivityEntity = "task" | "event" | "deadline" | "budget" | "trip" | "member";

export type ActivityInput = {
  hubId: string;
  actorId: string;
  verb: ActivityVerb;
  entityType: ActivityEntity;
  entityId?: string | null;
  /** The item's title. Truncated; never an email address, never a debt. */
  summary: string;
  amountCents?: number | null;
  /** TASK_ASSIGNED: who it was given to. */
  targetId?: string | null;
  visibility?: Visibility;
};

/**
 * Writes one feed line inside the caller's transaction.
 *
 * Wrapped in a SAVEPOINT: in Postgres a failed statement aborts the whole
 * transaction, so a plain try/catch around the insert would swallow the error
 * and then fail the caller's *next* statement instead. Rolling back to the
 * savepoint undoes only the insert and leaves the action's own writes intact.
 */
export async function logActivity(tx: HubTx, a: ActivityInput): Promise<void> {
  try {
    await tx.$executeRawUnsafe("SAVEPOINT activity_log");
  } catch {
    return; // not in a transaction we can protect — skip rather than risk it
  }
  try {
    await tx.activity.create({
      data: {
        hubId: a.hubId,
        actorId: a.actorId,
        verb: a.verb,
        entityType: a.entityType,
        entityId: a.entityId ?? null,
        summary: a.summary.trim().slice(0, 200),
        amountCents: a.amountCents ?? null,
        targetId: a.targetId ?? null,
        visibility: a.visibility ?? "SHARED",
      },
      select: { id: true },
    });
    await tx.$executeRawUnsafe("RELEASE SAVEPOINT activity_log");
  } catch {
    try {
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT activity_log");
    } catch {
      // Nothing more to do; the caller's own statements will surface it.
    }
  }
}

/** App-level mirror of activity_select — keep in sync with the migration. */
export function activityScope(hubId: string, userId: string) {
  return { hubId, OR: [{ visibility: "SHARED" as const }, { actorId: userId }] };
}

export type ActivityRow = {
  id: string;
  actorId: string;
  verb: ActivityVerb;
  entityType: string;
  entityId: string | null;
  summary: string;
  amountCents: number | null;
  targetId: string | null;
  thankedById: string[];
  createdAt: Date;
};

const ROW_SELECT = {
  id: true,
  actorId: true,
  verb: true,
  entityType: true,
  entityId: true,
  summary: true,
  amountCents: true,
  targetId: true,
  thankedById: true,
  createdAt: true,
} as const;

/** Newest first. Fetches one extra row so the caller knows if there is a next page. */
export async function listActivity(
  tx: HubTx,
  hubId: string,
  userId: string,
  opts: { take: number; skip?: number },
): Promise<{ rows: ActivityRow[]; hasMore: boolean }> {
  const rows = await tx.activity.findMany({
    where: activityScope(hubId, userId),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: opts.take + 1,
    skip: opts.skip ?? 0,
    select: ROW_SELECT,
  });
  return { rows: rows.slice(0, opts.take), hasMore: rows.length > opts.take };
}

/**
 * Where a line leads, or null when its item is gone (or was made private since).
 * One query per kind present, each with the same hub + privacy clause the item's
 * own pages use — a line must not become a way to learn that a hidden item exists.
 */
export async function activityLinks(
  tx: HubTx,
  hubId: string,
  userId: string,
  rows: ActivityRow[],
): Promise<Map<string, string>> {
  const ids = (type: string) =>
    Array.from(new Set(rows.filter((r) => r.entityType === type && r.entityId).map((r) => r.entityId!)));
  const visible = { hubId, OR: [{ visibility: "SHARED" as const }, { createdById: userId }] };
  const [tasks, events, deadlines, trips] = await Promise.all([
    ids("task").length
      ? tx.task.findMany({ where: { id: { in: ids("task") }, ...visible }, select: { id: true } })
      : [],
    ids("event").length
      ? tx.event.findMany({ where: { id: { in: ids("event") }, ...visible }, select: { id: true } })
      : [],
    ids("deadline").length
      ? tx.deadline.findMany({ where: { id: { in: ids("deadline") }, ...visible }, select: { id: true } })
      : [],
    ids("trip").length
      ? tx.trip.findMany({ where: { id: { in: ids("trip") }, ...visible }, select: { id: true } })
      : [],
  ]);
  const alive = {
    task: new Set(tasks.map((x) => x.id)),
    event: new Set(events.map((x) => x.id)),
    deadline: new Set(deadlines.map((x) => x.id)),
    trip: new Set(trips.map((x) => x.id)),
  };
  const base = { task: "/tasks/", event: "/calendar/", deadline: "/deadlines/", trip: "/trips/" } as const;

  const out = new Map<string, string>();
  for (const r of rows) {
    if (r.entityType === "budget") out.set(r.id, "/budget");
    else if (r.entityType === "member") out.set(r.id, `/hubs/${hubId}/members`);
    else if (r.entityId && r.entityType in alive) {
      const k = r.entityType as keyof typeof alive;
      if (alive[k].has(r.entityId)) out.set(r.id, base[k] + r.entityId);
    }
  }
  return out;
}

/** A page of the feed plus where each line leads — what both screens need, in one transaction. */
export async function recentActivity(
  tx: HubTx,
  hubId: string,
  userId: string,
  opts: { take: number; skip?: number },
) {
  const list = await listActivity(tx, hubId, userId, opts);
  return { ...list, links: await activityLinks(tx, hubId, userId, list.rows) };
}

/** English source strings; French lives in lib/i18n-fr-social.ts. */
const VERB_TEXT: Record<ActivityVerb, string> = {
  TASK_ADDED: "{actor} added “{title}”",
  TASK_DONE: "{actor} finished “{title}”",
  TASK_ASSIGNED: "{actor} gave “{title}” to {target}",
  EVENT_ADDED: "{actor} planned “{title}”",
  DEADLINE_ADDED: "{actor} added the deadline “{title}”",
  DEADLINE_DONE: "{actor} wrapped up the deadline “{title}”",
  EXPENSE_ADDED: "{actor} logged {amount} · {title}",
  SETTLED_UP: "{actor} settled up {amount}",
  TRIP_ADDED: "{actor} started the trip “{title}”",
  TRIP_ITEM_DONE: "{actor} checked off “{title}”",
  MEMBER_JOINED: "{actor} joined the hub",
};

/** "Chantelle a terminé « Payer Hydro »" — names are display names, never addresses. */
export function activityText(
  r: Pick<ActivityRow, "verb" | "summary" | "amountCents" | "actorId" | "targetId">,
  nameOf: (userId: string) => string,
  t: T,
  formatMoney: (cents: number) => string,
): string {
  return t(VERB_TEXT[r.verb], {
    actor: nameOf(r.actorId),
    title: r.summary,
    target: r.targetId ? nameOf(r.targetId) : t("someone"),
    amount: r.amountCents != null ? formatMoney(r.amountCents) : "",
  }).trim();
}

/**
 * "il y a 2 h" / "2 h ago" — compact on purpose, it sits at the end of a
 * 375px row. Past a week it is no longer "recent" and the caller shows a date.
 */
export function relativeTime(then: Date, now: Date, lang: Lang): string {
  const s = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 1000));
  const fr = lang === "fr";
  if (s < 60) return fr ? "à l'instant" : "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return fr ? `il y a ${m} min` : `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return fr ? `il y a ${h} h` : `${h} h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return fr ? "hier" : "yesterday";
  return fr ? `il y a ${d} j` : `${d} d ago`;
}

export const ACTIVITY_PAGE_SIZE = 30;
export const THANKS_PER_DAY = 20;
