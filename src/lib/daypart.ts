/**
 * Time of day, as a Montréal kitchen would name it — computed on the server in
 * America/Toronto so the greeting band on /today matches the clock on the
 * wall, not the UTC clock Vercel runs on.
 *
 * `process.env.TZ` is already pinned by src/instrumentation.ts, but this asks
 * Intl for the zone explicitly: a band that turns indigo at 8 p.m. UTC (4 p.m.
 * here) is exactly the kind of bug that never shows on a dev box in Toronto.
 */
export type Daypart = "dawn" | "day" | "dusk" | "night";

export const DAYPARTS: Daypart[] = ["dawn", "day", "dusk", "night"];

const HOUR = new Intl.DateTimeFormat("en-CA", {
  hour: "numeric",
  hourCycle: "h23",
  timeZone: "America/Toronto",
});

export function torontoHour(d: Date): number {
  return Number(HOUR.format(d)) % 24;
}

/** dawn 5–10, day 10–17, dusk 17–21, night 21–5. */
export function daypartOf(d: Date): Daypart {
  const h = torontoHour(d);
  if (h >= 5 && h < 10) return "dawn";
  if (h >= 10 && h < 17) return "day";
  if (h >= 17 && h < 21) return "dusk";
  return "night";
}

export function isDaypart(v: unknown): v is Daypart {
  return typeof v === "string" && (DAYPARTS as string[]).includes(v);
}
