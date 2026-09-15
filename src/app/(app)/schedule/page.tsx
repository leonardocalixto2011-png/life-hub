import Link from "next/link";
import { addDays, format, isSameDay, isValid, parse as parseDate } from "date-fns";

import { hubChrome } from "@/lib/data";
import { freeWindows, listShifts, mondayOf, type ShiftRow } from "@/lib/plans";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { Avatar } from "@/components/Avatar";
import { ShiftForm } from "./ShiftForm";
import { deleteShift, deleteShiftSeries } from "./actions";

export const dynamic = "force-dynamic";

const hm = (d: Date) => format(d, "H:mm");

function weekFromParam(w?: string): Date {
  if (w) {
    const d = parseDate(w, "yyyy-MM-dd", new Date());
    if (isValid(d)) return mondayOf(d);
  }
  return mondayOf(new Date());
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const sp = await searchParams;
  const monday = weekFromParam(sp.w);
  const nextMonday = addDays(monday, 7);
  const now = new Date();

  const { user, hub } = await requireHub();
  const [shifts, { members }] = await Promise.all([
    withHub(user.id, (tx) => listShifts(tx, hub.id, user.id, monday, nextMonday)),
    hubChrome(user.id, hub.id),
  ]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const overlaps = (s: ShiftRow, day: Date) =>
    s.startAt < addDays(day, 1) && s.endAt > day;

  const weekHref = (d: Date) => `/schedule?w=${format(d, "yyyy-MM-dd")}`;

  return (
    <div className="space-y-4 p-3">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-bold">Schedules</h1>
        <Link href="/calendar" className="text-[0.7rem] font-semibold text-[var(--color-primary)]">
          Calendar →
        </Link>
      </div>
      <p className="-mt-3 text-[0.68rem] text-[var(--color-text-dim)]">
        Everyone&apos;s work schedule side by side, and when you&apos;re free at the same time.
      </p>

      <div className="flex items-center justify-between">
        <Link href={weekHref(addDays(monday, -7))} className="btn btn-ghost px-2">
          ‹
        </Link>
        <span className="text-sm font-semibold">
          {format(monday, "MMM d")} – {format(addDays(monday, 6), "MMM d")}
        </span>
        <Link href={weekHref(nextMonday)} className="btn btn-ghost px-2">
          ›
        </Link>
      </div>

      <ShiftForm
        members={members}
        currentUserId={user.id}
        defaultFrom={format(monday, "yyyy-MM-dd")}
      />

      {days.map((day) => {
        const dayShifts = shifts.filter((s) => overlaps(s, day));
        const free = members.length > 1 ? freeWindows(day, dayShifts) : [];
        return (
          <section key={day.toISOString()}>
            <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
              {isSameDay(day, now) ? "Today" : format(day, "EEEE, MMM d")}
            </h2>
            <div className="card divide-y divide-[var(--color-border)]">
              {members.map((m) => {
                const mine = dayShifts.filter((s) => s.personId === m.id);
                return (
                  <div key={m.id} className="flex items-start gap-2.5 px-3 py-2">
                    <Avatar name={m.name} email={m.email} size={22} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold">{m.name ?? m.email}</div>
                      {mine.length === 0 ? (
                        <div className="text-[0.72rem] text-[var(--color-ok)]">Free</div>
                      ) : (
                        mine.map((s) => (
                          <div key={s.id} className="flex items-center justify-between gap-2 text-[0.72rem]">
                            <span>
                              <span className="font-semibold tabular-nums">
                                {hm(s.startAt)}–{hm(s.endAt)}
                              </span>{" "}
                              <span className="text-[var(--color-text-dim)]">{s.title}</span>
                            </span>
                            <span className="flex shrink-0 gap-2">
                              <form action={deleteShift}>
                                <input type="hidden" name="id" value={s.id} />
                                <button className="text-[0.62rem] font-semibold text-[var(--color-text-dim)] underline">
                                  remove
                                </button>
                              </form>
                              {s.recurrenceGroupId && (
                                <form action={deleteShiftSeries}>
                                  <input type="hidden" name="id" value={s.id} />
                                  <input type="hidden" name="groupId" value={s.recurrenceGroupId} />
                                  <button className="text-[0.62rem] font-semibold text-[var(--color-text-dim)] underline">
                                    + later
                                  </button>
                                </form>
                              )}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
              {members.length > 1 && (
                <div className="px-3 py-2 text-[0.72rem]">
                  {free.length > 0 ? (
                    <span>
                      <span className="font-semibold text-[var(--color-ok)]">Free together: </span>
                      {free.map((w) => `${hm(w.start)}–${hm(w.end)}`).join(" · ")}
                    </span>
                  ) : (
                    <span className="text-[var(--color-text-dim)]">No free time together</span>
                  )}
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
