/**
 * Pins the server's clock to the household's timezone before any request.
 *
 * Vercel functions run in UTC. Every date in this app is built with local-date
 * constructors and date-fns (`startOfDay`, `new Date("2026-09-15T08:00")`), so
 * on a UTC server "8 a.m." was stored as 08:00Z and "today" rolled over at
 * 8 p.m. in Montréal — while the browser, in America/Toronto, showed the same
 * event at 4 a.m. Local dev never showed it because the dev machine is already
 * in Toronto time.
 *
 * Node re-reads `process.env.TZ` on assignment, and `register` runs once per
 * server instance before it serves anything. The Edge runtime (proxy.ts) never
 * formats or parses dates, so only Node is pinned. Existing events were
 * converted by migration 20260915150000_event_times_to_local.
 *
 * One zone for the whole app is right for a single household; per-user zones
 * (NotificationPreference.timezone already exists) would need date-fns-tz at
 * every format and parse site.
 */
const APP_TIME_ZONE = "America/Toronto";

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    process.env.TZ = process.env.APP_TIME_ZONE || APP_TIME_ZONE;
  }
}
