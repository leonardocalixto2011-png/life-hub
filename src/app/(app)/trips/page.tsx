import Link from "next/link";
import { Plane } from "lucide-react";
import { startOfDay } from "date-fns";

import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { getLang, getT } from "@/lib/i18n-server";
import { fmt, fmtShort } from "@/lib/i18n";
import { countdownLabel, money } from "@/lib/format";
import { TripForm } from "./TripForm";
import { PageHeader, SectionHeader } from "@/components/SectionHeader";

export const dynamic = "force-dynamic";

export default async function TripsPage() {
  const { user, hub } = await requireHub();
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const trips = await withHub(user.id, (tx) =>
    tx.trip.findMany({
      where: { hubId: hub.id, OR: [{ visibility: "SHARED" }, { createdById: user.id }] },
      include: { items: { select: { done: true, costCents: true, kind: true } } },
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
    return (
      <Link
        href={`/trips/${trip.id}`}
        className="card block p-4 transition-transform active:scale-[0.99]"
      >
        <div className="flex items-start gap-3">
          {trip.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- our own Blob URL, shown as-is
            <img src={trip.coverImageUrl} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
          ) : (
            <span className="icon-tile h-10 w-10 rounded-xl" aria-hidden>
              <Plane size={19} strokeWidth={2} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-semibold leading-snug">{trip.title}</div>
            <div className="mt-0.5 truncate text-xs text-[var(--color-text-dim)]">
              {trip.destination ? `${trip.destination} · ` : ""}
              {range(trip.startDate, trip.endDate)}
            </div>
          </div>
          <span
            className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={
              ongoing
                ? { background: "var(--ok-wash)", color: "var(--color-ok)" }
                : { background: "var(--color-surface-2)", color: "var(--color-text-dim)" }
            }
          >
            {ongoing ? t("happening now") : trip.endDate < today ? t("done") : countdownLabel(trip.startDate, lang)}
          </span>
        </div>
        {checkable.length > 0 && (
          <div className="mt-3 h-1.5 rounded-full bg-[var(--color-surface-2)]" aria-hidden>
            <div
              className="h-full rounded-full bg-[var(--color-primary)]"
              style={{ width: `${Math.max(3, (done / checkable.length) * 100)}%` }}
            />
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-[var(--color-text-dim)]">
          {checkable.length > 0 && (
            <span>{t("{done}/{total} checked off", { done, total: checkable.length })}</span>
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
