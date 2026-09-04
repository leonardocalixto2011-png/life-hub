# Deploying Life Hub

Stack: GitHub -> Vercel (build + host + cron) -> Neon Postgres -> Resend (email).
Same shape as `couca-app`. Do the steps in order.

Generated secret values for this deploy are in a local `prod.env` outside the
repo (the assistant put it on your Desktop area / scratch, not in git). Fill the
blanks in that file as you go, then paste the whole set into Vercel.

---

## 1. GitHub

Create an **empty** repo `life-hub` under your `leonardocalixto2011-png` account
(no README/license), then:

```bash
cd C:\Users\leona\life-hub
git remote add origin https://github.com/leonardocalixto2011-png/life-hub.git
git push -u origin main
```

If the push authenticates as the wrong GitHub user: clear the
`git:https://github.com` entry in Windows Credential Manager and push again,
signing in as `leonardocalixto2011-png`.

Then **make the repo public** (Settings -> General -> Danger Zone -> Change
visibility). Vercel Hobby only auto-deploys public repos or commits authored by
the connected account; public is the reliable path. Safe to do: `.env*` is
gitignored, only `.env.example` is tracked.

## 2. Neon

Create a project (`life-hub-prod`), region near your Vercel region (e.g. AWS
`us-east-1`). From the dashboard connection panel:

- **Pooled** string (host contains `-pooler`) -> `DATABASE_URL`, and append
  `?sslmode=require&pgbouncer=true&connection_limit=1`
- **Direct** string (no `-pooler`) -> `DIRECT_URL`, append `?sslmode=require`

Migrations apply automatically on every Vercel build (`vercel-build` runs
`prisma migrate deploy`). You only seed manually, once (step 5).

## 3. Resend

- Add domain `hub.cmacservices.ca`, region us-east-1. Verify the DNS records
  (Cloudflare auto-configure if `cmacservices.ca` is on Cloudflare).
- Create an API key `life-hub-prod` (Sending access) -> `AUTH_RESEND_KEY`.
- `EMAIL_FROM="Life Hub <hub@hub.cmacservices.ca>"`

## 4. Vercel

Import the GitHub repo. Framework = Next.js (auto). Build command auto-detects
`vercel-build`. Under **Settings -> Environment Variables**, add all of these for
**Production** (values from `prod.env`):

| Var | Notes |
|---|---|
| `DATABASE_URL` | Neon pooled + `?sslmode=require&pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | Neon direct + `?sslmode=require` |
| `AUTH_SECRET` | generated (in `prod.env`) |
| `AUTH_RESEND_KEY` | Resend key |
| `EMAIL_FROM` | `Life Hub <hub@hub.cmacservices.ca>` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | from `prod.env` (same pair as dev) |
| `VAPID_PRIVATE_KEY` | from `prod.env` |
| `VAPID_SUBJECT` | `mailto:leonardocalixto1998@yahoo.com` |
| `CRON_SECRET` | generated (in `prod.env`) — Vercel auto-sends it to the cron route |
| `NEXT_PUBLIC_APP_URL` | `https://<project>.vercel.app` (update when a custom domain is added) |
| `ADMIN_EMAIL` | `leonardocalixto1998@yahoo.com` |
| `ADMIN_NAME` | `Leonardo` |
| `ANTHROPIC_API_KEY` | optional — enables `/assistant` |
| `ANTHROPIC_MODEL` | optional — `claude-haiku-4-5` to cut assistant cost |

Deploy. The build runs `prisma generate && prisma migrate deploy && next build`.

## 5. Seed production (run from your own terminal — once)

PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
cd C:\Users\leona\life-hub
# load prod.env into this shell session:
Get-Content $HOME\Desktop\life-hub.prod.env | Where-Object { $_ -match '=' -and $_ -notmatch '^\s*#' } | ForEach-Object {
  $k,$v = $_ -split '=',2; [Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim().Trim('"'), 'Process')
}
npx tsx prisma/seed.ts
```

Expect: `5 ventures` + `admin user leonardocalixto1998@yahoo.com`.

## 6. Verify

- `https://<project>.vercel.app/api/health` -> `{"ok":true,"db":"up"}`
- `/login` with `leonardocalixto1998@yahoo.com` -> magic-link email arrives (Resend
  live) -> click -> lands on `/today`
- Add the other people: extend the `people` array in `prisma/seed.ts` and re-run
  step 5, or add `User` rows directly.

## 7. Cron

`vercel.json` already schedules `GET /api/cron/digest` daily at 12:00 UTC. Vercel
picks it up on deploy and sends `Authorization: Bearer $CRON_SECRET`
automatically. Check **Vercel -> Deployments -> Cron Jobs** after the first
deploy. Manual test: `curl -H "Authorization: Bearer <CRON_SECRET>" https://<project>.vercel.app/api/cron/digest`.

## 8. iOS push — real-device test (the one thing code can't prove)

On an iPhone (iOS 16.4+):
1. Open the Vercel URL in **Safari**, sign in.
2. Share -> **Add to Home Screen**, open from the icon.
3. `/notifications` -> **Enable on this device** -> **Send test** -> confirm a
   banner appears.
4. Trigger the digest (step 7 manual test) and confirm the summary push lands.

If it silently fails: check `/notifications` shows **On** (not Blocked/N/A), that
the app is running installed (not in Safari), and that iOS notification settings
allow it. Push does not work from Safari itself — only the installed PWA.

## Custom domain (optional, later)

Add it in Vercel, point DNS, then set `NEXT_PUBLIC_APP_URL` to the new URL and
redeploy. `trustHost: true` is set so auth callbacks follow the host
automatically.

## Note: manual "Redeploy" vs. git push

Vercel Hobby's dashboard **Redeploy** button can be blocked ("commit author
doesn't have permission... Hobby teams do not support collaboration") even
when the git-integration auto-deploy on `git push` works fine — they're
different permission checks. If Redeploy is blocked (e.g. after adding an env
var, which needs a fresh deployment to take effect), push a small commit
instead of fighting the button.
