# Data inventory

**Purpose.** A factual record of what personal data Life Hub processes, where
it goes, and who can see it. This is *not* a privacy policy and is not legal
advice — it exists so a lawyer (or a policy generator) can be given accurate
facts instead of guesses. Nothing here should be published verbatim.

Last reviewed: 2026-10-01 (Québec Law 25 pass). Re-check whenever a new model or third party is added.

---

## 1. Personal data held

| Data | Model / field | Why it exists |
|---|---|---|
| Email address | `User.email` | Identity; magic-link sign-in; digests |
| Display name | `User.name` | Shown to other members of shared hubs |
| Profile background image | `User.backgroundImageUrl` | Cosmetic; stored in Vercel Blob (**public URL**) |
| Theme choice | `User.themeId` | Cosmetic |
| Tasks, deadlines, events | `Task`, `Deadline`, `Event` | Core function. Free-text; may contain anything the user types |
| Financial records | `BudgetEntry`, `Subscription` | Income, expenses, recurring costs |
| **Debt records** | `Debt` | Creditor names, balances, APR, payment amounts, **default status** |
| Debt sharing grants | `DebtShare` | Which hubs a person exposes their tracker to |
| **Email content** | `ReviewItem.sourceSnippet`, `.draft`, `.fromAddress` | Parsed inbound mail — subjects, snippets, sender addresses, amounts |
| Mailbox credentials | `MailAccount.accessTokenEnc`, `.refreshTokenEnc`, `.appPasswordEnc` | AES-256-GCM encrypted at rest (`MAIL_TOKEN_ENCRYPTION_KEY`) |
| Push endpoints | `PushSubscription` | Browser push delivery |
| Notification prefs + timezone | `NotificationPreference` | Digest scheduling |
| Sign-in tokens | `Session`, `Account`, `VerificationToken` | Auth.js |
| Rate-limit counters | `RateLimit.key` | Opaque counters. Magic-link keys hold a keyed hash (HMAC-SHA-256, `AUTH_SECRET`) of the address / IP, never the value itself — see §5 |
| Consent ledger | `Consent` | What each person expressly agreed to (debts, debt sharing per hub, AI mail analysis per hub, age 14+/18+), when, when withdrawn, and under which policy version |
| Email visibility choice | `HubMembership.showEmail` | Per hub; off by default |
| Profile | `User.username`, `User.avatarUrl` | Chosen handle (visible to people who can invite you) and optional profile photo (Blob) |
| App invitations | `AppInvite.email`, `.claimedEmail` | The address an inviter typed or the invitee entered; token stored only as a SHA-256 hash. Server-only table (no app-role grant) |
| Who invited whom | `User.invitedById`, `HubMembership.invitedById` | Shown on invite cards; set to null if the inviter deletes their account |
| Join requests | `HubMembership` (status `REQUESTED`), `.requestNote` | Optional ≤140-char note to the hub's owners; email addresses refused in it |
| Pending address change | `EmailChange.newEmail` | Token hashed; valid 1 hour. Server-only table |
| Optional password | `UserPassword.hash` | scrypt hash with per-user salt; the password itself is never stored. Server-only table (no app-role grant); not included in the data export |
| AI-notice flag | `User.aiNoticeAt` | When the one-time "who processes AI input" notice was dismissed |

**Sensitivity note.** Debt balances and default status, plus parsed email
content, are the highest-risk data here. Under GDPR they are not "special
category" in the Art. 9 sense, but financial-distress data attracts
heightened expectations and a breach would be materially harmful.

## 2. Who can see what

- **Own data only**: debts (unless shared), private tasks/deadlines/events,
  mailbox credentials, notification prefs.
- **Everyone in a hub**: shared tasks, deadlines, events, budget entries,
  subscriptions, and any debt tracker explicitly shared at FULL.
- **Member email addresses are hidden by default.** Other members see a
  person's **name** only. An address is shown to the person themself, to the
  members of a hub where that person turned on "show my email"
  (`HubMembership.showEmail`), and to a hub's owner for a *pending invite*
  they sent. Stripped on the server (`listHubRoster` in `src/lib/data.ts`),
  so it is absent from the page payload, not merely not rendered. Assignment
  notifications and invites name the sender, never their address.
- **Consent rows**: the person alone (RLS `consent_self_only`).
- **Aggregate only**: debt trackers shared at SUMMARY — totals, never rows
  (enforced at the DB layer, not just the UI; see `src/lib/debt-sharing.ts`).
- **Enforcement**: Postgres row-level security under a low-privilege role,
  mirrored in application queries. `/api/health` reports whether RLS is
  actually active (`rls: "enforced"`).

## 3. Sub-processors (third parties receiving personal data)

| Party | Receives | Notes |
|---|---|---|
| **Vercel** | Everything (hosting), request logs | US-based; check region config for EU data residency |
| **Neon** | The entire database | Region is chosen per project — **verify where it actually is** |
| **Resend** | Email addresses, digest content (which includes task titles and debt payment amounts) | Transactional email |
| **Anthropic** | Free-text quick-add input and **inbound email bodies** sent for parsing | Content leaves the system for classification |
| **Google / Yahoo / Microsoft** | OAuth or IMAP access to the user's mailbox | Read-only |
| **Vercel Blob** | Uploaded background images, on **public URLs** | Unguessable, but not access-controlled |

Each of these needs listing in a privacy policy, and a DPA in place, before EU users.

## 4. Rights implemented

| Right | Status |
|---|---|
| Access / portability (Art. 15, 20) | ✅ `/account` → Download JSON, or `GET /api/account/export` |
| Erasure (Art. 17) | ✅ `/account` → delete. Destroys personal rows; content in *shared* hubs survives with authorship anonymised to a tombstone user, since it is also other members' data |
| Rectification (Art. 16) | ✅ Everything is editable in-app |
| Consent withdrawal | ✅ Debts: bottom of `/debts`. Debt sharing: set the hub back to Private. AI mail analysis: "Turn off" on `/mail`. Each stamps `Consent.revokedAt`. Notifications can be turned off. No cookie/analytics consent exists because there is no analytics |
| Breach notification | ⚠️ Procedure and register template in `docs/INCIDENT-REGISTER.md`; the real register must be kept privately. Monitoring/contact route still to be wired (`ALERT_WEBHOOK_URL`, privacy officer env vars) |

### Consents collected (Québec Law 25)

All are express, given by ticking a box that starts **unchecked**, recorded in
`Consent` with the policy version, and re-checked on the server.

| Consent | Asked where | Blocks until given |
|---|---|---|
| `AGE_14` | `/welcome` ("Before we start") | Finishing or skipping the welcome, i.e. entering the app. Users onboarded before 2026-10-01 were grandfathered by the migration |
| `DEBTS_SENSITIVE` + `AGE_18` | Consent card on `/debts` | Creating a debt (`createDebt`); the person's own debts are not rendered. Existing debt owners are asked on their next visit |
| `DEBT_SHARE` (per hub) | Share control on `/debts` | Creating a share or raising it SUMMARY → FULL; a fresh row each time. Going back to Private revokes it |
| `MAIL_AI` + `AGE_18` (per hub) | `/mail` | Connecting a mailbox, revealing the forwarding address, and **any** AI analysis of mail. Off by default; mailboxes connected earlier are not analysed until their owner agrees |

A first-use notice (not a consent) names Anthropic (United States) and says
dictation is done by the browser/phone vendor: `User.aiNoticeAt`.

## 5. Known gaps — must be resolved before a public launch

1. **No privacy policy, terms of service, or cookie notice exist.**
2. **No lawful basis documented** for processing, and no data-processing
   agreements with any sub-processor above.
3. ~~**No retention policy.**~~ ✅ **Retention schedule** (enforced by the
   daily digest cron, `src/lib/retention.ts` + `pruneRateLimits`):

   | Data | Kept for | Then |
   |---|---|---|
   | Review-inbox items (`ReviewItem`: parsed email subject, snippet, sender, amounts) — accepted or discarded | 90 days from arrival | Deleted |
   | Review-inbox items still pending | 90 days from arrival | Marked `DISCARDED`, then deleted in the same sweep |
   | Mail classified as advertising / informational, or skipped by the prefilter | Not stored | — |
   | Rate-limit counters (`RateLimit`) | Until the window ends (≤ 1 hour; AI token budget: 30 days) | Deleted at the next daily sweep |
   | Sign-in tokens (`VerificationToken`) | 24 hours (link validity) | Consumed on use by Auth.js; expired unused tokens deleted by the daily sweep (`pruneExpiredSignInTokens`) |
   | Sessions | 7 days (JWT cookie, refreshed daily) | Expire |
   | Reminder ledger (`ReminderSent`) | Life of the account | Deleted with the account |
   | Consent ledger (`Consent`) | Life of the account, revoked rows included | Deleted with the account |
   | App invitations (`AppInvite`) | 14 days usable | Deleted 30 days after used, cancelled or expired (`pruneAccountLeftovers`) |
   | Pending address changes (`EmailChange`) | 1 hour | Deleted at the next daily sweep |
   | Password hash (`UserPassword`) | Until the person removes it or deletes their account | Deleted (cascade with the account) |
   | Unanswered hub invites and join requests | 60 days | Deleted |
   | Accounts created by the old hub-invite flow and never used (never signed in or onboarded, nothing authored) | 30 days | Deleted |
   | Everything else (tasks, budget, debts, …) | Until the person deletes it or their account | Deleted / anonymised per §4 |

   Still open: an inactivity rule for
   dormant accounts; backups (Neon point-in-time restore) outlive the above by
   the provider's window.
4. ~~**`RateLimit.key` stores raw email addresses**~~ ✅ Magic-link keys now
   hold `hashedKey(email)` / `hashedKey(ip)` — HMAC-SHA-256 keyed with
   `AUTH_SECRET` (`src/lib/rate-limit.ts`). Keyed rather than a bare hash
   because addresses are guessable. Applies going forward; any raw-address key
   written before the change expires within the hour and is swept by the next
   daily run. Rotating `AUTH_SECRET` only resets the in-flight counters.
5. **Data residency is unverified.** Neon and Vercel regions have not been
   checked against where users actually are.
6. ~~**No breach-response plan**~~ ⚠️ Procedure + register template:
   `docs/INCIDENT-REGISTER.md`. Still needed: the privacy officer's title and
   contact in the environment (`PRIVACY_OFFICER_TITLE`, `PRIVACY_OFFICER_EMAIL`,
   `LEGAL_ENTITY_NAME`, `LEGAL_ADDRESS`), shown on `/confidentialite`.
7. ~~**Anthropic receives email bodies.**~~ ✅ Disclosed and consent-gated: AI
   mail analysis is **off by default** and needs a separate express consent
   naming Anthropic (United States) — see "Consents collected". A first-use
   notice covers quick-add sentences, photos and dictation.
8. ~~**Age gating**: none.~~ ✅ Self-attestation: 14+ to use the app, 18+ for
   debts and mail analysis. Attestation only — no age verification.
9. **Legal text is a draft.** `/confidentialite` and `/conditions` render
   placeholder sections under a "Version préliminaire" banner until the final
   text is pasted into `src/content/legal/*.ts` and `LEGAL_PUBLISHED=1` is set.
   Bump `POLICY_VERSION` (`src/content/legal/version.ts`) when it changes.
10. **Vercel Blob store is public.** Uploaded photos sit on unguessable but
    unauthenticated URLs. Moving to a private store needs a new store created
    in Vercel by the owner — not done.
11. **No privacy impact assessment (EFVP)** for the transfers outside Québec
    (Vercel, Neon, Resend, Anthropic), and no DPAs — see item 2.
12. **Existing debt shares predate `DEBT_SHARE` consent.** They keep working
    and have no ledger row until the owner changes them.
