import { endOfDay, startOfDay } from "date-fns";

import type { HubTx } from "@/lib/hub-context";
import { withHub } from "@/lib/hub-context";
import { listMyHubs, type SessionHub } from "@/lib/session";
import { dueLabel, money } from "@/lib/format";

type WithHub<T> = T & { hubName: string };

function tagHub<T>(rows: T[], hub: SessionHub): WithHub<T>[] {
  return rows.map((r) => ({ ...r, hubName: hub.name }));
}

async function collectDigestInHub(tx: HubTx, hubId: string, windowHours: number) {
  const now = new Date();
  const horizon = endOfDay(new Date(now.getTime() + windowHours * 3600_000));
  const todayStart = startOfDay(now);

  const [overdueTasks, dueTasks, deadlines, renewals, cancelBys] = await Promise.all([
    tx.task.findMany({
      where: { hubId, status: "OPEN", dueDate: { lt: todayStart } },
      include: { venture: true, assignedTo: true },
      orderBy: { dueDate: "asc" },
    }),
    tx.task.findMany({
      where: { hubId, status: "OPEN", dueDate: { gte: todayStart, lte: horizon } },
      include: { venture: true, assignedTo: true },
      orderBy: { dueDate: "asc" },
    }),
    tx.deadline.findMany({
      where: { hubId, doneAt: null, dueDate: { lte: horizon } },
      include: { venture: true },
      orderBy: { dueDate: "asc" },
    }),
    tx.subscription.findMany({
      where: { hubId, status: "ACTIVE", renewalDate: { lte: horizon } },
      include: { venture: true },
      orderBy: { renewalDate: "asc" },
    }),
    tx.subscription.findMany({
      where: { hubId, status: "ACTIVE", cancelByDate: { not: null, lte: horizon } },
      include: { venture: true },
      orderBy: { cancelByDate: "asc" },
    }),
  ]);

  return { overdueTasks, dueTasks, deadlines, renewals, cancelBys };
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

  const perHub = await withHub(userId, (tx) =>
    Promise.all(hubs.map((hub) => collectDigestInHub(tx, hub.id, windowHours).then((d) => ({ hub, d })))),
  );

  const overdueTasks = perHub.flatMap(({ hub, d }) => tagHub(d.overdueTasks, hub));
  const dueTasks = perHub.flatMap(({ hub, d }) => tagHub(d.dueTasks, hub));
  const deadlines = perHub.flatMap(({ hub, d }) => tagHub(d.deadlines, hub));
  const renewals = perHub.flatMap(({ hub, d }) => tagHub(d.renewals, hub));
  const cancelBys = perHub.flatMap(({ hub, d }) => tagHub(d.cancelBys, hub));

  const count =
    overdueTasks.length + dueTasks.length + deadlines.length + renewals.length + cancelBys.length;

  return { now, windowHours, multiHub: hubs.length > 1, count, overdueTasks, dueTasks, deadlines, renewals, cancelBys };
}

export type DigestData = Awaited<ReturnType<typeof collectDigestForUser>>;

export function digestSubject(d: DigestData): string {
  if (d.count === 0) return "Life Hub — nothing due";
  return `Life Hub — ${d.count} thing${d.count === 1 ? "" : "s"} to look at`;
}

// ---------------------------------------------------------------------------
// Weekly rollup — one short paragraph, sent Monday mornings.
// ---------------------------------------------------------------------------

async function collectWeeklyInHub(tx: HubTx, hubId: string) {
  const now = new Date();
  const start = startOfDay(now);
  const end = endOfDay(new Date(now.getTime() + 7 * 864e5));

  const [dueTasks, overdueTasks, deadlines, renewals, budget] = await Promise.all([
    tx.task.count({ where: { hubId, status: "OPEN", dueDate: { gte: start, lte: end } } }),
    tx.task.count({ where: { hubId, status: "OPEN", dueDate: { lt: start } } }),
    tx.deadline.count({ where: { hubId, doneAt: null, dueDate: { gte: start, lte: end } } }),
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

  const perHub = await withHub(userId, (tx) =>
    Promise.all(hubs.map((hub) => collectWeeklyInHub(tx, hub.id).then((w) => ({ hub, w })))),
  );

  const dueTasks = perHub.reduce((n, { w }) => n + w.dueTasks, 0);
  const overdueTasks = perHub.reduce((n, { w }) => n + w.overdueTasks, 0);
  const deadlines = perHub.reduce((n, { w }) => n + w.deadlines, 0);
  const renewals = perHub.flatMap(({ hub, w }) => tagHub(w.renewals, hub));
  const renewalTotal = renewals.reduce((n, r) => n + r.costCents, 0);
  const currency = renewals[0]?.currency ?? "CAD";
  const budget = perHub.reduce(
    (b, { w }) => ({
      income: b.income + w.budget.income,
      expense: b.expense + w.budget.expense,
      net: b.net + w.budget.net,
    }),
    { income: 0, expense: 0, net: 0 },
  );

  return { now, dueTasks, overdueTasks, deadlines, renewals, renewalTotal, currency, budget };
}

export type WeeklyData = Awaited<ReturnType<typeof collectWeeklyForUser>>;

export function weeklySubject() {
  return "Life Hub — the week ahead";
}

export function weeklyText(w: WeeklyData): string {
  const bits: string[] = [];
  if (w.overdueTasks > 0) bits.push(`${w.overdueTasks} overdue task${w.overdueTasks === 1 ? "" : "s"}`);
  bits.push(`${w.dueTasks} task${w.dueTasks === 1 ? "" : "s"} due`);
  if (w.deadlines > 0) bits.push(`${w.deadlines} deadline${w.deadlines === 1 ? "" : "s"}`);
  if (w.renewals.length > 0) {
    bits.push(
      `${w.renewals.length} subscription${w.renewals.length === 1 ? "" : "s"} renewing (${money(w.renewalTotal, w.currency)})`,
    );
  }

  const net = w.budget.net;
  const budgetNote =
    net >= 0
      ? `Budget this month is positive (${money(net)} net).`
      : `Budget this month is down ${money(-net)}.`;

  return `This week: ${bits.join(", ")}. ${budgetNote}`;
}

export function weeklyHtml(w: WeeklyData, appUrl: string): string {
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <h1 style="font-size:18px;margin:0 0 4px">Life Hub — the week ahead</h1>
      <p style="font-size:12px;color:#999;margin:0 0 12px">${esc(w.now.toDateString())}</p>
      <p style="font-size:15px;line-height:1.6;color:#222">${esc(weeklyText(w))}</p>
      ${
        w.renewals.length
          ? `<ul style="font-size:14px;color:#444;line-height:1.6">${w.renewals
              .map((r) => `<li>${esc(r.name)} — ${esc(money(r.costCents, r.currency))}</li>`)
              .join("")}</ul>`
          : ""
      }
      <p style="margin:20px 0 0"><a href="${esc(appUrl)}/agenda" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600">Open the agenda</a></p>
    </div>
  `;
}

function line(label: string, when: Date | null, extra?: string): string {
  return `• ${label}${when ? ` — ${dueLabel(when)}` : ""}${extra ? ` (${extra})` : ""}`;
}

export function digestText(d: DigestData): string {
  if (d.count === 0) {
    return "Nothing due in the next couple of days. Nice.";
  }
  const parts: string[] = [];
  const hubTag = (hubName: string) => (d.multiHub ? ` [${hubName}]` : "");

  if (d.overdueTasks.length) {
    parts.push(
      "OVERDUE",
      ...d.overdueTasks.map((t) => line(t.title + hubTag(t.hubName), t.dueDate, t.venture?.name ?? undefined)),
      "",
    );
  }
  if (d.dueTasks.length) {
    parts.push(
      "TASKS",
      ...d.dueTasks.map((t) => line(t.title + hubTag(t.hubName), t.dueDate, t.venture?.name ?? undefined)),
      "",
    );
  }
  if (d.deadlines.length) {
    parts.push(
      "DEADLINES",
      ...d.deadlines.map((x) => line(x.title + hubTag(x.hubName), x.dueDate, x.venture?.name ?? undefined)),
      "",
    );
  }
  if (d.renewals.length) {
    parts.push(
      "SUBSCRIPTIONS RENEWING",
      ...d.renewals.map((s) =>
        line(s.name + hubTag(s.hubName), s.renewalDate, money(s.costCents, s.currency)),
      ),
      "",
    );
  }
  if (d.cancelBys.length) {
    parts.push(
      "CANCEL BY",
      ...d.cancelBys.map((s) => line(s.name + hubTag(s.hubName), s.cancelByDate, "cancel deadline")),
      "",
    );
  }

  return parts.join("\n").trim();
}

export function digestHtml(d: DigestData, appUrl: string): string {
  const esc = (s: string) =>
    s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const hubTag = (hubName: string) => (d.multiHub ? ` <span style="color:#aaa">[${esc(hubName)}]</span>` : "");

  const section = (heading: string, rows: string[]) =>
    rows.length
      ? `<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#666;margin:18px 0 6px">${heading}</h2>
         <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.6">${rows.join("")}</ul>`
      : "";

  const li = (label: string, hubName: string, when: Date | null, extra?: string) =>
    `<li>${esc(label)}${hubTag(hubName)}${when ? ` — <strong>${esc(dueLabel(when))}</strong>` : ""}${
      extra ? ` <span style="color:#888">(${esc(extra)})</span>` : ""
    }</li>`;

  const bodyInner =
    d.count === 0
      ? `<p style="font-size:14px;color:#444">Nothing due in the next couple of days.</p>`
      : [
          section("Overdue", d.overdueTasks.map((t) => li(t.title, t.hubName, t.dueDate, t.venture?.name ?? undefined))),
          section("Tasks", d.dueTasks.map((t) => li(t.title, t.hubName, t.dueDate, t.venture?.name ?? undefined))),
          section("Deadlines", d.deadlines.map((x) => li(x.title, x.hubName, x.dueDate, x.venture?.name ?? undefined))),
          section(
            "Subscriptions renewing",
            d.renewals.map((s) => li(s.name, s.hubName, s.renewalDate, money(s.costCents, s.currency))),
          ),
          section("Cancel by", d.cancelBys.map((s) => li(s.name, s.hubName, s.cancelByDate, "cancel deadline"))),
        ].join("");

  return `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <h1 style="font-size:18px;margin:0 0 4px">Life Hub — daily digest</h1>
      <p style="font-size:12px;color:#999;margin:0 0 8px">Next ${d.windowHours}h · ${esc(d.now.toDateString())}</p>
      ${bodyInner}
      <p style="margin:24px 0 0"><a href="${esc(appUrl)}/today" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600">Open Life Hub</a></p>
    </div>
  `;
}
