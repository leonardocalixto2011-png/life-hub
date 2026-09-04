import Link from "next/link";
import { endOfDay, format, isSameDay, startOfDay } from "date-fns";

import { listEvents, listMembers, listVentures, type EventWithRefs } from "@/lib/data";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { eventTimeRange, initials } from "@/lib/format";
import { VentureChip } from "@/components/VentureChip";
import { EventForm } from "./EventForm";

export const dynamic = "force-dynamic";

function AttendeeDots({
  ids,
  members,
}: {
  ids: string[];
  members: { id: string; name: string | null; email: string | null }[];
}) {
  if (ids.length === 0) return null;
  const map = new Map(members.map((m) => [m.id, m]));
  return (
    <div className="flex -space-x-1">
      {ids.slice(0, 4).map((id) => {
        const m = map.get(id);
        return (
          <span
            key={id}
            title={m?.name ?? m?.email ?? undefined}
            className="grid h-5 w-5 place-items-center rounded-full border border-[var(--color-surface)] bg-[var(--color-surface-2)] text-[0.55rem] font-bold text-[var(--color-text-dim)]"
          >
            {initials(m?.name, m?.email)}
          </span>
        );
      })}
      {ids.length > 4 && (
        <span className="grid h-5 w-5 place-items-center rounded-full border border-[var(--color-surface)] bg-[var(--color-surface-2)] text-[0.55rem] font-bold text-[var(--color-text-dim)]">
          +{ids.length - 4}
        </span>
      )}
    </div>
  );
}

function EventCard({
  e,
  members,
}: {
  e: EventWithRefs;
  members: { id: string; name: string | null; email: string | null }[];
}) {
  return (
    <Link href={`/calendar/${e.id}`} className="card block p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium">{e.title}</span>
        <span className="shrink-0 text-xs font-semibold text-[var(--color-text-dim)]">
          {eventTimeRange(e.startAt, e.endAt)}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {e.venture && <VentureChip name={e.venture.name} color={e.venture.color} />}
        {e.location && (
          <span className="text-[0.72rem] text-[var(--color-text-dim)]">📍 {e.location}</span>
        )}
        <AttendeeDots ids={e.attendeeIds} members={members} />
      </div>
    </Link>
  );
}

export default async function CalendarPage() {
  const now = new Date();
  const from = startOfDay(now);
  const to = endOfDay(new Date(now.getTime() + 44 * 864e5)); // ~6 weeks out

  const { user, hub } = await requireHub();
  const [events, ventures, members] = await withHub(user.id, (tx) =>
    Promise.all([
      listEvents(tx, hub.id, user.id, { from, to }),
      listVentures(tx, hub.id),
      listMembers(tx, hub.id),
    ]),
  );

  // group by calendar day
  const days: { date: Date; items: EventWithRefs[] }[] = [];
  for (const e of events) {
    const last = days[days.length - 1];
    if (last && isSameDay(last.date, e.startAt)) last.items.push(e);
    else days.push({ date: e.startAt, items: [e] });
  }

  return (
    <div className="space-y-4 p-3">
      <h1 className="text-lg font-bold">Calendar</h1>

      <EventForm
        ventures={ventures.map((v) => ({ id: v.id, name: v.name }))}
        members={members}
      />

      {events.length === 0 && (
        <p className="card p-6 text-center text-sm text-[var(--color-text-dim)]">
          No events in the next six weeks. Add one above.
        </p>
      )}

      {days.map(({ date, items }) => (
        <section key={date.toISOString()}>
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
            {isSameDay(date, now) ? "Today" : format(date, "EEEE, MMM d")}
          </h2>
          <div className="space-y-2">
            {items.map((e) => (
              <EventCard key={e.id} e={e} members={members} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
