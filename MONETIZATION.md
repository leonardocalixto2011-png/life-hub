# Monetization analysis

Status: **analysis only — nothing implemented.** Queued behind the open
public-launch blockers (see CLAUDE.md Phase 11). Prices verified Sept 2026;
re-check before acting, they move.

---

## 1. What the market actually charges

| App | Monthly | Annual | Annual discount | Free tier |
|---|---|---|---|---|
| **Todoist Pro** | $7 | $60 | ~29% | 5 projects, no ads |
| **TickTick Premium** | $3.99 | $35.99 | ~25% | Limited lists/reminders, no ads |
| **Splitwise Pro** | $4.99 | ~$40–50 | ~17% | **4 expenses/day**, ad-supported |
| **Honeydue** | — | — | — | **Everything free, ad-supported**, optional $1–10 tip |
| **Zeta** | — | — | — | Everything free, no paid tier |

**The finding that matters: Life Hub straddles two categories with opposite
economics.**

- The *task-management* half (Todoist, TickTick) sustains **$36–60/yr**.
- The *couples-finance* half (Honeydue, Zeta) sustains **nothing**. Both are
  entirely free. Honeydue — the closest analogue to our budget/debt side — has
  no paid tier at all and runs on ads.

So the comparable that most resembles our debt tracker has already tried and
declined to charge. Pricing has to be justified by the task/organisation side,
with finance as the differentiator rather than the thing being sold.

Typical annual discount across the category: **20–30%**.

## 2. Recommended price

**$4.99/month or $39/year — per hub, not per seat** (≈35% annual discount).

Reasoning:
- Sits between TickTick ($36) and Splitwise ($40–50); above TickTick is
  defensible because this does more, but Todoist's $60 is a business-tool
  price this doesn't earn.
- **Per hub, not per user.** This is a household product. Charging three
  family members separately triples the sticker price for one shared
  workspace and is the single fastest way to kill conversion. Splitwise and
  Honeydue are per-account precisely because their users are couples.
- The annual discount is set slightly above category norm because annual
  prepay is what makes the AI cost per user predictable.

**Free trial: 14 days, no card up front.** The app's value only becomes
visible once a hub has real data in it — a card-required trial gates people
before they've reached that point.

## 3. ⚠️ Recommendation against ads

The brief asks for ads on the free tier. I'd push back, on three grounds.

**a) The ad inventory is toxic in this specific app.** Life Hub knows a user's
creditor names, balances, APR, and whether they are *in default*. Personal-finance
ad inventory is dominated by debt consolidation, credit repair and payday
lending. Serving those to someone whose own app records show three cards in
default is a genuinely harmful outcome, and in some jurisdictions a regulated
one (UK FCA financial-promotion rules; US UDAAP exposure). Honeydue can run ads
because Honeydue does not track debt default status. We do.

**b) It makes the legal blocker strictly worse.** Ads set identifiers and
require consent under GDPR/ePrivacy *before* serving. We currently have no
privacy policy, no consent mechanism, and no DPAs. Ads add a consent-management
platform and a sub-processor to a compliance position that is already the
thing blocking launch.

**c) The economics probably don't clear.** A private admin app gets maybe
5–15 pageviews per user per day. At $1–4 RPM that's roughly **$0.15–1.50 per
user per month gross** — plausibly *less* than what that user costs in
Anthropic API calls for quick-add parsing, mail classification and the
assistant. Ads could be net-negative per free user while carrying all the risk
in (a) and (b).

**Better lever: usage limits.** This is where the category has already moved —
Splitwise replaced generosity with a 4-expense/day cap. Limits convert better
than ads, cost nothing to serve, and don't poison a financial product.

**If ads ship anyway**, the minimum safe shape: contextual/non-personalised
only, never on `/debts`, `/budget` or `/inbox`, a real consent gate first, and
an advertiser category blocklist for lending and credit repair.

## 4. Free vs paid — gate the thing that costs money

The AI features have a real marginal cost per call. Gating them aligns price
with cost, so heavy users fund themselves.

| | Free | Paid |
|---|---|---|
| Tasks, deadlines, events, calendar | ✅ unlimited | ✅ |
| Budget + subscriptions | ✅ | ✅ |
| **Debt tracker** | ✅ 3 debts | ✅ unlimited |
| **Debt sharing** (per-hub, summary/full) | ❌ | ✅ |
| **Hub members** | 2 | 10 |
| **Hubs per account** | 1 | unlimited |
| **AI quick-add / assistant** | 20 parses/month | 500/month |
| **Connected mailboxes** | ❌ | ✅ |
| Digests + push | ✅ | ✅ |
| Themes, background | ✅ | ✅ |
| Support | community | priority |

Deliberately *not* gated: anything already entered. Locking someone out of
their own debt records to extract a payment is the kind of thing that earns a
category-wide reputation, and this data is sensitive enough that it would be
remembered.

"Remove ads" alone is **not** a sufficient value proposition here — with no
ads in the free tier there is nothing to remove, and even with ads the
category (Honeydue) shows people simply tolerate them. The mailbox connectors
and debt sharing are the real conversion drivers.

## 5. Implementation plan (not started)

**Billing: Stripe.** Stripe Checkout + Customer Portal covers upgrade,
downgrade, cancel and card update without building any of those screens.

Needed:
1. `Subscription` model keyed to **`hubId`** (not user), with
   `stripeCustomerId`, `stripeSubscriptionId`, `status`, `currentPeriodEnd`.
2. Webhook endpoint (`/api/stripe/webhook`) handling
   `checkout.session.completed`, `customer.subscription.updated|deleted`, and
   `invoice.payment_failed`. **Must verify the Stripe signature** — the
   `/api/inbound` hole we just closed is the same class of bug.
3. A single server-side `hubPlan(hubId)` helper. Every limit checks it there,
   never in a client component — a paywall enforced in the UI is not a paywall.
4. Grace period on payment failure (Stripe dunning, ~2 weeks) before
   downgrading, so a expired card doesn't instantly strip features.
5. Downgrade behaviour: data is never deleted, only new writes past a limit
   are blocked, and shared trackers revert to private.

**Tax.** Digital subscriptions are taxable in most jurisdictions and the rules
are per-country — EU VAT MOSS, UK VAT, Canadian GST/HST/QST (relevant: the
owner is in Quebec), US state sales tax with economic nexus. **Use Stripe Tax**
rather than hand-rolling this; the alternative is registering in each
jurisdiction manually. Also required: invoices, and a refund/cancellation
policy in the terms.

**Hard prerequisite.** Taking money creates a contractual relationship and
makes the missing terms of service and privacy policy non-optional. Billing
cannot ship before the legal items in CLAUDE.md Phase 11.

## Sources

- [Splitwise pricing 2026](https://getfinny.app/blog/splitwise-pricing-2026)
- [Splitwise free limits](https://splittyapp.com/learn/splitwise-free-limits/)
- [Todoist pricing 2026](https://www.usecarly.com/blog/todoist-pricing/)
- [TickTick pricing 2026](https://lifestack.ai/blog/ticktick-pricing)
- [Honeydue review (CNBC Select)](https://www.cnbc.com/select/honeydue-budgeting-app-review/)
- [Best budgeting apps for couples 2026](https://www.bestmoney.com/financial-advisor/learn-more/budgeting-apps-for-couples)
