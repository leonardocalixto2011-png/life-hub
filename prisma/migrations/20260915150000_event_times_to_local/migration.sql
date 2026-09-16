-- Event times were stored as "wall clock read as UTC".
--
-- The server ran in UTC, so a datetime-local "08:00" typed in Montréal was
-- parsed as 08:00Z. Every server render formatted it back in UTC (08:00, looked
-- right) while the browser formatted the same instant in America/Toronto
-- (04:00, wrong) — the calendar list showed school at 4 a.m.
--
-- src/instrumentation.ts now pins the server to America/Toronto, so new input
-- is parsed as a real local time. This rewrites existing rows to the instant
-- the person actually meant: interpret the stored naive value as Toronto wall
-- clock, convert to UTC. DST-aware (EDT −4 / EST −5) because Postgres resolves
-- the offset per row.
--
-- Only Event carries a time of day typed by a person. Date-only fields
-- (Task/Deadline/Debt due dates, trips, budget dates) are stored at local
-- noon and land on the same calendar day in either zone, so they are untouched.
--
-- ⚠ Run once, against data written by the UTC server. A local dev database
-- whose server already ran in Toronto time must mark this applied instead
-- (`prisma migrate resolve --applied 20260915150000_event_times_to_local`).

UPDATE "Event"
SET "startAt" = ("startAt" AT TIME ZONE 'America/Toronto') AT TIME ZONE 'UTC',
    "endAt"   = ("endAt"   AT TIME ZONE 'America/Toronto') AT TIME ZONE 'UTC';
