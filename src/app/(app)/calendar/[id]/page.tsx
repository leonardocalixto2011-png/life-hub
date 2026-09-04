import Link from "next/link";
import { notFound } from "next/navigation";

import { getEvent, listMembers, listVentures } from "@/lib/data";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { toDateTimeInput } from "@/lib/format";
import { EventForm } from "../EventForm";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user, hub } = await requireHub();
  const { id } = await params;
  const [event, ventures, members] = await withHub(user.id, (tx) =>
    Promise.all([getEvent(tx, hub.id, user.id, id), listVentures(tx, hub.id), listMembers(tx, hub.id)]),
  );
  if (!event) notFound();

  return (
    <div className="space-y-3 p-3">
      <Link href="/calendar" className="text-xs font-semibold text-[var(--color-text-dim)]">
        ← Calendar
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
        }}
      />
    </div>
  );
}
