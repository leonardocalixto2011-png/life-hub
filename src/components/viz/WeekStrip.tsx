import "./viz.css";

import Link from "next/link";
import { addDays, format, isSameDay, startOfDay } from "date-fns";

import { hubChrome, listEvents } from "@/lib/data";
import { listShifts, planItemsBetween } from "@/lib/plans";
import { withHub } from "@/lib/hub-context";
import { fmt, translate, type Lang } from "@/lib/i18n";
import { peopleOf } from "./people";

const FROM_H = 6;
const TO_H = 24;

/**
 * The next seven days in one row: who works when (a mini 6:00–24:00 column per
 * person, in their colour), and a count of what's planned. Fetches its own
 * data so /today only has to place it.
 *
 * Every query mirrors the RLS privacy clause in app code, per the project
 * rule — a private item never shows up in someone else's count.
 */
export async function WeekStrip({
  userId,
  hub,
  lang,
}: {
  userId: string;
  hub: { id: string; showOccasions: boolean };
  lang: Lang;
}) {
  const t = (k: string, v?: Record<string, string | number>) => translate(lang, k, v);
  const now = new Date();
  const from = startOfDay(now);
  const to = addDays(from, 7);
  const privacy = { OR: [{ visibility: "SHARED" as const }, { createdById: userId }] };

  const [[shifts, events, tasks, deadlines, plans], { members }] = await Promise.all([
    withHub(userId, (tx) =>
      Promise.all([
        listShifts(tx, hub.id, userId, from, to),
        listEvents(tx, hub.id, userId, { from, to }),
        tx.task.findMany({
          where: { hubId: hub.id, status: "OPEN", dueDate: { gte: from, lt: to }, ...privacy },
          select: { dueDate: true },
        }),
        tx.deadline.findMany({
          where: { hubId: hub.id, doneAt: null, dueDate: { gte: from, lt: to }, ...privacy },
          select: { dueDate: true },
        }),
        planItemsBetween(tx, hub, userId, from, addDays(to, -1), lang),
      ]),
    ),
    hubChrome(userId, hub.id),
  ]);

  const people = peopleOf(members);
  const shown = people.filter((p) => shifts.some((s) => s.personId === p.id)).slice(0, 3);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const on = (d: Date | null, day: Date) => Boolean(d && isSameDay(d, day));

  return (
    <figure className="viz card p-2.5" aria-label={t("Your week at a glance")}>
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const dayOpen = startOfDay(day).getTime() + FROM_H * 3600e3;
          const pos = (d: Date) =>
            Math.max(0, Math.min(1, (d.getTime() - dayOpen) / ((TO_H - FROM_H) * 3600e3)));
          const nEvents = events.filter((e) => on(e.startAt, day)).length;
          const nDue = tasks.filter((x) => on(x.dueDate, day)).length + deadlines.filter((x) => on(x.dueDate, day)).length;
          const plan = plans.find((p) => on(p.date, day));
          const today = isSameDay(day, now);
          const label = [
            fmt(day, lang === "fr" ? "EEEE d MMMM" : "EEEE, MMMM d", lang),
            nEvents ? t("{n} events", { n: nEvents }) : null,
            nDue ? t("{n} due", { n: nDue }) : null,
            plan ? plan.title : null,
          ]
            .filter(Boolean)
            .join(" · ");

          return (
            <Link
              key={day.toISOString()}
              href={`/schedule?w=${format(day, "yyyy-MM-dd")}`}
              aria-label={label}
              className="flex flex-col items-center gap-1 rounded-lg py-1 transition-colors active:bg-[var(--color-surface-2)]"
            >
              <span className="text-[0.58rem] font-semibold uppercase text-[var(--viz-muted)]">
                {fmt(day, "EEEEE", lang)}
              </span>
              <span
                className="grid h-6 w-6 place-items-center rounded-full text-xs font-bold"
                style={
                  today
                    ? { background: "var(--color-primary)", color: "var(--color-primary-fg)" }
                    : undefined
                }
              >
                {day.getDate()}
              </span>

              {/* Mini day: one thin column per person, morning at the top.
                  Only when someone has a schedule this week — empty grey
                  columns would say nothing. */}
              {shown.length > 0 && (
                <span className="relative flex h-12 w-full justify-center gap-[3px]" aria-hidden>
                  {shown.map((p) => (
                    <span key={p.id} className="relative h-full w-1.5 rounded-full bg-[var(--viz-track)]">
                      {shifts
                        .filter((s) => s.personId === p.id && s.startAt < addDays(day, 1) && s.endAt > day)
                        .map((s) => {
                          const top = pos(s.startAt);
                          const bottom = pos(s.endAt);
                          return bottom > top ? (
                            <span
                              key={s.id}
                              className="absolute inset-x-0 rounded-full"
                              style={{ top: `${top * 100}%`, height: `${(bottom - top) * 100}%`, background: p.color }}
                            />
                          ) : null;
                        })}
                    </span>
                  ))}
                </span>
              )}

              <span className="flex h-3.5 items-center gap-0.5 text-[0.6rem] leading-none text-[var(--color-text-dim)]" aria-hidden>
                {plan ? <span>{plan.emoji}</span> : null}
                {nEvents > 0 && <span className="tabular-nums">📅{nEvents}</span>}
                {nDue > 0 && <span className="tabular-nums">⏳{nDue}</span>}
              </span>
            </Link>
          );
        })}
      </div>

      {shown.length > 0 && (
        <figcaption className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-[var(--color-border)] pt-1.5 text-[0.62rem] text-[var(--color-text-dim)]">
          {shown.map((p) => (
            <span key={p.id} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
              {p.name}
            </span>
          ))}
          <span>🕐 {t("work, 6am – midnight")}</span>
        </figcaption>
      )}
    </figure>
  );
}
