import Link from "next/link";
import { format, startOfDay } from "date-fns";

import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { countdownLabel, money } from "@/lib/format";
import { TripForm } from "./TripForm";

export const dynamic = "force-dynamic";

function range(start: Date, end: Date) {
  const sameYear = start.getFullYear() === end.getFullYear();
  return `${format(start, "MMM d")} – ${format(end, sameYear ? "MMM d, yyyy" : "MMM d, yyyy")}`;
}

export default async function TripsPage() {
  const { user, hub } = await requireHub();
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

  const Card = ({ t }: { t: (typeof trips)[number] }) => {
    const done = t.items.filter((i) => i.done).length;
    const planned = t.items.reduce((n, i) => n + (i.costCents ?? 0), 0);
    const ongoing = t.startDate <= today && t.endDate >= today;
    return (
      <Link href={`/trips/${t.id}`} className="card block p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-medium">✈️ {t.title}</div>
            <div className="text-[0.7rem] text-[var(--color-text-dim)]">
              {t.destination ? `${t.destination} · ` : ""}
              {range(t.startDate, t.endDate)}
            </div>
          </div>
          <span className="shrink-0 text-xs font-semibold">
            {ongoing ? "happening now" : t.endDate < today ? "done" : countdownLabel(t.startDate)}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-3 text-[0.7rem] text-[var(--color-text-dim)]">
          {t.items.length > 0 && (
            <span>
              {done}/{t.items.length} checked off
            </span>
          )}
          {t.budgetCents != null && <span>budget {money(t.budgetCents, hub.currency)}</span>}
          {planned > 0 && <span>planned {money(planned, hub.currency)}</span>}
        </div>
      </Link>
    );
  };

  return (
    <div className="space-y-4 p-3">
      <div>
        <h1 className="text-lg font-bold">Trips</h1>
        <p className="text-[0.68rem] text-[var(--color-text-dim)]">
          Dates, budget, what to book and what to pack — planned together.
        </p>
      </div>

      <TripForm />

      {trips.length === 0 && (
        <p className="card p-6 text-center text-sm text-[var(--color-text-dim)]">
          No trips yet. Where to next?
        </p>
      )}

      {upcoming.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
            Coming up · {upcoming.length}
          </h2>
          {upcoming.map((t) => (
            <Card key={t.id} t={t} />
          ))}
        </section>
      )}

      {past.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
            Past · {past.length}
          </h2>
          {past.map((t) => (
            <Card key={t.id} t={t} />
          ))}
        </section>
      )}
    </div>
  );
}
