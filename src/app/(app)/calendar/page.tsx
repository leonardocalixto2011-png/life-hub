import { endOfDay, startOfDay, isSameDay } from "date-fns";

import { listEvents, listMembers, listVentures, type EventWithRefs } from "@/lib/data";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { EventForm } from "./EventForm";
import { CalendarList } from "./CalendarList";

export const dynamic = "force-dynamic";

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

      <CalendarList days={days} members={members} now={now} />
    </div>
  );
}
