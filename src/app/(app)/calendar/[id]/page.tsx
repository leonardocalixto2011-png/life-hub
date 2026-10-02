import { Clock } from "lucide-react";
import { notFound } from "next/navigation";

import { getEvent, hubChrome } from "@/lib/data";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { getLang, getT } from "@/lib/i18n-server";
import { fmtDay } from "@/lib/i18n";
import { eventTimeRange, toDateTimeInput } from "@/lib/format";
import { EventForm } from "../EventForm";
import { moveEventToSchedule } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader } from "@/components/SectionHeader";
import { FormSection } from "@/components/Form";
import { personName } from "@/lib/people";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user, hub } = await requireHub();
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const { id } = await params;
  const [event, { ventures, members }] = await Promise.all([
    withHub(user.id, (tx) => getEvent(tx, hub.id, user.id, id)),
    hubChrome(user.id, hub.id),
  ]);
  if (!event) notFound();

  return (
    <div className="page">
      <PageHeader
        back={{ href: "/calendar", label: t("Calendar") }}
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
        beforeDanger={
          /* A repeating "Work" or "School" block is a schedule, not a plan — on
             /schedule it shows per person with free-together windows, and it
             stops crowding the calendar. Whole series moves at once. */
          <form action={moveEventToSchedule}>
            <input type="hidden" name="id" value={event.id} />
            <FormSection title={t("Is this a work or school schedule?")}>
              <p className="field-hint mt-0">
                {event.recurrenceGroupId
                  ? t("Moves this and every repeat of it to Schedules, where it shows per person with your free time together.")
                  : t("Moves it to Schedules, where it shows per person with your free time together.")}
              </p>
              <label className="field-label">
                {t("Whose schedule")}
                <select name="personId" defaultValue={event.attendeeIds[0] ?? user.id} className="field">
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {personName(m, t("Member"))}
                    </option>
                  ))}
                </select>
              </label>
              <SubmitButton className="btn btn-secondary w-full">
                <Clock size={17} strokeWidth={2} aria-hidden /> {t("Move to Schedules")}
              </SubmitButton>
            </FormSection>
          </form>
        }
      />
    </div>
  );
}
