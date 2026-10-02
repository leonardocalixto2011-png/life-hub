import { getEvent, hubChrome } from "@/lib/data";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { getLang, getT } from "@/lib/i18n-server";
import { fmtDay } from "@/lib/i18n";
import { eventTimeRange, toDateTimeInput } from "@/lib/format";
import { SheetTitle } from "@/components/EditSheet";
import { EventForm } from "@/app/(app)/calendar/EventForm";

export const dynamic = "force-dynamic";

/**
 * /calendar/<id> in the edit sheet. Same data and form as the full page,
 * minus "Move to Schedules": that one leaves the calendar altogether, so it
 * stays on the full page rather than under a sheet meant for a quick edit.
 */
export default async function EventSheet({ params }: { params: Promise<{ id: string }> }) {
  const { user, hub } = await requireHub();
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const { id } = await params;
  const [event, { ventures, members }] = await Promise.all([
    withHub(user.id, (tx) => getEvent(tx, hub.id, user.id, id)),
    hubChrome(user.id, hub.id),
  ]);
  if (!event) return <SheetTitle title={t("Not found.")} />;

  return (
    <>
      <SheetTitle
        title={event.title}
        sub={
          <span className="first-letter:uppercase">
            {fmtDay(event.startAt, lang)} · {eventTimeRange(event.startAt, event.endAt, lang)}
          </span>
        }
      />
      <EventForm
        ventures={ventures.map((v) => ({ id: v.id, name: v.name }))}
        members={members}
        existing={{
          id: event.id,
          title: event.title,
          notes: event.notes,
          location: event.location,
          startAt: toDateTimeInput(event.startAt),
          endAt: toDateTimeInput(event.endAt),
          ventureId: event.ventureId,
          attendeeIds: event.attendeeIds,
          visibility: event.visibility,
          recurrenceGroupId: event.recurrenceGroupId,
        }}
      />
    </>
  );
}
