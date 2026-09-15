import Link from "next/link";
import { notFound } from "next/navigation";
import { differenceInCalendarDays, format, startOfDay } from "date-fns";

import { hubChrome } from "@/lib/data";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { countdownLabel, initials, money, toDateInput } from "@/lib/format";
import { centsToInput } from "@/lib/money";
import { Figure } from "@/components/Figure";
import { TripForm } from "../TripForm";
import { addTripItem, deleteTrip, deleteTripItem, toggleTripItem } from "../actions";

export const dynamic = "force-dynamic";

const SECTIONS = [
  { kind: "BOOK", title: "To book", hint: "Flights, hotel, car, tickets" },
  { kind: "TODO", title: "To do", hint: "Passport, time off, pet sitter" },
  { kind: "PACK", title: "Packing list", hint: "What goes in the suitcase" },
] as const;

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, hub } = await requireHub();
  const [trip, { members }] = await Promise.all([
    withHub(user.id, (tx) =>
      tx.trip.findFirst({
        where: {
          id,
          hubId: hub.id,
          OR: [{ visibility: "SHARED" }, { createdById: user.id }],
        },
        include: { items: { orderBy: [{ done: "asc" }, { createdAt: "asc" }] } },
      }),
    ),
    hubChrome(user.id, hub.id),
  ]);
  if (!trip) notFound();

  const currency = hub.currency;
  const locale = user.locale ?? "en-CA";
  const today = startOfDay(new Date());
  const nights = differenceInCalendarDays(trip.endDate, trip.startDate);
  const status =
    trip.startDate <= today && trip.endDate >= today
      ? "Happening now"
      : trip.endDate < today
        ? "Done"
        : countdownLabel(trip.startDate);

  const planned = trip.items.reduce((n, i) => n + (i.costCents ?? 0), 0);
  const memberName = new Map(members.map((m) => [m.id, m]));
  const add = addTripItem.bind(null, trip.id);

  return (
    <div className="space-y-4 p-3">
      <Link href="/trips" className="text-xs font-semibold text-[var(--color-text-dim)]">
        ← Trips
      </Link>

      <div>
        <h1 className="display text-2xl">{trip.title}</h1>
        <p className="text-xs text-[var(--color-text-dim)]">
          {trip.destination ? `${trip.destination} · ` : ""}
          {format(trip.startDate, "EEE MMM d")} – {format(trip.endDate, "EEE MMM d, yyyy")}
          {nights > 0 ? ` · ${nights} night${nights === 1 ? "" : "s"}` : ""}
        </p>
        <span className="chip mt-2">{status}</span>
      </div>

      <div className="card grid grid-cols-3 divide-x divide-[var(--color-border)] p-0">
        <div className="p-3">
          {trip.budgetCents != null ? (
            <Figure cents={trip.budgetCents} currency={currency} locale={locale} label="budget" />
          ) : (
            <div className="text-[0.68rem] text-[var(--color-text-dim)]">No budget set</div>
          )}
        </div>
        <div className="p-3">
          <Figure cents={planned} currency={currency} locale={locale} label="planned" />
        </div>
        <div className="p-3">
          {trip.budgetCents != null && (
            <Figure
              cents={trip.budgetCents - planned}
              currency={currency}
              locale={locale}
              label="left"
              tone={trip.budgetCents - planned < 0 ? "danger" : "ok"}
            />
          )}
        </div>
      </div>

      <form action={add} className="card space-y-2 p-3">
        <div className="grid grid-cols-[7rem_1fr] gap-2">
          <select name="kind" defaultValue="BOOK" className="field" aria-label="List">
            <option value="BOOK">To book</option>
            <option value="TODO">To do</option>
            <option value="PACK">To pack</option>
          </select>
          <input name="title" required className="field" placeholder="Hotel, passport, sunscreen…" />
        </div>
        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <input
            name="cost"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            className="field"
            placeholder="Cost"
          />
          <select name="assignedToId" defaultValue="" className="field" aria-label="Who">
            <option value="">Anyone</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? m.email}
              </option>
            ))}
          </select>
          <button type="submit" className="btn btn-primary">
            Add
          </button>
        </div>
      </form>

      {SECTIONS.map((sec) => {
        const items = trip.items.filter((i) => i.kind === sec.kind);
        return (
          <section key={sec.kind}>
            <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
              {sec.title}
              {items.length > 0 ? ` · ${items.filter((i) => i.done).length}/${items.length}` : ""}
            </h2>
            {items.length === 0 ? (
              <p className="card p-3 text-[0.72rem] text-[var(--color-text-dim)]">{sec.hint}</p>
            ) : (
              <div className="card divide-y divide-[var(--color-border)]">
                {items.map((i) => {
                  const who = i.assignedToId ? memberName.get(i.assignedToId) : null;
                  return (
                    <div key={i.id} className="flex items-center gap-2.5 px-3 py-2">
                      <form action={toggleTripItem}>
                        <input type="hidden" name="id" value={i.id} />
                        <button
                          aria-label={i.done ? "Mark not done" : "Mark done"}
                          className="grid h-5 w-5 place-items-center rounded border border-[var(--color-border)] text-xs"
                          style={i.done ? { background: "var(--color-ok)", color: "#fff", borderColor: "var(--color-ok)" } : undefined}
                        >
                          {i.done ? "✓" : ""}
                        </button>
                      </form>
                      <span
                        className="min-w-0 flex-1 truncate text-sm"
                        style={i.done ? { textDecoration: "line-through", color: "var(--color-text-dim)" } : undefined}
                      >
                        {i.title}
                      </span>
                      {who && (
                        <span
                          title={who.name ?? who.email ?? undefined}
                          className="grid h-5 w-5 place-items-center rounded-full bg-[var(--color-surface-2)] text-[0.55rem] font-bold text-[var(--color-text-dim)]"
                        >
                          {initials(who.name, who.email)}
                        </span>
                      )}
                      {i.costCents != null && (
                        <span className="text-xs tabular-nums text-[var(--color-text-dim)]">
                          {money(i.costCents, currency, locale)}
                        </span>
                      )}
                      <form action={deleteTripItem}>
                        <input type="hidden" name="id" value={i.id} />
                        <button aria-label="Delete" className="text-xs text-[var(--color-text-dim)]">
                          ✕
                        </button>
                      </form>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {trip.notes && <p className="card p-3 text-sm whitespace-pre-wrap">{trip.notes}</p>}

      <details className="group">
        <summary className="cursor-pointer list-none text-xs font-semibold text-[var(--color-primary)]">
          Edit trip details
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
              Delete trip
            </button>
          </form>
        </div>
      </details>
    </div>
  );
}
