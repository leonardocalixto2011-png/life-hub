# Life Hub

Mobile-first PWA for a small trusted group to run life + business admin — tasks,
deadlines, subscriptions, budget, events — with iPhone push notifications and an
email digest fallback. Invite-only.

Stack: Next 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Prisma 6 +
Postgres · Auth.js v5 (magic-link) · Web Push · Resend · Vercel.

## Local development

Prereqs: Node 20+ (this repo built on 24), npm 11.

```bash
# 1. install
npm install

# 2. start a local Postgres (daemonises; prints a connection URL)
npx prisma dev -n lifehub -d

# 3. put that URL in .env
#    DATABASE_URL="<url>?sslmode=disable&pgbouncer=true&connection_limit=1"
#    DIRECT_URL="<url>?sslmode=disable"
cp .env.example .env   # then edit — see below for the minimum set

# 4. schema + seed data (5 ventures + one admin user from ADMIN_EMAIL)
npm run db:migrate
npm run db:seed

# 5. run
npm run dev            # http://localhost:3000
```

### Minimum `.env` for local dev

| var | value |
| --- | --- |
| `DATABASE_URL` / `DIRECT_URL` | from `npx prisma dev` (see step 3) |
| `AUTH_SECRET` | any long random string (`npx auth secret`) |
| `ADMIN_EMAIL` | the address you'll sign in with |
| `ADMIN_NAME` | your name |

Leave `AUTH_RESEND_KEY` **unset** — magic-link URLs print to the dev-server
console instead of emailing, so you can sign in with zero email setup.

### Signing in locally

1. Go to `/login`, enter `ADMIN_EMAIL`, submit.
2. Copy the `🔑 [auth:dev] magic link …` URL from the terminal running `npm run dev`.
3. Open it — you land on `/today`.

Adding more people: put their emails in `prisma/seed.ts` (`people` array) and
re-run `npm run db:seed`, or add a `User` row directly. No public signup.

### Windows notes

- **Stop `npm run dev` before `npm run build`** — the dev server locks Prisma's
  query-engine DLL and the build fails with `EPERM`.
- If `npx` fails in PowerShell:
  `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force`.

## Scripts

| command | does |
| --- | --- |
| `npm run dev` | dev server |
| `npm run build` | `prisma generate` + production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | apply migrations (dev) |
| `npm run db:seed` | ventures + admin user |
| `npm run db:studio` | Prisma Studio |
| `npm run gen:vapid` | generate Web Push VAPID keys (Phase 2) |
| `node scripts/gen-icons.mjs` | regenerate placeholder PWA icons |

## Deployment (Vercel + Neon)

Not deployed yet — planned after Phase 2. Outline:

1. **Neon**: create a project. Copy the pooled string to `DATABASE_URL`
   (append `?pgbouncer=true&connection_limit=1`) and the direct string to
   `DIRECT_URL`.
2. **Vercel**: import this repo. Set every var from `.env.example` with real
   values (`AUTH_SECRET`, `AUTH_RESEND_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_APP_URL`,
   the `VAPID_*` pair, `CRON_SECRET`, `ADMIN_*`). Deploy — `vercel-build` runs
   `prisma migrate deploy && next build`.
3. **Seed prod once**: `npx tsx prisma/seed.ts` with the prod env loaded.
4. **Resend**: verify the sending subdomain (e.g. `hub.cmacservices.ca`), set
   `AUTH_RESEND_KEY` + `EMAIL_FROM`.
5. **Cron** (Phase 2): `vercel.json` schedules `GET /api/cron/digest` daily; it
   authenticates with `CRON_SECRET`.

## Project layout

```
prisma/schema.prisma        data model (Phase 2–4 models stubbed)
prisma/seed.ts              ventures + admin user
src/auth.config.ts          edge-safe Auth.js config (used by proxy.ts)
src/auth.ts                 full Auth.js: Prisma adapter + magic-link + invite gate
src/proxy.ts                route gate (Next 16 "middleware")
src/lib/{prisma,session,data,format,email}.ts
src/app/login/             magic-link request screen
src/app/(app)/             authed shell: layout + Today + Tasks
src/components/            QuickAdd, BottomNav, TaskRow, ...
scripts/gen-vapid.mjs      VAPID keys (Phase 2)
scripts/gen-icons.mjs      placeholder PWA icons
```

See `CLAUDE.md` for full build state and the phase plan.
