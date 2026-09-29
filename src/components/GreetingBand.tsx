import { Moon, Sun, Sunrise, Sunset, type LucideIcon } from "lucide-react";

import type { Daypart } from "@/lib/daypart";

/**
 * The greeting on /today, set on a soft band that follows the time of day in
 * Montréal: warm at dawn, near-neutral (the user's own theme) at midday, amber
 * at dusk, indigo at night. The palettes live in globals.css under
 * `.greeting-band[data-daypart]`, mixed into `--surface`, so they sit right in
 * all six themes and in dark mode.
 *
 * Static, except a single fade on arrival at the `--moment` rung (zeroed by
 * reduced motion / calm). No loop, no parallax: this is a screen people open
 * ten times a day, and something that moves every time stops being pleasant
 * by the third.
 *
 * The band is an opaque panel, so it reads the same over a background photo
 * as over the plain page — the photo keeps its own scrim; nothing stacks.
 */
const ICON: Record<Daypart, LucideIcon> = {
  dawn: Sunrise,
  day: Sun,
  dusk: Sunset,
  night: Moon,
};

export function GreetingBand({
  daypart,
  greeting,
  date,
}: {
  daypart: Daypart;
  greeting: string;
  date: string;
}) {
  const Icon = ICON[daypart];
  return (
    <div className="greeting-band" data-daypart={daypart}>
      <div className="min-w-0">
        {/* The greeting is the app addressing a person by name — the clearest
            case for the display serif, and the first thing seen each morning. */}
        <h1 className="display text-[1.75rem] leading-tight">{greeting}</h1>
        <p className="mt-0.5 text-sm text-[var(--color-text-dim)] first-letter:uppercase">{date}</p>
      </div>
      <Icon className="greeting-glyph" size={30} strokeWidth={1.6} aria-hidden />
    </div>
  );
}
