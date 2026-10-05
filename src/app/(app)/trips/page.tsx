import Link from "next/link";
import { startOfDay } from "date-fns";

import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { getLang, getT } from "@/lib/i18n-server";
import { fmt, fmtShort } from "@/lib/i18n";
import { countdownLabel, money } from "@/lib/format";
import { TripForm } from "./TripForm";
import { tripGradient } from "./colors";
import { PageHeader, SectionHeader } from "@/components/SectionHeader";

export const dynamic = "force-dynamic";

export default async function TripsPage() {
  const { user, hub } = await requireHub();
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const trips = await withHub(user.id, (tx) =>
    tx.trip.findMany({
      where: { hubId: hub.id, OR: [{ visibility: "SHARED" }, { createdById: user.id }] },
      include: { items: { select: { done: true, costCents: true, kind: true, date: true, endDate: true } } },
      orderBy: { startDate: "asc" },
    }),
  );

  const today = startOfDay(new Date());
  const upcoming = trips.filter((t) => t.endDate >= today);
  const past = trips.filter((t) => t.endDate < today).reverse();
  const locale = user.locale ?? "en-CA";
  const range = (start: Date, end: Date) =>
    `${fmtShort(start, lang)} – ${fmt(end, lang === "fr" ? "d MMM yyyy" : "MMM d, yyyy", lang)}`;

  const Card = ({ trip }: { trip: (typeof trips)[number] }) => {
    // Stops, budget lines and tips aren't to-dos, and savings deposits aren't
    // spending. A budget breakdown, when there is one, is the planned total
    // (same rule as the trip page).
    const checkable = trip.items.filter((i) => i.kind !== "STOP" && i.kind !== "BUDGET" && i.kind !== "TIP");
    const done = checkable.filter((i) => i.done).length;
    const lines = trip.items.filter((i) => i.kind === "BUDGET");
    const planned = (
      lines.length > 0 ? lines : trip.items.filter((i) => i.kind !== "SAVE" && i.kind !== "STOP" && i.kind !== "TIP")
    ).reduce((n, i) => n + (i.costCents ?? 0), 0);
    // startOfDay: start is stored at local noon, so compare its day, not its
    // hour, or the first morning of a trip reads as a countdown.
    const ongoing = startOfDay(trip.startDate) <= today && trip.endDate >= today;
    const stopCount = trip.items.filter((i) => i.kind === "STOP" && i.date && i.endDate).length;
    const status = ongoing
      ? t("happening now")
      : trip.endDate < today
        ? t("done")
        : countdownLabel(trip.startDate, lang);
    return (
      // A postcard: the trip's photo (or its stop colours) on top, the
      // numbers underneath. Before this, a trip with no photo was a grey
      // plane icon and a line of small text, and every trip looked alike.
      <Link
        href={`/trips/${trip.id}`}
        className="card block overflow-hidden transition-transform active:scale-[0.99]"
      >
        <div
          className="relative flex h-28 flex-col justify-end bg-cover bg-center p-4 text-white"
          style={
            trip.coverImageUrl
              ? {
                  backgroundImage: `linear-gradient(180deg, rgba(0,0,0,.05), rgba(0,0,0,.6)), url("${trip.coverImageUrl}")`,
                }
              : { background: tripGradient(trip.title, stopCount) }
          }
        >
          {!trip.coverImageUrl && (
            // A soft light from the top corner, so a flat colour reads as a
            // surface rather than a swatch. Same idea as the app icon.
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(120% 90% at 15% 0%, rgba(255,255,255,.28), rgba(255,255,255,0) 60%), linear-gradient(180deg, rgba(0,0,0,0), rgba(0,0,0,.28))",
              }}
            />
          )}
          <span
            className="absolute right-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold backdrop-blur"
            style={{ background: ongoing ? "rgba(21,128,61,.85)" : "rgba(0,0,0,.28)" }}
          >
            {status}
          </span>
          <div className="relative min-w-0">
            <div className="display truncate text-2xl font-semibold leading-tight drop-shadow-sm">{trip.title}</div>
            <div className="mt-0.5 truncate text-xs font-medium opacity-90">
              {trip.destination ? `${trip.destination} · ` : ""}
              {range(trip.startDate, trip.endDate)}
            </div>
          </div>
        </div>
        <div className="p-4 pt-3">
          {checkable.length > 0 && (
            <div className="mb-2 h-1.5 rounded-full bg-[var(--color-surface-2)]" aria-hidden>
              <div
                className="h-full rounded-full bg-[var(--color-primary)]"
                style={{ width: `${Math.max(3, (done / checkable.length) * 100)}%` }}
              />
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-[var(--color-text-dim)]">
            {checkable.length > 0 && (
              <span>{t("{done}/{total} checked off", { done, total: checkable.length })}</span>
            )}
            {trip.budgetCents != null && (
              <span>{t("budget")} {money(trip.budgetCents, hub.currency, locale)}</span>
            )}
            {planned > 0 && <span>{t("planned")} {money(planned, hub.currency, locale)}</span>}
            {checkable.length === 0 && trip.budgetCents == null && planned === 0 && (
              <span>{t("Open it to add dates, bookings and a packing list.")}</span>
            )}
          </div>
        </div>
      </Link>
    );
  };

  return (
    <div className="page">
      <PageHeader title={t("Trips")} sub={t("Dates, budget, what to book and what to pack — planned together.")} />

      <TripForm />

      {trips.length === 0 && (
        <p className="card px-5 py-8 text-center text-sm text-[var(--color-text-dim)]">
          {t("No trips yet. Where to next?")}
        </p>
      )}

      {upcoming.length > 0 && (
        <section className="space-y-2.5">
          <SectionHeader title={`${t("Coming up")} · ${upcoming.length}`} />
          {upcoming.map((trip) => (
            <Card key={trip.id} trip={trip} />
          ))}
        </section>
      )}

      {past.length > 0 && (
        <section className="space-y-2.5">
          <SectionHeader title={`${t("Past")} · ${past.length}`} />
          {past.map((trip) => (
            <Card key={trip.id} trip={trip} />
          ))}
        </section>
      )}
    </div>
  );
}
