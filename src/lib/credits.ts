import { prisma } from "@/lib/prisma";
import { logWarn } from "@/lib/observability";

/**
 * Claude credits: every AI call is paid from the signed-in person's own
 * prepaid balance.
 *
 * Before this, the app's whole Anthropic bill landed on whoever ran the
 * deployment, capped only by the token budgets in ai-budget.ts. Those stay —
 * they are runaway protection on the operator's account — but what a person
 * can spend is now what they put in.
 *
 * Money model:
 *
 *   The wallet is in CAD, stored in millicents (1 cent = 1000) so a quick-add
 *   that costs a tenth of a cent is recorded as what it cost rather than
 *   rounded to nothing or to a whole cent.
 *
 *   A call's price is computed from the tokens Anthropic reports
 *   (`usage`), at the model's list price in USD, converted with AI_USD_TO_CAD
 *   (the raw cost), then multiplied by AI_CREDIT_MARKUP (default 2 — the
 *   pricing decision in MONETIZATION.md) for what the person is billed. The
 *   ledger keeps the token counts, the raw cost and the billed amount side by
 *   side, so anyone can check the arithmetic and the margin.
 *
 *   Check before, charge after — same as ai-budget.ts, and for the same
 *   reason: the cost is unknown until the response comes back. One call can
 *   take a balance slightly below zero; the next one is refused.
 *
 *   Credits never expire. Québec's Consumer Protection Act forbids an expiry
 *   date on prepaid value, and nobody likes it anyway.
 *
 * Unlike ai-budget.ts this does NOT fail open: a database error refuses the
 * call. This is the person's money, and "we couldn't check" must not turn
 * into "it's free".
 */

/** Per million tokens, USD — Anthropic list prices. Prefix-matched, longest first. */
const PRICES: { prefix: string; input: number; output: number }[] = [
  { prefix: "claude-fable-5", input: 10, output: 50 },
  { prefix: "claude-mythos", input: 10, output: 50 },
  { prefix: "claude-opus-5-5", input: 4, output: 20 },
  { prefix: "claude-opus", input: 5, output: 25 },
  { prefix: "claude-sonnet-5", input: 2, output: 10 },
  { prefix: "claude-sonnet-4", input: 3, output: 15 },
  { prefix: "claude-haiku", input: 1, output: 5 },
];

/** Unknown model: price it like Opus, so a new id can only overcharge slightly, never give calls away. */
const FALLBACK_PRICE = { input: 5, output: 25 };

function priceOf(model: string) {
  // Bedrock/Vertex ids carry a prefix ("us.anthropic.claude-…"); match the core.
  const core = model.slice(Math.max(0, model.indexOf("claude-")));
  return PRICES.find((p) => core.startsWith(p.prefix)) ?? FALLBACK_PRICE;
}

function envNumber(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** USD → CAD. Update from the bank rate now and then; a rough figure is fine at these amounts. */
export const usdToCad = () => envNumber("AI_USD_TO_CAD", 1.4);
/** Billed = raw cost × this. Default 2. Shown on /credits so it's never hidden. */
export const creditMarkup = () => envNumber("AI_CREDIT_MARKUP", 2);
/** Given once, the first time someone's wallet is opened. 0 turns it off. */
const welcomeCents = () => {
  const n = Number(process.env.AI_WELCOME_CREDIT_CENTS);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 200;
};

/** Off only when AI_CREDITS=off: then calls are metered on the ledger but never refused for balance. */
export function creditsEnforced(): boolean {
  return process.env.AI_CREDITS !== "off";
}

export type TokenUsage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

/** What a call cost us at list price, in CAD millicents, before markup. Cache writes are 1.25× input, reads 0.1×. */
export function rawCostMillicents(model: string, u: TokenUsage): number {
  const p = priceOf(model);
  const usd =
    ((u.input_tokens ?? 0) * p.input +
      (u.cache_creation_input_tokens ?? 0) * p.input * 1.25 +
      (u.cache_read_input_tokens ?? 0) * p.input * 0.1 +
      (u.output_tokens ?? 0) * p.output) /
    1_000_000;
  // USD → CAD cents → millicents.
  return Math.ceil(usd * usdToCad() * 100 * 1000);
}

/** What the person is billed for a call: raw cost × markup. */
export function costMillicents(model: string, u: TokenUsage): number {
  return Math.ceil(rawCostMillicents(model, u) * creditMarkup());
}

/** "4,32 $" from millicents, for messages built server-side. */
export function millicentsToCents(m: number): number {
  return m >= 0 ? Math.floor(m / 1000) : -Math.ceil(-m / 1000);
}

/**
 * The person's wallet, created on first sight with the starter credit. The
 * grant and the wallet go in one transaction so a double-tap can't grant twice
 * (the second insert hits the primary key and is ignored).
 */
export async function getWallet(userId: string) {
  const existing = await prisma.creditWallet.findUnique({ where: { userId } });
  if (existing) return existing;
  const grant = welcomeCents() * 1000;
  try {
    return await prisma.$transaction(async (tx) => {
      const w = await tx.creditWallet.create({
        data: {
          userId,
          balanceMillicents: grant,
          welcomeGrantedAt: grant > 0 ? new Date() : null,
        },
      });
      if (grant > 0) {
        await tx.creditEntry.create({
          data: { userId, kind: "GRANT", amountMillicents: grant, note: "welcome" },
        });
      }
      return w;
    });
  } catch {
    // Lost a race with a concurrent first call: the other one created it.
    return prisma.creditWallet.findUniqueOrThrow({ where: { userId } });
  }
}

function monthStart(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Spent so far this calendar month, millicents (positive number). */
export async function spentThisMonth(userId: string): Promise<number> {
  const agg = await prisma.creditEntry.aggregate({
    where: { userId, kind: "USAGE", createdAt: { gte: monthStart() } },
    _sum: { amountMillicents: true },
  });
  return -(agg._sum.amountMillicents ?? 0);
}

/**
 * Null when this person may make an AI call now; otherwise the reason, as an
 * English sentence that doubles as the i18n key.
 */
export async function creditBlock(userId: string): Promise<string | null> {
  if (!creditsEnforced()) return null;
  try {
    const w = await getWallet(userId);
    if (w.balanceMillicents <= 0) return CREDIT_EMPTY_MESSAGE;
    if (w.monthlyLimitCents != null) {
      if ((await spentThisMonth(userId)) >= w.monthlyLimitCents * 1000) return CREDIT_LIMIT_MESSAGE;
    }
    return null;
  } catch {
    return "Your Claude credit couldn't be checked. Try again in a moment.";
  }
}

export const CREDIT_EMPTY_MESSAGE =
  "You're out of Claude credit. Top up under Claude credit (avatar menu) to keep using the assistant — everything else works as normal.";
export const CREDIT_LIMIT_MESSAGE =
  "You've reached the monthly Claude spending limit you set. Raise it under Claude credit, or wait for next month.";

/** Below this, a one-time push says the balance is running low. 50¢. */
const LOW_BALANCE_MILLICENTS = 50_000;

/**
 * Records one call and takes it off the balance. Never throws — losing one
 * call's accounting must not turn a finished answer into an error — but logs
 * loudly if it fails, since that is money not collected.
 *
 * `model` is the model that actually served the call (response.model), so a
 * server-side fallback is priced at the fallback's rate.
 */
export async function chargeAi(
  userId: string,
  model: string,
  usage: TokenUsage | null | undefined,
  feature: string,
  hubId?: string | null,
): Promise<number> {
  if (!usage) return 0;
  const raw = rawCostMillicents(model, usage);
  const amount = Math.ceil(raw * creditMarkup());
  if (amount <= 0) return 0;
  try {
    await getWallet(userId);
    const [, w] = await prisma.$transaction([
      prisma.creditEntry.create({
        data: {
          userId,
          kind: "USAGE",
          amountMillicents: -amount,
          rawCostMillicents: raw,
          feature,
          model,
          inputTokens: usage.input_tokens ?? 0,
          outputTokens: usage.output_tokens ?? 0,
          cacheReadTokens: usage.cache_read_input_tokens ?? 0,
          cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
          hubId: hubId ?? null,
        },
      }),
      prisma.creditWallet.update({
        where: { userId },
        data: { balanceMillicents: { decrement: amount } },
      }),
    ]);
    if (
      creditsEnforced() &&
      w.balanceMillicents < LOW_BALANCE_MILLICENTS &&
      w.balanceMillicents + amount >= LOW_BALANCE_MILLICENTS
    ) {
      await notifyLowBalance(userId).catch(() => {});
    }
  } catch (err) {
    logWarn("credits.charge_failed", { userId, feature, amount, error: String(err) });
  }
  return amount;
}

async function notifyLowBalance(userId: string) {
  const [{ sendPushToUser }, { translate, langOf }] = await Promise.all([
    import("@/lib/push"),
    import("@/lib/i18n"),
  ]);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { locale: true } });
  const lang = langOf(user?.locale);
  await prisma.creditWallet.update({ where: { userId }, data: { lowBalanceNotifiedAt: new Date() } });
  await sendPushToUser(userId, {
    title: translate(lang, "Claude credit running low"),
    body: translate(lang, "Less than 50¢ left. Top up to keep using the assistant."),
    url: "/credits",
    tag: "credits-low",
  });
}

/**
 * Adds money to a wallet — THE top-up hook. Billing (Stripe Checkout webhook,
 * a Plus plan's monthly allowance, an admin gift) calls this and nothing else.
 * `externalRef` (e.g. a Stripe Checkout session id) makes it idempotent: the
 * same payment reported twice credits once. Returns false when it was already
 * applied.
 */
export async function addCredit(input: {
  userId: string;
  cents: number;
  kind: "GRANT" | "TOPUP" | "ADJUST" | "REFUND";
  note?: string | null;
  externalRef?: string | null;
  createdById?: string | null;
}): Promise<boolean> {
  const amount = Math.round(input.cents) * 1000;
  if (!Number.isFinite(amount) || amount === 0) return false;
  await getWallet(input.userId);
  try {
    await prisma.$transaction([
      prisma.creditEntry.create({
        data: {
          userId: input.userId,
          kind: input.kind,
          amountMillicents: amount,
          note: input.note ?? null,
          externalRef: input.externalRef ?? null,
          createdById: input.createdById ?? null,
        },
      }),
      prisma.creditWallet.update({
        where: { userId: input.userId },
        data: {
          balanceMillicents: { increment: amount },
          // A top-up re-arms the low-balance push.
          ...(amount > 0 ? { lowBalanceNotifiedAt: null } : {}),
        },
      }),
    ]);
    return true;
  } catch (err) {
    // P2002 on externalRef: already credited.
    if ((err as { code?: string }).code === "P2002") return false;
    throw err;
  }
}

/** Usage this month grouped by feature, for /credits. */
export async function usageByFeature(userId: string) {
  const rows = await prisma.creditEntry.groupBy({
    by: ["feature"],
    where: { userId, kind: "USAGE", createdAt: { gte: monthStart() } },
    _sum: { amountMillicents: true },
    _count: { _all: true },
  });
  return rows
    .map((r) => ({
      feature: r.feature ?? "other",
      millicents: -(r._sum.amountMillicents ?? 0),
      calls: r._count._all,
    }))
    .sort((a, b) => b.millicents - a.millicents);
}

export function recentEntries(userId: string, take = 30) {
  return prisma.creditEntry.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      kind: true,
      amountMillicents: true,
      feature: true,
      model: true,
      inputTokens: true,
      outputTokens: true,
      note: true,
      createdAt: true,
    },
  });
}

/** Top-up amounts offered, in cents. */
export const TOPUP_CHOICES = [500, 1000, 2000, 5000] as const;
