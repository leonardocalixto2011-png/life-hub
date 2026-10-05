import { NextResponse } from "next/server";

import { verifyWebhook } from "@/lib/billing/stripe";
import { handleStripeEvent } from "@/lib/billing/webhook";
import { reportError } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe → Life Hub. Fails closed: with no STRIPE_WEBHOOK_SECRET nothing is
 * accepted (the /api/inbound lesson — an unset secret must never mean "skip
 * the check"). The body is read as raw text because the signature covers the
 * exact bytes; JSON is parsed only after it verifies.
 *
 * A handler error returns 500 so Stripe retries; every handler is idempotent.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  let event: Parameters<typeof handleStripeEvent>[0];
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (!event?.id || !event?.type || !event?.data?.object) {
    return NextResponse.json({ error: "bad event" }, { status: 400 });
  }

  try {
    await handleStripeEvent(event);
  } catch (err) {
    await reportError("billing.webhook_failed", err, { type: event.type, id: event.id });
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
