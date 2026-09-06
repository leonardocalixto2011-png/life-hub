# Data inventory

**Purpose.** A factual record of what personal data Life Hub processes, where
it goes, and who can see it. This is *not* a privacy policy and is not legal
advice — it exists so a lawyer (or a policy generator) can be given accurate
facts instead of guesses. Nothing here should be published verbatim.

Last reviewed: 2026-09-06. Re-check whenever a new model or third party is added.

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
| Rate-limit counters | `RateLimit.key` | Contains a **hashless email address** for magic-link keys — see §5 |

**Sensitivity note.** Debt balances and default status, plus parsed email
content, are the highest-risk data here. Under GDPR they are not "special
category" in the Art. 9 sense, but financial-distress data attracts
heightened expectations and a breach would be materially harmful.

## 2. Who can see what

- **Own data only**: debts (unless shared), private tasks/deadlines/events,
  mailbox credentials, notification prefs.
- **Everyone in a hub**: shared tasks, deadlines, events, budget entries,
  subscriptions, and any debt tracker explicitly shared at FULL.
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
| Consent withdrawal | ⚠️ Partial — notifications can be turned off; no cookie/analytics consent exists because there is no analytics |
| Breach notification (Art. 33) | ❌ No process, no monitoring, no contact route |

## 5. Known gaps — must be resolved before a public launch

1. **No privacy policy, terms of service, or cookie notice exist.**
2. **No lawful basis documented** for processing, and no data-processing
   agreements with any sub-processor above.
3. **No retention policy.** Nothing is ever purged: `ReviewItem` rows keep
   parsed email content indefinitely.
4. **`RateLimit.key` stores raw email addresses** for magic-link windows. Low
   sensitivity and short-lived (swept daily), but it is personal data in a
   table nobody would think to look in. Hash the address if a strict
   minimisation stance is wanted.
5. **Data residency is unverified.** Neon and Vercel regions have not been
   checked against where users actually are.
6. **No breach-response plan** and no security contact address.
7. **Anthropic receives email bodies.** This must be disclosed explicitly —
   users will not assume their mail is sent to a third party for parsing.
8. **Age gating**: none. If under-16s could sign up, GDPR Art. 8 applies.
