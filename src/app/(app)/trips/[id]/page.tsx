import Link from "next/link";
import { X } from "lucide-react";
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
import { addTripItem, addTripSavings, deleteTrip, deleteTripItem, importTripPlan, toggleTripItem } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { ActionForm } from "@/components/ActionForm";

export const dynamic = "force-dynamic";

/** Stop colours, in itinerary order. Travel days (no stop) are neutral. */
const STOP_COLORS = ["#D9821A", "#0E7C7B", "#C0392B", "#6D4FB3", "#2F7D4F", "#2563EB"];

/** Budget breakdown segments: distinct, and readable on light and dark. */
const MONEY_COLORS = ["#7C8B8C", "#0E7C7B", "#D9821A", "#C0392B", "#4B5B5C", "#6FB3AE", "#D8B07A", "#6D4FB3"];

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
  note: string | null;
};

const dayKey = (d: Date) => format(d, "yyyy-MM-dd");
const sectionTitle = "section-title";

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
        include: {
          items: { orderBy: [{ date: "asc" }, { createdAt: "asc" }] },
        },
      }),
    ),
    hubChrome(user.id, hub.id),
  ]);
  if (!trip) notFound();

  const currency = hub.currency;
  const locale = user.locale ?? "en-CA";
  const cash = (c: number) => money(c, currency, locale);
  const shortMoney = (c: number) =>
    new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(c / 100);
  const today = startOfDay(new Date());
  const nights = differenceInCalendarDays(trip.endDate, trip.startDate);
  // startOfDay: dates are stored at local noon, so the raw start is *after*
  // midnight today on the first day and the trip wouldn't be "now" until noon.
  // The end side is already right (noon on the last day is >= midnight).
  const status =
    startOfDay(trip.startDate) <= today && trip.endDate >= today
      ? t("Happening now")
      : trip.endDate < today
        ? t("Done")
        : countdownLabel(trip.startDate, lang);
  const dayFmt = lang === "fr" ? "EEE d MMM" : "EEE MMM d";

  const items: Item[] = trip.items;
  const stops = items.filter((i) => i.kind === "STOP" && i.date && i.endDate);
  const activities = items.filter((i) => i.kind === "ACTIVITY" && i.date);
  const deposits = items.filter((i) => i.kind === "SAVE");
  const budgetLines = items.filter((i) => i.kind === "BUDGET" && i.costCents);
  const tips = items.filter((i) => i.kind === "TIP");
  const tasks = items.filter((i) => i.kind === "BOOK" || i.kind === "TODO");
  const packing = items.filter((i) => i.kind === "PACK");
  const dated = items.filter((i) => (i.kind === "BOOK" || i.kind === "TODO" || i.kind === "SAVE") && i.date);

  // Money. With a budget breakdown, "planned" is its total; without one, the
  // sum of what the checklists cost. SAVE rows are money set aside, never
  // spending, so they stay out either way.
  const planned =
    budgetLines.length > 0
      ? budgetLines.reduce((n, i) => n + (i.costCents ?? 0), 0)
      : items
          .filter((i) => i.kind !== "SAVE" && i.kind !== "STOP" && i.kind !== "TIP")
          .reduce((n, i) => n + (i.costCents ?? 0), 0);
  // A line's share of the plan, 0–100. Guarded because `planned` can be 0 (or
  // below, from rows saved before negative amounts were rejected), and a bar
  // width of Infinity% or a label of NaN% is worse than an empty bar.
  const shareOf = (c: number) => (planned > 0 ? Math.max(0, (c / planned) * 100) : 0);
  const booked = tasks.filter((i) => i.done).reduce((n, i) => n + (i.costCents ?? 0), 0);
  const saved = trip.savedCents + deposits.filter((d) => d.done).reduce((n, d) => n + (d.costCents ?? 0), 0);
  const savedPct =
    trip.budgetCents && trip.budgetCents > 0 ? Math.min(100, Math.round((saved / trip.budgetCents) * 100)) : null;
  const next = dated.find((i) => !i.done);
  const daysToGo = differenceInCalendarDays(startOfDay(trip.startDate), today);
  // Split between the people going; no one picked (every older trip) = the whole hub.
  const going = trip.travelerIds.filter((id) => members.some((m) => m.id === id)).length;
  const heads = Math.max(1, going || members.length);

  // Day strip + day by day.
  const colorOf = new Map(stops.map((s, n) => [s.id, STOP_COLORS[n % STOP_COLORS.length]]));
  const days = eachDayOfInterval({
    start: startOfDay(trip.startDate),
    end: startOfDay(trip.endDate),
  });
  const stopOn = (d: Date) => stops.find((s) => startOfDay(s.date!) <= d && d < startOfDay(s.endDate!)) ?? null;
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

  const routeColors = stops.map((s) => colorOf.get(s.id)!);
  const heroBg =
    routeColors.length > 1
      ? `linear-gradient(120deg, ${routeColors.join(", ")})`
      : (routeColors[0] ?? "var(--color-primary)");
  const count = (list: Item[]) => ({
    done: list.filter((i) => i.done).length,
    total: list.length,
  });

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
          <SubmitButton
            aria-label={i.done ? t("Mark not done") : t("Mark done")}
            pendingLabel={i.done ? "✓" : ""}
            className="hit grid h-5 w-5 place-items-center rounded border border-[var(--color-border)] text-xs"
            style={
              i.done
                ? {
                    background: "var(--color-ok)",
                    color: "var(--color-surface)",
                    borderColor: "var(--color-ok)",
                  }
                : undefined
            }
          >
            {i.done ? "✓" : ""}
          </SubmitButton>
        </form>
        <div className="min-w-0 flex-1">
          <span
            className="text-sm"
            style={
              i.done
                ? {
                    textDecoration: "line-through",
                    color: "var(--color-text-dim)",
                  }
                : undefined
            }
          >
            {i.title}
          </span>
          {i.note && <p className="mt-0.5 text-[0.7rem] leading-snug text-[var(--color-text-dim)]">{i.note}</p>}
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
          <SubmitButton aria-label={t("Delete")} className="-m-2 grid h-9 w-9 place-items-center rounded-full text-[var(--color-text-dim)]" pendingLabel="…">
            <X size={15} strokeWidth={2.25} aria-hidden />
          </SubmitButton>
        </form>
      </div>
    );
  };

  return (
    <div className="page">
      <Link href="/trips" className="back-link">
        {t("Trips")}
      </Link>

      {/* ---- hero: where, when, and the route ---------------------------- */}
      <div className="card overflow-hidden p-0">
        <div className="p-4 text-white" style={{ background: heroBg }}>
          <div className="text-[0.62rem] font-bold uppercase tracking-[0.14em] opacity-90">
            {fmt(trip.startDate, dayFmt, lang)} – {fmt(trip.endDate, `${dayFmt} yyyy`, lang)}
            {nights > 0 ? ` · ${nights === 1 ? t("1 night") : t("{n} nights", { n: nights })}` : ""}
          </div>
          <h1 className="display mt-1 text-[1.7rem] leading-tight">{trip.title}</h1>
          {trip.destination && <p className="text-sm opacity-90">{trip.destination}</p>}
          <div className="mt-3 flex items-end justify-between gap-3">
            {daysToGo > 0 ? (
              <div>
                <div className="text-4xl font-bold leading-none tabular-nums tracking-[-0.03em]">{daysToGo}</div>
                <div className="text-[0.7rem] font-semibold uppercase tracking-wide opacity-90">
                  {daysToGo === 1 ? t("day to go") : t("days to go")}
                </div>
              </div>
            ) : (
              <span className="rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold">{status}</span>
            )}
            {savedPct != null && (
              <div className="text-right">
                <div className="text-2xl font-bold leading-none tabular-nums">{savedPct}%</div>
                <div className="text-[0.7rem] font-semibold uppercase tracking-wide opacity-90">{t("saved")}</div>
              </div>
            )}
          </div>
        </div>
        {stops.length > 0 && (
          <ol className="flex items-start overflow-x-auto px-3 py-3" aria-label={t("Route")}>
            <RouteStop label="✈" color="var(--color-text-dim)" name={t("Home")} />
            {stops.map((s) => {
              const n = differenceInCalendarDays(s.endDate!, s.date!);
              return (
                <RouteStop
                  key={s.id}
                  label={String(n)}
                  color={colorOf.get(s.id)!}
                  name={s.title}
                  sub={n === 1 ? t("1 night") : t("{n} nights", { n })}
                />
              );
            })}
            <RouteStop label="✈" color="var(--color-text-dim)" name={t("Home")} last />
          </ol>
        )}
      </div>

      {/* ---- progress rings ---------------------------------------------- */}
      <div className="grid grid-cols-4 gap-2">
        <Ring label={t("Activities")} {...count(activities)} color={routeColors[0] ?? "var(--color-primary)"} />
        <Ring label={t("To book")} {...count(tasks)} color="#D9821A" />
        <Ring
          label={t("Saved")}
          done={savedPct ?? 0}
          total={100}
          color="var(--color-ok)"
          text={savedPct != null ? `${savedPct}%` : "—"}
        />
        <Ring label={t("Packed")} {...count(packing)} color={routeColors[1] ?? "var(--color-primary)"} />
      </div>

      {next && (
        <div className="card flex items-center gap-3 border-l-4 p-3" style={{ borderLeftColor: TAG[next.kind]?.color }}>
          <div className="min-w-0 flex-1">
            <div className="text-[0.6rem] font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
              {t("Next up")}
            </div>
            <div className="text-sm font-semibold leading-snug">{next.title}</div>
          </div>
          {next.date && (
            <div className="shrink-0 text-right">
              <div className="text-sm font-bold">{countdownLabel(next.date, lang)}</div>
              <div className="text-[0.66rem] text-[var(--color-text-dim)]">{fmt(next.date, dayFmt, lang)}</div>
            </div>
          )}
        </div>
      )}

      {/* ---- day strip --------------------------------------------------- */}
      {stops.length > 0 && days.length <= 60 && (
        <section>
          <h2 className={sectionTitle}>{t("At a glance")}</h2>
          <div
            className="grid gap-[3px]"
            style={{
              gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
            }}
          >
            {days.map((d) => {
              const s = stopOn(d);
              return (
                <div key={dayKey(d)} className="grid gap-1 text-center">
                  <span
                    className="block h-8 rounded"
                    style={{
                      background: s ? colorOf.get(s.id) : "var(--color-surface-2)",
                    }}
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
            {days.map((d, n) => {
              const s = stopOn(d);
              const list = activitiesOn.get(dayKey(d)) ?? [];
              const allDone = list.length > 0 && list.every((a) => a.done);
              return (
                <div
                  key={dayKey(d)}
                  className="card overflow-hidden border-l-4 p-0"
                  style={{
                    borderLeftColor: s ? colorOf.get(s.id) : "var(--color-border)",
                  }}
                >
                  <div className="flex items-baseline justify-between gap-2 px-3 pt-2">
                    <span className="text-sm font-semibold">
                      <span className="mr-1.5 text-[0.62rem] font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
                        {t("Day {n}", { n: n + 1 })}
                      </span>
                      {fmt(d, dayFmt, lang)}
                      {allDone && <span className="ml-1.5 text-[var(--color-ok)]">✓</span>}
                    </span>
                    <span
                      className="text-[0.62rem] font-bold uppercase tracking-wide"
                      style={{
                        color: s ? colorOf.get(s.id) : "var(--color-text-dim)",
                      }}
                    >
                      {s?.title ?? t("Travel")}
                    </span>
                  </div>
                  {list.length === 0 ? (
                    <p className="px-3 pb-2 pt-1 text-[0.72rem] text-[var(--color-text-dim)]">
                      {t("Nothing planned yet")}
                    </p>
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
                <div className="list">
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
            {deposits.length > 0 && (
              <SavingsChart deposits={deposits} dated={dated} t={t} lang={lang} short={(c) => shortMoney(c)} />
            )}
            {deposits.length > 0 && (
              <table className="w-full text-[0.78rem] tabular-nums">
                <thead>
                  <tr className="text-left text-[0.6rem] uppercase tracking-wide text-[var(--color-text-dim)]">
                    <th className="pb-1 font-bold">{t("Month")}</th>
                    {heads > 1 && <th className="pb-1 text-right font-bold">{t("Each")}</th>}
                    <th className="pb-1 text-right font-bold">{t("Together")}</th>
                    <th className="pb-1 text-right font-bold">{t("Total")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {deposits.map((d, n) => {
                    const total = deposits.slice(0, n + 1).reduce((x, i) => x + (i.costCents ?? 0), 0);
                    return (
                      <tr key={d.id} style={d.done ? { color: "var(--color-ok)" } : undefined}>
                        <td className="py-1 capitalize">
                          {d.done ? "✓ " : ""}
                          {d.date ? fmt(d.date, "MMM yyyy", lang) : "—"}
                        </td>
                        {heads > 1 && (
                          <td className="py-1 text-right">{cash(Math.round((d.costCents ?? 0) / heads))}</td>
                        )}
                        <td className="py-1 text-right font-semibold">{cash(d.costCents ?? 0)}</td>
                        <td className="py-1 text-right">{cash(total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <ActionForm action={save} className="grid grid-cols-[1fr_auto] gap-2">
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
              <SubmitButton className="btn">
                {t("+ Add to savings")}
              </SubmitButton>
            </ActionForm>
            <p className="text-[0.66rem] text-[var(--color-text-dim)]">
              {t("Tick a deposit in the booking calendar when it's done; it counts toward Saved.")}
            </p>
          </div>
        </section>
      )}

      {/* ---- where the money goes ---------------------------------------- */}
      <section>
        <h2 className={sectionTitle}>{t("Where the money goes")}</h2>
        <div className="card space-y-3 p-3">
          {budgetLines.length > 0 && (
            <>
              <div className="flex h-4 overflow-hidden rounded-full" role="img" aria-label={t("Where the money goes")}>
                {budgetLines.map((b, n) => (
                  <span
                    key={b.id}
                    title={`${b.title} · ${cash(b.costCents!)}`}
                    style={{
                      width: `${shareOf(b.costCents!)}%`,
                      background: MONEY_COLORS[n % MONEY_COLORS.length],
                    }}
                  />
                ))}
              </div>
              <ul className="space-y-1.5">
                {budgetLines.map((b, n) => (
                  <li key={b.id} className="flex items-center gap-2 text-[0.8rem]">
                    <i
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{
                        background: MONEY_COLORS[n % MONEY_COLORS.length],
                      }}
                    />
                    <span className="min-w-0 flex-1">{b.title}</span>
                    <span className="tabular-nums text-[var(--color-text-dim)]">
                      {Math.round(shareOf(b.costCents!))}%
                    </span>
                    <span className="w-20 text-right font-semibold tabular-nums">{cash(b.costCents!)}</span>
                    <form action={deleteTripItem}>
                      <input type="hidden" name="id" value={b.id} />
                      <SubmitButton aria-label={t("Delete")} className="-m-2 grid h-9 w-9 place-items-center rounded-full text-[var(--color-text-dim)]" pendingLabel="…">
                        <X size={15} strokeWidth={2.25} aria-hidden />
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="grid grid-cols-3 divide-x divide-[var(--color-border)] border-t border-[var(--color-border)] pt-3">
            <div className="pr-2">
              {trip.budgetCents != null ? (
                <Figure cents={trip.budgetCents} currency={currency} locale={locale} label={t("budget")} />
              ) : (
                <div className="text-[0.68rem] text-[var(--color-text-dim)]">{t("No budget set")}</div>
              )}
            </div>
            <div className="px-2">
              <Figure cents={planned} currency={currency} locale={locale} label={t("planned")} />
            </div>
            <div className="pl-2">
              <Figure cents={booked} currency={currency} locale={locale} label={t("booked")} tone="ok" />
            </div>
          </div>
          {trip.budgetCents != null && planned > trip.budgetCents && (
            <p className="text-[0.7rem] font-semibold text-[var(--color-danger)]">
              {t("Planned is {n} over budget.", {
                n: cash(planned - trip.budgetCents),
              })}
            </p>
          )}
        </div>
      </section>

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
              <div className="list">
                {list.map((i) => (
                  <Row key={i.id} i={i} />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {/* ---- good to know ----------------------------------------------- */}
      {tips.length > 0 && (
        <section>
          <h2 className={sectionTitle}>{t("Good to know")}</h2>
          <div className="space-y-2">
            {tips.map((tip, n) => (
              <div
                key={tip.id}
                className="card border-t-4 p-3"
                style={{
                  borderTopColor: routeColors[n % Math.max(1, routeColors.length)] ?? "var(--color-primary)",
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold">{tip.title}</h3>
                  <form action={deleteTripItem}>
                    <input type="hidden" name="id" value={tip.id} />
                    <SubmitButton aria-label={t("Delete")} className="-m-2 grid h-9 w-9 place-items-center rounded-full text-[var(--color-text-dim)]" pendingLabel="…">
                      <X size={15} strokeWidth={2.25} aria-hidden />
                    </SubmitButton>
                  </form>
                </div>
                {tip.note && (
                  <p className="mt-1 text-[0.8rem] leading-relaxed text-[var(--color-text-dim)]">{tip.note}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---- add anything ------------------------------------------------ */}
      <ActionForm action={add} className="card space-y-2 p-3">
        <h2 className={sectionTitle}>{t("Add to the plan")}</h2>
        <div className="grid grid-cols-[7.5rem_1fr] gap-2">
          <select name="kind" defaultValue="ACTIVITY" className="field" aria-label={t("List")}>
            <option value="ACTIVITY">{t("Activity")}</option>
            <option value="BOOK">{t("To book")}</option>
            <option value="TODO">{t("To do")}</option>
            <option value="SAVE">{t("Savings deposit")}</option>
            <option value="PACK">{t("To pack")}</option>
            <option value="STOP">{t("Where we sleep")}</option>
            <option value="BUDGET">{t("Budget line")}</option>
            <option value="TIP">{t("Good to know")}</option>
          </select>
          <input
            name="title"
            required
            className="field"
            placeholder={t("Snorkel trip, hotel, sunscreen…")}
            aria-label={t("Title")}
          />
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
        <input name="note" className="field" placeholder={t("Details (optional)")} aria-label={t("Details")} />
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <input
            name="cost"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            className="field"
            placeholder={t("Cost")}
            aria-label={t("Cost")}
          />
          <select name="assignedToId" defaultValue="" className="field" aria-label={t("Who")}>
            <option value="">{t("Anyone")}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? m.email}
              </option>
            ))}
          </select>
          <SubmitButton className="btn btn-primary">
            {t("Add")}
          </SubmitButton>
        </div>
      </ActionForm>

      {trip.notes && <p className="card p-3 text-sm whitespace-pre-wrap">{trip.notes}</p>}

      <details className="group" open={items.length === 0}>
        <summary className="cursor-pointer list-none text-xs font-semibold text-[var(--color-primary)]">
          {t("Import a whole plan")}
        </summary>
        <div className="mt-2 space-y-2">
          <ActionForm action={importPlan} className="card space-y-2 p-3">
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
              <SubmitButton className="btn btn-primary">
                {t("Import")}
              </SubmitButton>
            </div>
          </ActionForm>
          <ActionForm action={importPlan} className="card space-y-2 p-3">
            <textarea
              name="json"
              rows={4}
              className="field font-mono text-xs"
              placeholder={t("…or paste a plan as JSON")}
              aria-label={t("Plan as JSON")}
            />
            <SubmitButton className="btn w-full">
              {t("Import pasted plan")}
            </SubmitButton>
          </ActionForm>
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
              travelerIds: trip.travelerIds,
            }}
            members={members}
          />
          <form action={deleteTrip}>
            <input type="hidden" name="id" value={trip.id} />
            <SubmitButton className="btn w-full text-[var(--color-danger)]" pendingLabel={t("Deleting…")}>
              {t("Delete trip")}
            </SubmitButton>
          </form>
        </div>
      </details>
    </div>
  );
}

function RouteStop({
  label,
  color,
  name,
  sub,
  last,
}: {
  label: string;
  color: string;
  name: string;
  sub?: string;
  last?: boolean;
}) {
  return (
    <li className="relative flex min-w-[4.2rem] flex-1 flex-col items-center text-center">
      {!last && <span aria-hidden className="absolute left-1/2 top-3 h-0.5 w-full bg-[var(--color-border)]" />}
      <span
        className="relative grid h-6 w-6 place-items-center rounded-full text-[0.65rem] font-bold text-white"
        style={{ background: color }}
      >
        {label}
      </span>
      <span className="mt-1 text-[0.7rem] font-semibold leading-tight">{name}</span>
      {sub && <span className="text-[0.6rem] text-[var(--color-text-dim)]">{sub}</span>}
    </li>
  );
}

/** A small completion ring: done out of total, with the count in the middle. */
function Ring({
  label,
  done,
  total,
  color,
  text,
}: {
  label: string;
  done: number;
  total: number;
  color: string;
  text?: string;
}) {
  const r = 20;
  const c = 2 * Math.PI * r;
  const f = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <div className="card flex flex-col items-center gap-1 p-2">
      <svg viewBox="0 0 48 48" className="h-12 w-12" role="img" aria-label={`${label}: ${text ?? `${done}/${total}`}`}>
        <circle cx="24" cy="24" r={r} fill="none" strokeWidth="5" style={{ stroke: "var(--color-surface-2)" }} />
        {f > 0 && (
          <circle
            cx="24"
            cy="24"
            r={r}
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${c * f} ${c}`}
            transform="rotate(-90 24 24)"
            style={{ stroke: color }}
          />
        )}
        <text
          x="24"
          y="27.5"
          textAnchor="middle"
          style={{ fill: "var(--color-text)", fontSize: 10.5, fontWeight: 700 }}
        >
          {text ?? `${done}/${total}`}
        </text>
      </svg>
      <span className="text-center text-[0.6rem] font-semibold uppercase leading-tight tracking-wide text-[var(--color-text-dim)]">
        {label}
      </span>
    </div>
  );
}

/**
 * Cumulative savings plan against cumulative payments, month by month. The
 * point is one glance: the green line should stay above the orange one, i.e.
 * the money is there before each bill lands.
 */
function SavingsChart({
  deposits,
  dated,
  t,
  lang,
  short,
}: {
  deposits: Item[];
  dated: Item[];
  t: T;
  lang: "en" | "fr";
  short: (cents: number) => string;
}) {
  const payments = dated.filter((i) => i.kind !== "SAVE" && i.costCents);
  const all = [...deposits, ...payments].filter((i) => i.date);
  if (all.length === 0) return null;

  const first = startOfMonth(all.reduce((a, i) => (i.date! < a ? i.date! : a), all[0].date!));
  const last = startOfMonth(all.reduce((a, i) => (i.date! > a ? i.date! : a), all[0].date!));
  const months: Date[] = [];
  for (let m = first; m <= last; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) months.push(m);
  if (months.length < 2) return null;

  const upTo = (list: Item[], m: Date) =>
    list.filter((i) => i.date && startOfMonth(i.date) <= m).reduce((n, i) => n + (i.costCents ?? 0), 0);
  const savedLine = months.map((m) => upTo(deposits, m));
  const paidLine = months.map((m) => upTo(payments, m));
  const max = Math.max(...savedLine, ...paidLine, 1);

  const W = 320,
    H = 160,
    L = 8,
    R = 8,
    T = 22,
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
        {savedLine.map((v, n) => (
          <g key={n}>
            <circle cx={x(n)} cy={y(v)} r={3} style={{ fill: "var(--color-ok)" }} />
            <text
              x={x(n)}
              y={y(v) - 6}
              textAnchor={n === 0 ? "start" : n === months.length - 1 ? "end" : "middle"}
              style={{
                fill: "var(--color-text)",
                fontSize: 9,
                fontWeight: 600,
              }}
            >
              {short(v)}
            </text>
          </g>
        ))}
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
