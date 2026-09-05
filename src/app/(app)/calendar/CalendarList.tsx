"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, isSameDay } from "date-fns";

import { eventTimeRange, initials } from "@/lib/format";
import { VentureChip } from "@/components/VentureChip";
import type { EventWithRefs } from "@/lib/data";
import { deleteEvents } from "./actions";

type Member = { id: string; name: string | null; email: string | null };

function AttendeeDots({ ids, members }: { ids: string[]; members: Member[] }) {
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

function EventBody({ e, members }: { e: EventWithRefs; members: Member[] }) {
  return (
    <>
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
    </>
  );
}

export function CalendarList({
  days,
  members,
  now,
}: {
  days: { date: Date; items: EventWithRefs[] }[];
  members: Member[];
  now: Date;
}) {
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelect() {
    setSelecting(false);
    setSelected(new Set());
  }

  function removeSelected() {
    if (selected.size === 0) return;
    startTransition(async () => {
      await deleteEvents([...selected]);
      exitSelect();
      router.refresh();
    });
  }

  if (days.length === 0) return null;

  return (
    <>
      <div className="flex justify-end">
        {selecting ? (
          <button
            onClick={exitSelect}
            className="text-xs font-semibold text-[var(--color-text-dim)]"
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={() => setSelecting(true)}
            className="text-xs font-semibold text-[var(--color-primary)]"
          >
            Select
          </button>
        )}
      </div>

      {days.map(({ date, items }) => (
        <section key={date.toISOString()}>
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
            {isSameDay(date, now) ? "Today" : format(date, "EEEE, MMM d")}
          </h2>
          <div className="space-y-2">
            {items.map((e) =>
              selecting ? (
                <button
                  key={e.id}
                  onClick={() => toggle(e.id)}
                  className="card flex w-full items-start gap-3 p-3 text-left"
                  style={
                    selected.has(e.id)
                      ? { borderColor: "var(--color-primary)", background: "var(--color-surface-2)" }
                      : undefined
                  }
                >
                  <input
                    type="checkbox"
                    checked={selected.has(e.id)}
                    readOnly
                    className="mt-0.5 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <EventBody e={e} members={members} />
                  </div>
                </button>
              ) : (
                <Link key={e.id} href={`/calendar/${e.id}`} className="card block p-3">
                  <EventBody e={e} members={members} />
                </Link>
              ),
            )}
          </div>
        </section>
      ))}

      {selecting && selected.size > 0 && (
        <div className="sticky bottom-16 z-10">
          <button
            onClick={removeSelected}
            disabled={pending}
            className="btn w-full bg-[var(--color-danger)] text-white"
          >
            {pending ? "Deleting…" : `Delete ${selected.size} selected`}
          </button>
        </div>
      )}
    </>
  );
}
