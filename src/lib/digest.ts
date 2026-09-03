import { endOfDay, startOfDay } from "date-fns";

import { prisma } from "@/lib/prisma";
import { dueLabel, money } from "@/lib/format";

export type DigestData = Awaited<ReturnType<typeof collectDigest>>;

/**
 * Everything the crew should look at in the next `windowHours` hours, plus
 * anything already overdue. Shared-first: one list for everyone.
 */
export async function collectDigest(windowHours = 48) {
  const now = new Date();
  const horizon = endOfDay(new Date(now.getTime() + windowHours * 3600_000));
  const todayStart = startOfDay(now);

  const [overdueTasks, dueTasks, deadlines, renewals, cancelBys] = await Promise.all([
    prisma.task.findMany({
      where: { status: "OPEN", dueDate: { lt: todayStart } },
      include: { venture: true, assignedTo: true },
      orderBy: { dueDate: "asc" },
    }),
    prisma.task.findMany({
      where: { status: "OPEN", dueDate: { gte: todayStart, lte: horizon } },
      include: { venture: true, assignedTo: true },
      orderBy: { dueDate: "asc" },
    }),
    prisma.deadline.findMany({
      where: { doneAt: null, dueDate: { lte: horizon } },
      include: { venture: true },
      orderBy: { dueDate: "asc" },
    }),
    prisma.subscription.findMany({
      where: { status: "ACTIVE", renewalDate: { lte: horizon } },
      include: { venture: true },
      orderBy: { renewalDate: "asc" },
    }),
    prisma.subscription.findMany({
      where: { status: "ACTIVE", cancelByDate: { not: null, lte: horizon } },
      include: { venture: true },
      orderBy: { cancelByDate: "asc" },
    }),
  ]);

  const count =
    overdueTasks.length +
    dueTasks.length +
    deadlines.length +
    renewals.length +
    cancelBys.length;

  return { now, windowHours, count, overdueTasks, dueTasks, deadlines, renewals, cancelBys };
}

export function digestSubject(d: DigestData): string {
  if (d.count === 0) return "Life Hub — nothing due";
  return `Life Hub — ${d.count} thing${d.count === 1 ? "" : "s"} to look at`;
}

// ---------------------------------------------------------------------------
// Weekly rollup — one short paragraph, sent Monday mornings.
// ---------------------------------------------------------------------------

export async function collectWeekly() {
  const now = new Date();
  const start = startOfDay(now);
  const end = endOfDay(new Date(now.getTime() + 7 * 864e5));

  const [dueTasks, overdueTasks, deadlines, renewals, budget] = await Promise.all([
    prisma.task.count({ where: { status: "OPEN", dueDate: { gte: start, lte: end } } }),
    prisma.task.count({ where: { status: "OPEN", dueDate: { lt: start } } }),
    prisma.deadline.count({ where: { doneAt: null, dueDate: { gte: start, lte: end } } }),
    prisma.subscription.findMany({
      where: { status: "ACTIVE", renewalDate: { gte: start, lte: end } },
      select: { name: true, costCents: true, currency: true },
    }),
    (async () => {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const entries = await prisma.budgetEntry.findMany({
        where: { date: { gte: from, lte: now } },
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

  const renewalTotal = renewals.reduce((n, r) => n + r.costCents, 0);
  const currency = renewals[0]?.currency ?? "CAD";

  return { now, dueTasks, overdueTasks, deadlines, renewals, renewalTotal, currency, budget };
}

export type WeeklyData = Awaited<ReturnType<typeof collectWeekly>>;

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

  if (d.overdueTasks.length) {
    parts.push(
      "OVERDUE",
      ...d.overdueTasks.map((t) => line(t.title, t.dueDate, t.venture?.name ?? undefined)),
      "",
    );
  }
  if (d.dueTasks.length) {
    parts.push(
      "TASKS",
      ...d.dueTasks.map((t) => line(t.title, t.dueDate, t.venture?.name ?? undefined)),
      "",
    );
  }
  if (d.deadlines.length) {
    parts.push(
      "DEADLINES",
      ...d.deadlines.map((x) => line(x.title, x.dueDate, x.venture?.name ?? undefined)),
      "",
    );
  }
  if (d.renewals.length) {
    parts.push(
      "SUBSCRIPTIONS RENEWING",
      ...d.renewals.map((s) =>
        line(s.name, s.renewalDate, money(s.costCents, s.currency)),
      ),
      "",
    );
  }
  if (d.cancelBys.length) {
    parts.push(
      "CANCEL BY",
      ...d.cancelBys.map((s) => line(s.name, s.cancelByDate, "cancel deadline")),
      "",
    );
  }

  return parts.join("\n").trim();
}

export function digestHtml(d: DigestData, appUrl: string): string {
  const esc = (s: string) =>
    s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

  const section = (heading: string, rows: string[]) =>
    rows.length
      ? `<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#666;margin:18px 0 6px">${heading}</h2>
         <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.6">${rows.join("")}</ul>`
      : "";

  const li = (label: string, when: Date | null, extra?: string) =>
    `<li>${esc(label)}${when ? ` — <strong>${esc(dueLabel(when))}</strong>` : ""}${
      extra ? ` <span style="color:#888">(${esc(extra)})</span>` : ""
    }</li>`;

  const bodyInner =
    d.count === 0
      ? `<p style="font-size:14px;color:#444">Nothing due in the next couple of days.</p>`
      : [
          section("Overdue", d.overdueTasks.map((t) => li(t.title, t.dueDate, t.venture?.name ?? undefined))),
          section("Tasks", d.dueTasks.map((t) => li(t.title, t.dueDate, t.venture?.name ?? undefined))),
          section("Deadlines", d.deadlines.map((x) => li(x.title, x.dueDate, x.venture?.name ?? undefined))),
          section(
            "Subscriptions renewing",
            d.renewals.map((s) => li(s.name, s.renewalDate, money(s.costCents, s.currency))),
          ),
          section("Cancel by", d.cancelBys.map((s) => li(s.name, s.cancelByDate, "cancel deadline"))),
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
