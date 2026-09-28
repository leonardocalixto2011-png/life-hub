import "./viz.css";

import { startOfDay } from "date-fns";

import { fmtTime, translate, type Lang } from "@/lib/i18n";
import type { Person } from "./people";

const FROM_H = 6;
const TO_H = 24;
const SPAN_MS = (TO_H - FROM_H) * 3600e3;
const TICKS = [6, 9, 12, 15, 18, 21, 24];

type Block = { id: string; startAt: Date; endAt: Date; personId: string | null; title: string };
type Window = { start: Date; end: Date };

function hourLabel(h: number, lang: Lang): string {
  if (lang === "fr") return `${h % 24} h`;
  const hh = h % 24;
  if (hh === 0) return "12a";
  if (hh === 12) return "12p";
  return hh < 12 ? `${hh}a` : `${hh - 12}p`;
}

/**
 * One day as a 6:00–24:00 strip: a lane per person with their work blocks in
 * their colour, and a last lane for the windows everyone is free together.
 * The list under it stays the place to edit; this is for seeing the day.
 */
export function DayTimeline({
  day,
  people,
  shifts,
  free,
  lang,
  now,
}: {
  day: Date;
  people: Person[];
  shifts: Block[];
  free: Window[];
  lang: Lang;
  now: Date;
}) {
  const t = (k: string, v?: Record<string, string | number>) => translate(lang, k, v);
  const open = startOfDay(day).getTime() + FROM_H * 3600e3;
  const pos = (d: Date) => Math.max(0, Math.min(1, (d.getTime() - open) / SPAN_MS));
  const span = (a: Date, b: Date) => {
    const left = pos(a);
    const right = pos(b);
    return right > left ? { left: `${left * 100}%`, width: `${(right - left) * 100}%` } : null;
  };
  const nowPos = now.getTime() >= open && now.getTime() <= open + SPAN_MS ? pos(now) : null;
  const range = (a: Date, b: Date) => `${fmtTime(a, lang)}–${fmtTime(b, lang)}`;

  const lanes = [
    ...people.map((p) => ({
      key: p.id,
      label: p.name,
      marks: shifts
        .filter((s) => s.personId === p.id)
        .map((s) => ({ id: s.id, from: s.startAt, to: s.endAt, color: p.color, tip: `${p.name} · ${s.title} · ${range(s.startAt, s.endAt)}` })),
    })),
    ...(people.length > 1
      ? [
          {
            key: "free",
            label: t("Together"),
            marks: free.map((w, i) => ({
              id: `free-${i}`,
              from: w.start,
              to: w.end,
              color: "var(--viz-free)",
              tip: `${t("Free together")} · ${range(w.start, w.end)}`,
            })),
          },
        ]
      : []),
  ];

  return (
    <figure className="viz card mb-2 px-3 pb-2 pt-2.5" aria-label={t("Day at a glance")}>
      <div className="space-y-1.5">
        {lanes.map((lane) => (
          <div key={lane.key} className="flex items-center gap-2">
            <span className="w-16 shrink-0 truncate text-[0.66rem] font-semibold text-[var(--color-text-dim)]">
              {lane.label}
            </span>
            <div className="relative h-3.5 flex-1 rounded-full bg-[var(--viz-track)]">
              {lane.marks.map((m) => {
                const s = span(m.from, m.to);
                if (!s) return null;
                return (
                  <span
                    key={m.id}
                    tabIndex={0}
                    role="img"
                    aria-label={m.tip}
                    data-tip={m.tip}
                    className="viz-hit top-0 h-full rounded-full"
                    style={{ ...s, background: m.color, boxShadow: "0 0 0 1px var(--color-surface)" }}
                  />
                );
              })}
              {nowPos != null && (
                <span
                  aria-hidden
                  className="absolute -top-0.5 h-[calc(100%+4px)] w-0.5 rounded-full bg-[var(--color-text)]"
                  style={{ left: `${nowPos * 100}%` }}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      {/* Hour axis, aligned to the tracks (the 4.5rem is the lane label). */}
      <div className="relative ml-[4.5rem] mt-1 h-3 border-t border-[var(--viz-grid)]" aria-hidden>
        {TICKS.map((h) => (
          <span
            key={h}
            className="absolute top-0.5 -translate-x-1/2 text-[0.56rem] tabular-nums text-[var(--viz-muted)]"
            style={{ left: `${((h - FROM_H) / (TO_H - FROM_H)) * 100}%` }}
          >
            {hourLabel(h, lang)}
          </span>
        ))}
      </div>
    </figure>
  );
}
