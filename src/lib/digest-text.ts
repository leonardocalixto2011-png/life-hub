import { isToday, isTomorrow, startOfDay } from "date-fns";

import { DEFAULT_LOCALE } from "@/lib/locales";
import { dueLabel, money } from "@/lib/format";
import { fmt, fmtDay, fmtTime, translate, type Lang, type Vars } from "@/lib/i18n";

/**
 * Pure builders for the daily and weekly digests: subject, plain text, HTML
 * and push, in the recipient's language. No database imports on purpose, so
 * they can be exercised with fabricated data (`npx tsx`), and so the cron
 * route is the only place that decides who gets what.
 *
 * Structural types rather than the collector's inferred ones: anything with
 * these fields renders, which is also what keeps the debt shape narrow — the
 * builders cannot print a balance they were never typed to receive.
 */

type Tagged = { hubName: string; venture?: { name: string } | null };

export type DigestView = {
  now: Date;
  windowHours: number;
  multiHub: boolean;
  count: number;
  overdueTasks: (Tagged & { title: string; dueDate: Date | null; amountCents: number | null })[];
  dueTasks: (Tagged & { title: string; dueDate: Date | null; amountCents: number | null })[];
  deadlines: (Tagged & { title: string; dueDate: Date })[];
  events: (Tagged & { title: string; startAt: Date })[];
  renewals: (Tagged & { name: string; renewalDate: Date; costCents: number; currency: string })[];
  cancelBys: (Tagged & { name: string; cancelByDate: Date | null })[];
  debts: {
    name: string;
    dueDate: Date | null;
    actualPaymentCents: number | null;
    minimumPaymentCents: number | null;
  }[];
};

export type WeeklyView = {
  now: Date;
  dueTasks: number;
  overdueTasks: number;
  deadlines: number;
  renewals: { name: string; costCents: number; currency: string }[];
  renewalTotal: number;
  debts: unknown[];
  debtTotal: number;
  currency: string;
  budget: { income: number; expense: number; net: number };
};

/** Who is reading: the language of the words, the locale of the numbers. */
export type Reader = { lang: Lang; locale?: string | null };

const PUSH_MAX = 120;

function tr(r: Reader, key: string, vars?: Vars) {
  return translate(r.lang, key, vars);
}

/** Picks the singular or plural key; both carry `{n}`. */
function plural(r: Reader, n: number, one: string, many: string, vars?: Vars) {
  return tr(r, n === 1 ? one : many, { n, ...vars });
}

function cash(r: Reader, cents: number, currency = "CAD") {
  return money(cents, currency, r.locale ?? DEFAULT_LOCALE);
}

/** "84 $" rather than "84,00 $" — a lock screen has no room for zero cents. */
function cashShort(r: Reader, cents: number, currency = "CAD") {
  const s = cash(r, cents, currency);
  return cents % 100 === 0 ? s.replace(/[.,]00(?!\d)/, "") : s;
}

/** "18 h" / "6 PM" on the hour, "18 h 30" / "6:30 PM" otherwise — push text only. */
function timeShort(date: Date, lang: Lang) {
  if (date.getMinutes() !== 0) return fmtTime(date, lang);
  return fmt(date, lang === "fr" ? "H 'h'" : "h a", lang);
}

function debtCents(d: { actualPaymentCents: number | null; minimumPaymentCents: number | null }) {
  const cents = d.actualPaymentCents ?? d.minimumPaymentCents;
  return cents != null && cents > 0 ? cents : undefined;
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

// ---------------------------------------------------------------------------
// Daily
// ---------------------------------------------------------------------------

export function digestSubject(d: DigestView, r: Reader): string {
  if (d.count === 0) return tr(r, "Life Hub — nothing due");
  return plural(r, d.count, "Life Hub — {n} thing to look at", "Life Hub — {n} things to look at");
}

/** One row of the email, whichever section it sits in. */
type Row = { label: string; hubName: string; when: string; extra?: string };

function sections(d: DigestView, r: Reader): { heading: string; rows: Row[] }[] {
  const due = (x: Date | null) => (x ? dueLabel(x, r.lang) : "");
  const taskRow = (t: DigestView["dueTasks"][number]): Row => ({
    label: t.title,
    hubName: t.hubName,
    when: due(t.dueDate),
    extra: [t.amountCents ? cash(r, t.amountCents) : null, t.venture?.name].filter(Boolean).join(" · ") || undefined,
  });
  return [
    { heading: tr(r, "Overdue"), rows: d.overdueTasks.map(taskRow) },
    { heading: tr(r, "Tasks"), rows: d.dueTasks.map(taskRow) },
    {
      heading: tr(r, "Events"),
      rows: d.events.map((e) => ({
        label: e.title,
        hubName: e.hubName,
        when: `${dueLabel(e.startAt, r.lang)}, ${fmtTime(e.startAt, r.lang)}`,
        extra: e.venture?.name,
      })),
    },
    {
      heading: tr(r, "Deadlines"),
      rows: d.deadlines.map((x) => ({ label: x.title, hubName: x.hubName, when: due(x.dueDate), extra: x.venture?.name })),
    },
    {
      heading: tr(r, "Subscriptions renewing"),
      rows: d.renewals.map((s) => ({
        label: s.name,
        hubName: s.hubName,
        when: due(s.renewalDate),
        extra: cash(r, s.costCents, s.currency),
      })),
    },
    {
      heading: tr(r, "Cancel before"),
      rows: d.cancelBys.map((s) => ({
        label: s.name,
        hubName: s.hubName,
        when: due(s.cancelByDate),
        extra: tr(r, "cancel deadline"),
      })),
    },
    {
      // Name, when, how much — never a balance, APR or status (see CLAUDE.md).
      heading: tr(r, "Payments due"),
      rows: d.debts.map((x) => {
        const c = debtCents(x);
        return { label: x.name, hubName: "", when: due(x.dueDate), extra: c ? cash(r, c) : undefined };
      }),
    },
  ].filter((s) => s.rows.length > 0);
}

export function digestText(d: DigestView, r: Reader): string {
  if (d.count === 0) return tr(r, "Nothing due in the next couple of days. Nice.");
  const hubTag = (h: string) => (d.multiHub && h ? ` [${h}]` : "");
  return sections(d, r)
    .map((s) =>
      [
        s.heading.toLocaleUpperCase(r.lang),
        ...s.rows.map(
          (row) =>
            `• ${row.label}${hubTag(row.hubName)}${row.when ? ` — ${row.when}` : ""}${row.extra ? ` (${row.extra})` : ""}`,
        ),
      ].join("\n"),
    )
    .join("\n\n");
}

export function digestHtml(d: DigestView, appUrl: string, r: Reader): string {
  const hubTag = (h: string) => (d.multiHub && h ? ` <span style="color:#aaa">[${esc(h)}]</span>` : "");
  const li = (row: Row) =>
    `<li>${esc(row.label)}${hubTag(row.hubName)}${row.when ? ` — <strong>${esc(row.when)}</strong>` : ""}${
      row.extra ? ` <span style="color:#888">(${esc(row.extra)})</span>` : ""
    }</li>`;

  const bodyInner =
    d.count === 0
      ? `<p style="font-size:14px;color:#444">${esc(tr(r, "Nothing due in the next couple of days."))}</p>`
      : sections(d, r)
          .map(
            (s) =>
              `<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#666;margin:18px 0 6px">${esc(s.heading)}</h2>
         <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.6">${s.rows.map(li).join("")}</ul>`,
          )
          .join("");

  return `
    <div lang="${r.lang}" style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <h1 style="font-size:18px;margin:0 0 4px">${esc(tr(r, "Life Hub — daily digest"))}</h1>
      <p style="font-size:12px;color:#999;margin:0 0 8px">${esc(tr(r, "Next {n}h", { n: d.windowHours }))} · ${esc(fmtDay(d.now, r.lang))}</p>
      ${bodyInner}
      <p style="margin:24px 0 0"><a href="${esc(appUrl)}/today" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600">${esc(tr(r, "Open Life Hub"))}</a></p>
    </div>
  `;
}

/**
 * The lock-screen line: names what matters instead of counting it.
 * "Aujourd'hui : Payer Hydro (84 $) · Souper chez maman 18 h · +2 autres"
 *
 * Overdue first, then today, then tomorrow; each group's label appears once.
 * Whatever doesn't fit in ~120 characters — and anything later than tomorrow
 * — folds into "+N more", so the count in the tail is always honest.
 */
export function digestPush(d: DigestView, r: Reader): { title: string; body: string } {
  const title = tr(r, "Your day");
  type Item = { group: "overdue" | "today" | "tomorrow"; text: string };
  const items: Item[] = [];
  const bucket = (date: Date | null): Item["group"] | null => {
    if (!date) return null;
    if (date < startOfDay(d.now)) return "overdue";
    if (isToday(date)) return "today";
    if (isTomorrow(date)) return "tomorrow";
    return null;
  };
  const withCash = (label: string, cents?: number | null, currency?: string) =>
    cents ? `${label} (${cashShort(r, cents, currency)})` : label;

  for (const t of [...d.overdueTasks, ...d.dueTasks]) {
    const g = bucket(t.dueDate);
    if (g) items.push({ group: g, text: withCash(t.title, t.amountCents) });
  }
  for (const x of d.deadlines) {
    const g = bucket(x.dueDate);
    if (g) items.push({ group: g, text: x.title });
  }
  for (const e of d.events) {
    // An event already underway still counts as today, never "overdue".
    const g = e.startAt < startOfDay(d.now) ? "today" : bucket(e.startAt);
    if (g) items.push({ group: g, text: `${e.title} ${timeShort(e.startAt, r.lang)}` });
  }
  for (const x of d.debts) {
    const g = bucket(x.dueDate);
    if (g) items.push({ group: g, text: withCash(x.name, debtCents(x)) });
  }
  for (const s of d.cancelBys) {
    const g = bucket(s.cancelByDate);
    if (g) items.push({ group: g, text: tr(r, "Cancel {name}", { name: s.name }) });
  }
  for (const s of d.renewals) {
    const g = bucket(s.renewalDate);
    if (g) items.push({ group: g, text: withCash(s.name, s.costCents, s.currency) });
  }

  if (items.length === 0) {
    return {
      title,
      body: plural(r, d.count, "{n} thing coming up in the next 2 days.", "{n} things coming up in the next 2 days."),
    };
  }

  const order = { overdue: 0, today: 1, tomorrow: 2 } as const;
  items.sort((a, b) => order[a.group] - order[b.group]); // stable: keeps order within a group
  const label = { overdue: tr(r, "Overdue"), today: tr(r, "Today"), tomorrow: tr(r, "Tomorrow") };
  // French typography puts a space before the colon.
  const colon = r.lang === "fr" ? " : " : ": ";
  const more = (n: number) => plural(r, n, "+1 more", "+{n} more");

  const parts: string[] = [];
  let group: Item["group"] | null = null;
  let shown = 0;
  for (const it of items) {
    // One very long title must not push everything else off the screen.
    const text = shown === 0 && it.text.length > PUSH_MAX - 30 ? `${it.text.slice(0, PUSH_MAX - 31)}…` : it.text;
    const piece = it.group !== group ? `${label[it.group]}${colon}${text}` : text;
    const candidate = [...parts, piece].join(" · ");
    const left = d.count - (shown + 1);
    const tail = left > 0 ? ` · ${more(left)}` : "";
    if (shown > 0 && candidate.length + tail.length > PUSH_MAX) break;
    parts.push(piece);
    group = it.group;
    shown++;
  }
  const rest = d.count - shown;
  return { title, body: parts.join(" · ") + (rest > 0 ? ` · ${more(rest)}` : "") };
}

// ---------------------------------------------------------------------------
// Weekly
// ---------------------------------------------------------------------------

export function weeklySubject(r: Reader) {
  return tr(r, "Life Hub — the week ahead");
}

export function weeklyText(w: WeeklyView, r: Reader): string {
  const bits: string[] = [];
  if (w.overdueTasks > 0) bits.push(plural(r, w.overdueTasks, "{n} overdue task", "{n} overdue tasks"));
  bits.push(plural(r, w.dueTasks, "{n} task due", "{n} tasks due"));
  if (w.deadlines > 0) bits.push(plural(r, w.deadlines, "{n} deadline", "{n} deadlines"));
  if (w.renewals.length > 0) {
    bits.push(
      plural(r, w.renewals.length, "{n} subscription renewing ({amount})", "{n} subscriptions renewing ({amount})", {
        amount: cash(r, w.renewalTotal, w.currency),
      }),
    );
  }
  if (w.debts.length > 0) {
    bits.push(
      plural(r, w.debts.length, "{n} debt payment due ({amount})", "{n} debt payments due ({amount})", {
        amount: cash(r, w.debtTotal),
      }),
    );
  }

  const net = w.budget.net;
  const budgetNote =
    net >= 0
      ? tr(r, "Budget this month is positive ({amount} net).", { amount: cash(r, net) })
      : tr(r, "Budget this month is down {amount}.", { amount: cash(r, -net) });

  return tr(r, "This week: {list}. {budget}", { list: bits.join(", "), budget: budgetNote });
}

export function weeklyHtml(w: WeeklyView, appUrl: string, r: Reader): string {
  return `
    <div lang="${r.lang}" style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px">
      <h1 style="font-size:18px;margin:0 0 4px">${esc(weeklySubject(r))}</h1>
      <p style="font-size:12px;color:#999;margin:0 0 12px">${esc(fmtDay(w.now, r.lang))}</p>
      <p style="font-size:15px;line-height:1.6;color:#222">${esc(weeklyText(w, r))}</p>
      ${
        w.renewals.length
          ? `<ul style="font-size:14px;color:#444;line-height:1.6">${w.renewals
              .map((s) => `<li>${esc(s.name)} — ${esc(cash(r, s.costCents, s.currency))}</li>`)
              .join("")}</ul>`
          : ""
      }
      <p style="margin:20px 0 0"><a href="${esc(appUrl)}/agenda" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;font-weight:600">${esc(tr(r, "Open the agenda"))}</a></p>
    </div>
  `;
}
