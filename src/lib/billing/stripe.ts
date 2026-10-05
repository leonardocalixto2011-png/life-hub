import { createHmac, timingSafeEqual } from "node:crypto";

import { logWarn } from "@/lib/observability";

/**
 * A thin Stripe client: plain `fetch` against the REST API, no SDK — the same
 * style as the mail connectors (lib/mail/google.ts). Stripe's API is
 * form-encoded with bracketed keys, which `encode` produces from a plain
 * object, and the webhook signature is one HMAC, checked in `verifyWebhook`.
 */

const API = "https://api.stripe.com/v1";

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

type Params = Record<string, unknown>;

/** { a: { b: 1 }, c: [x, y] } → a[b]=1&c[0]=x&c[1]=y — Stripe's encoding. */
export function encode(params: Params, prefix = "", out = new URLSearchParams()): URLSearchParams {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (v !== null && typeof v === "object") encode(v as Params, `${name}[${i}]`, out);
        else out.append(`${name}[${i}]`, String(v));
      });
    } else if (typeof value === "object") {
      encode(value as Params, name, out);
    } else {
      out.append(name, String(value));
    }
  }
  return out;
}

/**
 * What a person sees when Stripe refuses or is unreachable: a plain Error, so
 * `formResult` shows it inline (its text is the i18n key). Stripe's own
 * message can name internals (ids, parameters), so it goes to the logs only.
 */
const STRIPE_FAILED = "The payment service didn't answer as expected. Try again in a moment.";

export async function stripe<T = Record<string, unknown>>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  params?: Params,
  opts: { idempotencyKey?: string } = {},
): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Payments aren't set up yet. Try again later.");
  const body = params ? encode(params).toString() : undefined;
  const url = method === "GET" && body ? `${API}${path}?${body}` : `${API}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
    },
    body: method === "GET" ? undefined : body,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string } };
  if (!res.ok) {
    logWarn("billing.stripe_error", { path, status: res.status, code: json.error?.code ?? null, message: json.error?.message ?? null });
    throw new Error(STRIPE_FAILED);
  }
  return json as T;
}

/**
 * Checks a `Stripe-Signature` header: `t=<unix>,v1=<hex>[,v1=<hex>…]`, where
 * v1 = HMAC-SHA256(secret, `${t}.${rawBody}`). The body must be the raw text,
 * byte for byte — parse JSON only after this passes. `t` must be recent, so a
 * captured request can't be replayed later.
 */
export function verifyWebhook(
  rawBody: string,
  header: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): boolean {
  if (!header || !secret) return false;
  let t = 0;
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2);
    if (k === "t") t = Number(v);
    else if (k === "v1" && v) sigs.push(v);
  }
  if (!Number.isFinite(t) || t <= 0 || sigs.length === 0) return false;
  if (Math.abs(nowSeconds - t) > toleranceSeconds) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex"));
  return sigs.some((s) => {
    const got = Buffer.from(s);
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}
