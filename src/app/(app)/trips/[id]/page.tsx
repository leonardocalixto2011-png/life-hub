import Link from "next/link";
import { notFound } from "next/navigation";
import { differenceInCalendarDays, eachDayOfInterval, format, startOfDay, startOfMonth } from "date-fns";

import { hubChrome } from "@/lib/data";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { getLang, getT } from "@/lib/i18n-server";
import { fmt } from "@/lib/i18n";
import type { T } from "@/lib/i18n";
import { countdownLabel, initials, money, toDateInput } from "@/lib/format";
import { centsToInput } from "@/lib/money";
import { TRIP_TEMPLATES } from "@/lib/trip-plan";
import { Figure } from "@/components/Figure";
import { TripForm } from "../TripForm";
import {
  addTripItem,
  addTripSavings,
  deleteTrip,
  deleteTripItem,
  importTripPlan,
  toggleTripItem,
} from "../actions";

export const dynamic = "force-dynamic";

/** Stop colours, in itinerary order. Travel days (no stop) are neutral. */
const STOP_COLORS = ["#D9821A", "#0E7C7B", "#C0392B", "#6D4FB3", "#2F7D4F", "#2563EB"];

const CHECKLISTS = [
  { kind: "BOOK", title: "To book", hint: "Flights, hotel, car, tickets" },
  { kind: "TODO", title: "To do", hint: "Passport, time off, pet sitter" },
  { kind: "PACK", title: "Packing list", hint: "What goes in the suitcase" },
] as const;

const TAG: Record<string, { label: string; color: string }> = {
  BOOK: { label: "Book", color: "#D9821A" },
  TODO: { label: "To do", color: "#0E7C7B" },
  SAVE: { label: "Save", color: "var(--color-ok)" },
};

type Item = {
  id: string;
  kind: string;
  title: string;
  costCents: number | null;
  date: Date | null;
  endDate: Date | null;
  done: boolean;
  assignedToId: string | null;
};

const dayKey = (d: Date) => format(d, "yyyy-MM-dd");
const sectionTitle = "mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]";

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, hub } = await requireHub();
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const [trip, { members }] = await Promise.all([
    withHub(user.id, (tx) =>
      tx.trip.findFirst({
        where: {
          id,
          hubId: hub.id,
          OR: [{ visibility: "SHARED" }, { createdById: user.id }],
        },
        include: { items: { orderBy: [{ date: "asc" }, { createdAt: "asc" }] } },
      }),
    ),
    hubChrome(user.id, hub.id),
  ]);
  if (!trip) notFound();

  const currency = hub.currency;
  const locale = user.locale ?? "en-CA";
  const cash = (c: number) => money(c, currency, locale);
  const today = startOfDay(new Date());
  const nights = differenceInCalendarDays(trip.endDate, trip.startDate);
  const status =
    trip.startDate <= today && trip.endDate >= today
      ? t("Happening now")
      : trip.endDate < today
        ? t("Done")
        : countdownLabel(trip.startDate, lang);
  const dayFmt = lang === "fr" ? "EEE d MMM" : "EEE MMM d";

  const items: Item[] = trip.items;
  const stops = items.filter((i) => i.kind === "STOP" && i.date && i.endDate);
  const activities = items.filter((i) => i.kind === "ACTIVITY" && i.date);
  const deposits = items.filter((i) => i.kind === "SAVE");
  const dated = items.filter((i) => (i.kind === "BOOK" || i.kind === "TODO" || i.kind === "SAVE") && i.date);

  // Money: SAVE rows are money set aside, never spending, so they stay out of "planned".
  const planned = items
    .filter((i) => i.kind !== "SAVE" && i.kind !== "STOP")
    .reduce((n, i) => n + (i.costCents ?? 0), 0);
  const saved = trip.savedCents + deposits.filter((d) => d.done).reduce((n, d) => n + (d.costCents ?? 0), 0);
  const savedPct =
    trip.budgetCents && trip.budgetCents > 0 ? Math.min(100, Math.round((saved / trip.budgetCents) * 100)) : null;
  const next = dated.find((i) => !i.done);

  // Day strip + day by day.
  const colorOf = new Map(stops.map((s, n) => [s.id, STOP_COLORS[n % STOP_COLORS.length]]));
  const days = eachDayOfInterval({ start: startOfDay(trip.startDate), end: startOfDay(trip.endDate) });
  const stopOn = (d: Date) =>
    stops.find((s) => startOfDay(s.date!) <= d && d < startOfDay(s.endDate!)) ?? null;
  const activitiesOn = new Map<string, Item[]>();
  for (const a of activities) {
    const k = dayKey(a.date!);
    activitiesOn.set(k, [...(activitiesOn.get(k) ?? []), a]);
  }

  // Booking calendar, grouped by month.
  const months = new Map<string, Item[]>();
  for (const i of dated) {
    const k = format(i.date!, "yyyy-MM");
    months.set(k, [...(months.get(k) ?? []), i]);
  }

  const memberName = new Map(members.map((m) => [m.id, m]));
  const add = addTripItem.bind(null, trip.id);
  const save = addTripSavings.bind(null, trip.id);
  const importPlan = importTripPlan.bind(null, trip.id);

  const Row = ({ i, showDate }: { i: Item; showDate?: boolean }) => {
    const who = i.assignedToId ? memberName.get(i.assignedToId) : null;
    const tag = TAG[i.kind];
    return (
      <div className="flex items-start gap-2.5 px-3 py-2">
        <form action={toggleTripItem} className="pt-0.5">
          <input type="hidden" name="id" value={i.id} />
          <button
            aria-label={i.done ? t("Mark not done") : t("Mark done")}
            className="grid h-5 w-5 place-items-center rounded border border-[var(--color-border)] text-xs"
            style={i.done ? { background: "var(--color-ok)", color: "#fff", borderColor: "var(--color-ok)" } : undefined}
          >
            {i.done ? "✓" : ""}
          </button>
        </form>
        <div className="min-w-0 flex-1">
          <span
            className="text-sm"
            style={i.done ? { textDecoration: "line-through", color: "var(--color-text-dim)" } : undefined}
          >
            {i.title}
          </span>
          {(tag || (showDate && i.date)) && (
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[0.66rem] text-[var(--color-text-dim)]">
              {tag && (
                <span className="font-bold uppercase tracking-wide" style={{ color: tag.color }}>
                  {t(tag.label)}
                </span>
              )}
              {showDate && i.date && <span>{fmt(i.date, dayFmt, lang)}</span>}
            </div>
          )}
        </div>
        {who && (
          <span
            title={who.name ?? who.email ?? undefined}
            className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--color-surface-2)] text-[0.55rem] font-bold text-[var(--color-text-dim)]"
          >
            {initials(who.name, who.email)}
          </span>
        )}
        {i.costCents != null && (
          <span className="shrink-0 text-xs tabular-nums text-[var(--color-text-dim)]">{cash(i.costCents)}</span>
        )}
        <form action={deleteTripItem}>
          <input type="hidden" name="id" value={i.id} />
          <button aria-label={t("Delete")} className="text-xs text-[var(--color-text-dim)]">
            ✕
          </button>
        </form>
      </div>
    );
  };

  return (
    <div className="space-y-5 p-3">
      <Link href="/trips" className="text-xs font-semibold text-[var(--color-text-dim)]">
        ← {t("Trips")}
      </Link>

      <div>
        <h1 className="display text-2xl">{trip.title}</h1>
        <p className="text-xs text-[var(--color-text-dim)]">
          {trip.destination ? `${trip.destination} · ` : ""}
          {fmt(trip.startDate, dayFmt, lang)} – {fmt(trip.endDate, `${dayFmt} yyyy`, lang)}
          {nights > 0 ? ` · ${nights === 1 ? t("1 night") : t("{n} nights", { n: nights })}` : ""}
        </p>
        <span className="chip mt-2">{status}</span>
      </div>

      {/* ---- the four facts ---------------------------------------------- */}
      <div className="card grid grid-cols-2 divide-[var(--color-border)] p-0 [&>*]:border-[var(--color-border)]">
        <div className="border-b border-r p-3">
          <Fact label={t("Budget")}>
            {trip.budgetCents != null ? cash(trip.budgetCents) : "—"}
          </Fact>
          <p className="text-[0.66rem] text-[var(--color-text-dim)]">
            {t("planned")} {cash(planned)}
          </p>
        </div>
        <div className="border-b p-3">
          <Fact label={t("Saved")}>{cash(saved)}</Fact>
          {savedPct != null && (
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={savedPct}
              aria-label={t("Saved for this trip")}
              className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--color-surface-2)]"
            >
              <div className="h-full rounded-full bg-[var(--color-ok)]" style={{ width: `${savedPct}%` }} />
            </div>
          )}
        </div>
        <div className="border-r p-3">
          <Fact label={t("Leaving")}>{countdownLabel(trip.startDate, lang)}</Fact>
          <p className="text-[0.66rem] text-[var(--color-text-dim)]">{fmt(trip.startDate, dayFmt, lang)}</p>
        </div>
        <div className="p-3">
          <Fact label={t("Next up")}>
            <span className="text-sm leading-snug">{next ? next.title : t("All caught up")}</span>
          </Fact>
          {next?.date && (
            <p className="text-[0.66rem] text-[var(--color-text-dim)]">{fmt(next.date, dayFmt, lang)}</p>
          )}
        </div>
      </div>

      {/* ---- day strip --------------------------------------------------- */}
      {stops.length > 0 && days.length <= 60 && (
        <section>
          <h2 className={sectionTitle}>{t("At a glance")}</h2>
          <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
            {days.map((d) => {
              const s = stopOn(d);
              return (
                <div key={dayKey(d)} className="grid gap-1 text-center">
                  <span
                    className="block h-8 rounded"
                    style={{ background: s ? colorOf.get(s.id) : "var(--color-surface-2)" }}
                    title={s?.title ?? t("Travel")}
                  />
                  <span className="text-[0.55rem] leading-tight text-[var(--color-text-dim)]">{format(d, "d")}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.7rem] text-[var(--color-text-dim)]">
            {stops.map((s) => {
              const n = differenceInCalendarDays(s.endDate!, s.date!);
              return (
                <span key={s.id} className="inline-flex items-center gap-1.5">
                  <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colorOf.get(s.id) }} />
                  {s.title} · {n === 1 ? t("1 night") : t("{n} nights", { n })}
                </span>
              );
            })}
          </div>
        </section>
      )}

      {/* ---- day by day -------------------------------------------------- */}
      {(activities.length > 0 || stops.length > 0) && days.length <= 60 && (
        <section>
          <h2 className={sectionTitle}>
            {t("Day by day")}
            {activities.length > 0 ? ` · ${activities.filter((a) => a.done).length}/${activities.length}` : ""}
          </h2>
          <div className="space-y-2">
            {days.map((d) => {
              const s = stopOn(d);
              const list = activitiesOn.get(dayKey(d)) ?? [];
              return (
                <div
                  key={dayKey(d)}
                  className="card overflow-hidden border-l-4 p-0"
                  style={{ borderLeftColor: s ? colorOf.get(s.id) : "var(--color-border)" }}
                >
                  <div className="flex items-baseline justify-between gap-2 px-3 pt-2">
                    <span className="text-sm font-semibold">{fmt(d, dayFmt, lang)}</span>
                    <span
                      className="text-[0.62rem] font-bold uppercase tracking-wide"
                      style={{ color: s ? colorOf.get(s.id) : "var(--color-text-dim)" }}
                    >
                      {s?.title ?? t("Travel")}
                    </span>
                  </div>
                  {list.length === 0 ? (
                    <p className="px-3 pb-2 pt-1 text-[0.72rem] text-[var(--color-text-dim)]">{t("Nothing planned yet")}</p>
                  ) : (
                    <div className="divide-y divide-[var(--color-border)]">
                      {list.map((a) => (
                        <Row key={a.id} i={a} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ---- when to book, do and save ----------------------------------- */}
      {months.size > 0 && (
        <section>
          <h2 className={sectionTitle}>
            {t("Booking calendar")} · {dated.filter((i) => i.done).length}/{dated.length}
          </h2>
          <div className="space-y-3">
            {[...months.entries()].map(([k, list]) => (
              <div key={k}>
                <div className="mb-1 text-sm font-semibold capitalize">{fmt(list[0].date!, "MMMM yyyy", lang)}</div>
                <div className="card divide-y divide-[var(--color-border)] p-0">
                  {list.map((i) => (
                    <Row key={i.id} i={i} showDate />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- savings ----------------------------------------------------- */}
      {(deposits.length > 0 || trip.budgetCents != null) && (
        <section>
          <h2 className={sectionTitle}>{t("Savings plan")}</h2>
          <div className="card space-y-3 p-3">
            {deposits.length > 0 && <SavingsChart deposits={deposits} dated={dated} t={t} lang={lang} />}
            <form action={save} className="grid grid-cols-[1fr_auto] gap-2">
              <input
                name="amount"
                type="number"
                step="0.01"
                inputMode="decimal"
                required
                className="field"
                placeholder={t("Other amount put aside")}
                aria-label={t("Other amount put aside")}
              />
              <button type="submit" className="btn">
                {t("+ Add to savings")}
              </button>
            </form>
            <p className="text-[0.66rem] text-[var(--color-text-dim)]">
              {t("Tick a deposit in the booking calendar when it's done; it counts toward Saved.")}
            </p>
          </div>
        </section>
      )}

      {/* ---- budget ------------------------------------------------------ */}
      <div className="card grid grid-cols-3 divide-x divide-[var(--color-border)] p-0">
        <div className="p-3">
          {trip.budgetCents != null ? (
            <Figure cents={trip.budgetCents} currency={currency} locale={locale} label={t("budget")} />
          ) : (
            <div className="text-[0.68rem] text-[var(--color-text-dim)]">{t("No budget set")}</div>
          )}
        </div>
        <div className="p-3">
          <Figure cents={planned} currency={currency} locale={locale} label={t("planned")} />
        </div>
        <div className="p-3">
          {trip.budgetCents != null && (
            <Figure
              cents={trip.budgetCents - planned}
              currency={currency}
              locale={locale}
              label={t("left")}
              tone={trip.budgetCents - planned < 0 ? "danger" : "ok"}
            />
          )}
        </div>
      </div>

      {/* ---- undated checklists ------------------------------------------ */}
      {CHECKLISTS.map((sec) => {
        const list = items.filter((i) => i.kind === sec.kind && !i.date);
        if (list.length === 0 && dated.some((i) => i.kind === sec.kind)) return null;
        return (
          <section key={sec.kind}>
            <h2 className={sectionTitle}>
              {t(sec.title)}
              {list.length > 0 ? ` · ${list.filter((i) => i.done).length}/${list.length}` : ""}
            </h2>
            {list.length === 0 ? (
              <p className="card p-3 text-[0.72rem] text-[var(--color-text-dim)]">{t(sec.hint)}</p>
            ) : (
              <div className="card divide-y divide-[var(--color-border)] p-0">
                {list.map((i) => (
                  <Row key={i.id} i={i} />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {/* ---- add anything ------------------------------------------------ */}
      <form action={add} className="card space-y-2 p-3">
        <h2 className={sectionTitle}>{t("Add to the plan")}</h2>
        <div className="grid grid-cols-[7.5rem_1fr] gap-2">
          <select name="kind" defaultValue="ACTIVITY" className="field" aria-label={t("List")}>
            <option value="ACTIVITY">{t("Activity")}</option>
            <option value="BOOK">{t("To book")}</option>
            <option value="TODO">{t("To do")}</option>
            <option value="SAVE">{t("Savings deposit")}</option>
            <option value="PACK">{t("To pack")}</option>
            <option value="STOP">{t("Where we sleep")}</option>
          </select>
          <input name="title" required className="field" placeholder={t("Snorkel trip, hotel, sunscreen…")} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-0.5 text-[0.62rem] text-[var(--color-text-dim)]">
            {t("Date (day, or when it's due)")}
            <input name="date" type="date" className="field" />
          </label>
          <label className="grid gap-0.5 text-[0.62rem] text-[var(--color-text-dim)]">
            {t("Leaving (stops only)")}
            <input name="endDate" type="date" className="field" />
          </label>
        </div>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <input
            name="cost"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            className="field"
            placeholder={t("Cost")}
          />
          <select name="assignedToId" defaultValue="" className="field" aria-label={t("Who")}>
            <option value="">{t("Anyone")}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? m.email}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-primary">
            {t("Add")}
          </button>
        </div>
      </form>

      {trip.notes && <p className="card p-3 text-sm whitespace-pre-wrap">{trip.notes}</p>}

      <details className="group" open={items.length === 0}>
        <summary className="cursor-pointer list-none text-xs font-semibold text-[var(--color-primary)]">
          {t("Import a whole plan")}
        </summary>
        <div className="mt-2 space-y-2">
          <form action={importPlan} className="card space-y-2 p-3">
            <p className="text-[0.72rem] text-[var(--color-text-dim)]">
              {t("Adds stops, day-by-day activities, bookings, savings deposits and a packing list in one go.")}
            </p>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <select name="template" defaultValue="" className="field" aria-label={t("Ready-made plan")}>
                <option value="">{t("Ready-made plan…")}</option>
                {Object.entries(TRIP_TEMPLATES).map(([key, tpl]) => (
                  <option key={key} value={key}>
                    {tpl.label}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn btn-primary">
                {t("Import")}
              </button>
            </div>
          </form>
          <form action={importPlan} className="card space-y-2 p-3">
            <textarea
              name="json"
              rows={4}
              className="field font-mono text-xs"
              placeholder={t("…or paste a plan as JSON")}
              aria-label={t("Plan as JSON")}
            />
            <button type="submit" className="btn w-full">
              {t("Import pasted plan")}
            </button>
          </form>
        </div>
      </details>

      <details className="group">
        <summary className="cursor-pointer list-none text-xs font-semibold text-[var(--color-primary)]">
          {t("Edit trip details")}
        </summary>
        <div className="mt-2 space-y-2">
          <TripForm
            existing={{
              id: trip.id,
              title: trip.title,
              destination: trip.destination,
              startDate: toDateInput(trip.startDate),
              endDate: toDateInput(trip.endDate),
              budget: centsToInput(trip.budgetCents),
              notes: trip.notes,
              visibility: trip.visibility,
            }}
          />
          <form action={deleteTrip}>
            <input type="hidden" name="id" value={trip.id} />
            <button type="submit" className="btn w-full text-[var(--color-danger)]">
              {t("Delete trip")}
            </button>
          </form>
        </div>
      </details>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[0.6rem] uppercase tracking-wide text-[var(--color-text-dim)]">{label}</div>
      <div className="text-lg font-bold leading-tight tabular-nums tracking-[-0.02em]">{children}</div>
    </div>
  );
}

/**
 * Cumulative savings plan against cumulative payments, month by month. The
 * point is one glance: the green line should stay above the orange one, i.e.
 * the money is there before each bill lands.
 */
function SavingsChart({ deposits, dated, t, lang }: { deposits: Item[]; dated: Item[]; t: T; lang: "en" | "fr" }) {
  const payments = dated.filter((i) => i.kind !== "SAVE" && i.costCents);
  const all = [...deposits, ...payments].filter((i) => i.date);
  if (all.length === 0) return null;

  const first = startOfMonth(all.reduce((a, i) => (i.date! < a ? i.date! : a), all[0].date!));
  const last = startOfMonth(all.reduce((a, i) => (i.date! > a ? i.date! : a), all[0].date!));
  const months: Date[] = [];
  for (let m = first; m <= last; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) months.push(m);
  if (months.length < 2) return null;

  const upTo = (list: Item[], m: Date) =>
    list
      .filter((i) => i.date && startOfMonth(i.date) <= m)
      .reduce((n, i) => n + (i.costCents ?? 0), 0);
  const savedLine = months.map((m) => upTo(deposits, m));
  const paidLine = months.map((m) => upTo(payments, m));
  const max = Math.max(...savedLine, ...paidLine, 1);

  const W = 320,
    H = 150,
    L = 8,
    R = 8,
    T = 14,
    B = 22;
  const x = (n: number) => L + ((W - L - R) * n) / (months.length - 1);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const pts = (line: number[]) => line.map((v, n) => `${x(n)},${y(v)}`).join(" ");

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={t("Savings plan")}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} style={{ stroke: "var(--color-border)" }} />
        ))}
        <polygon
          points={`${pts(savedLine)} ${x(months.length - 1)},${y(0)} ${x(0)},${y(0)}`}
          style={{ fill: "var(--color-ok)", fillOpacity: 0.12 }}
        />
        <polyline points={pts(paidLine)} fill="none" style={{ stroke: "#D9821A", strokeWidth: 2.5 }} />
        <polyline points={pts(savedLine)} fill="none" style={{ stroke: "var(--color-ok)", strokeWidth: 2.5 }} />
        {months.map((m, n) => (
          <text
            key={n}
            x={x(n)}
            y={H - 6}
            textAnchor={n === 0 ? "start" : n === months.length - 1 ? "end" : "middle"}
            style={{ fill: "var(--color-text-dim)", fontSize: 10 }}
          >
            {fmt(m, "MMM", lang)}
          </text>
        ))}
      </svg>
      <div className="mt-1 flex gap-4 text-[0.66rem] text-[var(--color-text-dim)]">
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2 w-2 rounded-sm bg-[var(--color-ok)]" />
          {t("Planned savings")}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="inline-block h-2 w-2 rounded-sm" style={{ background: "#D9821A" }} />
          {t("Payments due")}
        </span>
      </div>
    </div>
  );
}
