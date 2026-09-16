import Link from "next/link";
import { notFound } from "next/navigation";

import { getEvent, hubChrome } from "@/lib/data";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
import { toDateTimeInput } from "@/lib/format";
import { EventForm } from "../EventForm";
import { moveEventToSchedule } from "../actions";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user, hub } = await requireHub();
  const t = await getT();
  const { id } = await params;
  const [event, { ventures, members }] = await Promise.all([
    withHub(user.id, (tx) => getEvent(tx, hub.id, user.id, id)),
    hubChrome(user.id, hub.id),
  ]);
  if (!event) notFound();

  return (
    <div className="space-y-3 p-3">
      <Link href="/calendar" className="text-xs font-semibold text-[var(--color-text-dim)]">
        ← {t("Calendar")}
      </Link>
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

      {/* A repeating "Work" or "School" block is a schedule, not a plan — on
          /schedule it shows per person with free-together windows, and it
          stops crowding the calendar. Whole series moves at once. */}
      <form action={moveEventToSchedule} className="card space-y-2 p-4">
        <input type="hidden" name="id" value={event.id} />
        <div className="text-xs font-semibold">{t("Is this a work or school schedule?")}</div>
        <p className="text-[0.68rem] text-[var(--color-text-dim)]">
          {event.recurrenceGroupId
            ? t("Moves this and every repeat of it to Schedules, where it shows per person with your free time together.")
            : t("Moves it to Schedules, where it shows per person with your free time together.")}
        </p>
        <select name="personId" defaultValue={event.attendeeIds[0] ?? user.id} className="field" aria-label={t("Whose schedule")}>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name ?? m.email}
            </option>
          ))}
        </select>
        <button type="submit" className="btn w-full">
          🕐 {t("Move to Schedules")}
        </button>
      </form>
    </div>
  );
}
