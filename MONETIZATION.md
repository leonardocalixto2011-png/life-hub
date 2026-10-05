# Monetization — the finance department

Status: **built, switched off.** Decided 2026-10-05 (strategy page:
https://claude.ai/artifact/V8njD2XtNnmZnddCK2PesS). Billing code is merged;
`BILLING_ENABLED` stays unset during the beta, so nobody is limited or charged.
Prices and fees checked October 2026 — re-check before acting, they move.

## 1. The model

| | Free | Plus | AI credits |
|---|---|---|---|
| Price (CAD) | 0 | **5,99 $/mo or 59 $/yr** + taxes | packs of 5 / 10 / 25 $ |
| Who pays | — | one person; covers the **3 oldest hubs they own**, for every member | each person, for their own assistant use |
| Hubs you own | 1 | 10 (3 covered) | — |
| Members per hub | 6 | 10 | — |
| AI quick-add | 30 / month | no monthly cap (hourly limit + token budget still apply) | — |
| Mailbox connectors + AI mail sorting | — | ✅ | — |
| Assistant | pay with credits | 2 $ of credit included each month | 2× Anthropic list cost |
| Trial | — | 14 days, **no card**, ends by itself, once per person | — |

Rules that drove it:
- **Charge for what costs money** (AI, mailbox reading), **never for the
  person's own data.** Tasks, calendar, budget, debts and trips stay free and
  unlimited; a lapsed plan pauses Plus features, it never locks records.
- **Per household, not per seat.** One subscriber covers their hubs; charging
  each member would triple the price of one shared space and kill invites.
- **No ads, no data sales.** The app holds debt default status; finance ad
  inventory is payday lending and credit repair. Pennies per user, a consent
  banner and a reputation risk. (Full argument in git history of this file.)
- **Later, not built:** travel affiliate links in Trips (clearly labelled, never
  near money pages); app-store distribution (15 % cut, 99 US$/yr).

## 2. Unit economics (estimate, correct from /admin/finance after a month)

Per Plus household per month, monthly plan: Stripe 0,52 $ (2,9 % + 0,30 $ +
0,7 % Billing), mail + quick-add AI on Haiku ≈ 1,00 $, briefings + hosting ≈
0,18 $, included assistant credit ≤ 2,00 $ → **≈ 2,30–4,30 $ left**. Fixed
costs at public launch ≈ 84 $/month (Vercel Pro, Resend Pro, Neon Launch,
domain) → **≈ 28 paying households to break even.** A free user costs ≈ 0,10 $.

## 3. Where it lives

- `src/lib/billing/plans.ts` — price list and limits (client-safe constants).
- `src/lib/billing/plan.ts` — **every limit asks here, on the server**:
  `hubHasPlus`, `userHasPlus`, `plusHubIds`, `consumeQuickAdd`,
  `ownHubLimitMessage`, `assertMemberRoom`. Wired into quick-add, the three
  mailbox connect actions, the mail poller, `/api/inbound`, hub creation,
  invites and join approvals.
- `src/lib/billing/stripe.ts` — fetch-only Stripe client + webhook signature check.
- `src/app/api/billing/webhook` — fails closed without `STRIPE_WEBHOOK_SECRET`;
  `lib/billing/webhook.ts` syncs `PlanAccount` and books `BillingEvent`
  (idempotent on the Stripe event id; refunds keyed per charge).
- `/billing` — plan, trial, checkout, **one-tap cancel (Bill 10)**, resume,
  Stripe portal, credit packs. `/admin/finance` (ADMIN only) — MRR, revenue,
  fees, Claude cost, break-even, "offer Plus" (COMP) for one person or every
  hub owner.
- `lib/billing/notices.ts` — Bill 10 email 2–4 days before a trial ends, from
  the daily digest cron.
- Terms: section `#forfait` in `src/content/legal/terms.ts`; Stripe added to
  the privacy policy's providers. **Lawyer still to review.**
- Account deletion cancels a live subscription immediately and unlinks the
  ledger; the data export includes the plan and payments.

### AI credits ↔ the assistant thread

The wallet (balance, metering) is built by the assistant work.
`src/lib/billing/credits-hook.ts` is the seam: replace `creditWallet()` with
the wallet's idempotent top-up and set `CREDITS_WIRED = true`; the packs then
appear on /billing. Purchases before that are impossible (the packs are
hidden) and would in any case stay in the `BillingEvent` ledger.

## 4. Turning it on (owner checklist)

1. Stripe account in the business name (NEQ), currency CAD.
2. Product "Life Hub Plus" with two recurring prices: 5,99 $ monthly, 59 $
   yearly → `STRIPE_PRICE_PLUS_MONTH`, `STRIPE_PRICE_PLUS_YEAR`.
3. Webhook endpoint `https://<domain>/api/billing/webhook` with the events
   listed in `.env.example` → `STRIPE_WEBHOOK_SECRET`; `STRIPE_SECRET_KEY`.
4. Customer portal: Settings → Billing → Customer portal → allow updating the
   card and viewing invoices (cancellation stays in-app). Turn on Stripe's
   emailed receipts.
5. Optional: a promotion code for founders (40 % off forever) — checkout
   accepts codes.
6. `/admin/finance` → "Offer Plus to every hub owner" until launch + 3 months.
7. Lawyer reads `#forfait`; then `BILLING_ENABLED=1`.
8. Register for GST/QST past 30 000 $ over four quarters → `STRIPE_AUTOMATIC_TAX=1`.

Remember the `create-app-role.sql` gotcha: re-running it grants `PlanAccount`
and `BillingEvent` to app_user; re-run the billing migration's REVOKE after.
