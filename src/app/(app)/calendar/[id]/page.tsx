import Link from "next/link";
import { notFound } from "next/navigation";

import { getEvent, listMembers, listVentures } from "@/lib/data";
import { requireUser } from "@/lib/session";
import { toDateTimeInput } from "@/lib/format";
import { EventForm } from "../EventForm";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const [event, ventures, members] = await Promise.all([
    getEvent(id),
    listVentures(),
    listMembers(),
  ]);
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
        }}
      />
    </div>
  );
}
