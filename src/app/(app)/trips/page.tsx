import Link from "next/link";
import { startOfDay } from "date-fns";

import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { getLang, getT } from "@/lib/i18n-server";
import { fmt, fmtShort } from "@/lib/i18n";
import { countdownLabel, money } from "@/lib/format";
import { TripForm } from "./TripForm";

export const dynamic = "force-dynamic";

export default async function TripsPage() {
  const { user, hub } = await requireHub();
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const trips = await withHub(user.id, (tx) =>
    tx.trip.findMany({
      where: { hubId: hub.id, OR: [{ visibility: "SHARED" }, { createdById: user.id }] },
      include: { items: { select: { done: true, costCents: true } } },
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
    const done = trip.items.filter((i) => i.done).length;
    const planned = trip.items.reduce((n, i) => n + (i.costCents ?? 0), 0);
    const ongoing = trip.startDate <= today && trip.endDate >= today;
    return (
      <Link href={`/trips/${trip.id}`} className="card block p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-medium">✈️ {trip.title}</div>
            <div className="text-[0.7rem] text-[var(--color-text-dim)]">
              {trip.destination ? `${trip.destination} · ` : ""}
              {range(trip.startDate, trip.endDate)}
            </div>
          </div>
          <span className="shrink-0 text-xs font-semibold">
            {ongoing ? t("happening now") : trip.endDate < today ? t("done") : countdownLabel(trip.startDate, lang)}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-3 text-[0.7rem] text-[var(--color-text-dim)]">
          {trip.items.length > 0 && (
            <span>{t("{done}/{total} checked off", { done, total: trip.items.length })}</span>
          )}
          {trip.budgetCents != null && (
            <span>{t("budget")} {money(trip.budgetCents, hub.currency, locale)}</span>
          )}
          {planned > 0 && <span>{t("planned")} {money(planned, hub.currency, locale)}</span>}
        </div>
      </Link>
    );
  };

  return (
    <div className="space-y-4 p-3">
      <div>
        <h1 className="text-lg font-bold">{t("Trips")}</h1>
        <p className="text-[0.68rem] text-[var(--color-text-dim)]">
          {t("Dates, budget, what to book and what to pack — planned together.")}
        </p>
      </div>

      <TripForm />

      {trips.length === 0 && (
        <p className="card p-6 text-center text-sm text-[var(--color-text-dim)]">
          {t("No trips yet. Where to next?")}
        </p>
      )}

      {upcoming.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
            {t("Coming up")} · {upcoming.length}
          </h2>
          {upcoming.map((trip) => (
            <Card key={trip.id} trip={trip} />
          ))}
        </section>
      )}

      {past.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
            {t("Past")} · {past.length}
          </h2>
          {past.map((trip) => (
            <Card key={trip.id} trip={trip} />
          ))}
        </section>
      )}
    </div>
  );
}
