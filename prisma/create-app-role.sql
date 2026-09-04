-- Creates the low-privilege Postgres role the RUNNING APP connects as, so that
-- the RLS policies in 20260904130000_multihub_rls actually apply (Postgres
-- RLS is a no-op for a table's owner, and the owner role — neondb_owner here —
-- is what every migration/seed/backfill script runs as).
--
-- Run this ONCE per database (local dev DB, and separately against prod Neon)
-- as the owner role. Replace the password before running against prod — pick
-- your own, don't reuse the example below.
--
--   Local:  npx prisma db execute --file prisma/create-app-role.sql --schema prisma/schema.prisma
--   Prod:   run the same file from a terminal with prod DATABASE_URL loaded
--           (same pattern as every other prod-DB step in this project — this
--           one is not run by the assistant, same as migrations/seed).

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user WITH LOGIN PASSWORD 'CHANGE_ME_BEFORE_RUNNING';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- So future `prisma migrate deploy` runs (as the owner role) keep app_user's
-- grants current without re-running this file by hand every time.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_user;
