import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { parseText, type Draft } from "@/lib/parse";
import { rateLimit } from "@/lib/rate-limit";
import { secretMatches } from "@/lib/bearer";
import { resolveHubFromRecipient } from "@/lib/inbound-address";
import { hubHasMailAiConsent } from "@/lib/consent";
import { overAiBudget } from "@/lib/ai-budget";
import { creditBlock } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Verify a Svix-style signature (Resend webhooks). Header `svix-signature` holds
 * space-separated `v1,<base64>` entries; the signed content is
 * `${id}.${timestamp}.${rawBody}` HMAC-SHA256 with the base64 secret after `whsec_`.
 */
function verifySvix(secret: string, headers: Headers, rawBody: string): boolean {
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sigHeader = headers.get("svix-signature");
  if (!id || !ts || !sigHeader) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key)
    .update(`${id}.${ts}.${rawBody}`)
    .digest("base64");
  const expBuf = Buffer.from(expected);

  return sigHeader.split(" ").some((part) => {
    const sig = part.split(",")[1];
    if (!sig) return false;
    const sigBuf = Buffer.from(sig);
    return sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);
  });
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type ResendPayload = {
  data?: {
    from?: string | { address?: string; name?: string };
    to?: string | { address?: string; name?: string };
    subject?: string;
    text?: string;
    html?: string;
    message_id?: string;
    email_id?: string;
  };
};

type CloudflarePayload = {
  data?: {
    from?: string;
    to?: string;
    subject?: string;
    text?: string;
    html?: string;
    messageId?: string;
  };
};

type Extracted = {
  from: string | null;
  to: string | null;
  subject: string;
  body: string;
  sourceRef: string | null;
};

/** Two inbound paths land here: Resend Inbound (Svix-signed) or a Cloudflare
 * Email Worker (shared-secret header, see workers/inbound-email). Whichever
 * ends up working, both feed the same review-inbox pipeline below. */
async function extract(req: Request, raw: string): Promise<Extracted | NextResponse> {
  const cfSecret = req.headers.get("x-inbound-secret");

  if (cfSecret) {
    const expected = process.env.INBOUND_SECRET;
    // "Not configured" and "wrong secret" are different problems and get
    // different statuses — collapsing both into 401 makes setup impossible to
    // debug without server logs. This discloses nothing sensitive: whether the
    // server has an env var set is not a secret, and the Resend branch below
    // already answers the same question the same way.
    if (!expected) {
      return NextResponse.json({ error: "inbound not configured" }, { status: 503 });
    }
    // Constant-time, like the Svix branch below and the cron endpoints.
    if (!secretMatches(cfSecret, expected)) {
      return NextResponse.json({ error: "bad secret" }, { status: 401 });
    }
    let payload: CloudflarePayload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "bad json" }, { status: 400 });
    }
    const d = payload.data ?? {};
    return {
      from: d.from ?? null,
      to: d.to ?? null,
      subject: d.subject ?? "",
      body: d.text?.trim() || (d.html ? stripHtml(d.html) : ""),
      sourceRef: d.messageId ?? null,
    };
  }

  const resendSecret = process.env.RESEND_WEBHOOK_SECRET;
  // Fail CLOSED. This used to be `if (resendSecret && !verifySvix(...))`, so an
  // unset secret skipped verification altogether and the endpoint accepted any
  // anonymous POST on the internet — which both injects rows into the review
  // inbox and spends a paid Anthropic call per request. No secret, no inbound.
  if (!resendSecret) {
    return NextResponse.json({ error: "inbound not configured" }, { status: 503 });
  }
  if (!verifySvix(resendSecret, req.headers, raw)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  let payload: ResendPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const d = payload.data ?? {};
  return {
    from: typeof d.from === "string" ? d.from : (d.from?.address ?? null),
    to: typeof d.to === "string" ? d.to : (d.to?.address ?? null),
    subject: d.subject ?? "",
    body: d.text?.trim() || (d.html ? stripHtml(d.html) : ""),
    sourceRef: d.message_id ?? d.email_id ?? null,
  };
}

/** Note on a review item stored without any AI call (see the consent check below). */
const NOT_ANALYSED = "Not analysed — AI analysis is off for this hub. Turn it on under Connected mailboxes.";

export async function POST(req: Request) {
  const raw = await req.text();
  const extracted = await extract(req, raw);
  if (extracted instanceof NextResponse) return extracted;

  const { from, to, subject, body, sourceRef } = extracted;

  // Route by the address it was sent to: hub-<token>@INBOUND_DOMAIN. A
  // ReviewItem with a null hubId is visible to EVERY user (see
  // review_item_hub_isolation), so an unroutable message is rejected rather
  // than parked somewhere global. INBOUND_HUB_ID remains as a fallback for
  // the pre-token setup, and is the only reason a message with no usable
  // recipient still lands anywhere.
  const hubId = (await resolveHubFromRecipient(to)) ?? process.env.INBOUND_HUB_ID ?? null;
  if (!hubId) {
    return NextResponse.json(
      { error: "could not route: unknown recipient address" },
      { status: 422 },
    );
  }
  if (!body && !subject) return NextResponse.json({ ok: true, skipped: "empty" });

  // Each accepted message costs a paid AI parse. The signature check already
  // stops anonymous callers; this bounds the damage if a webhook secret ever
  // leaks, or a misconfigured sender starts looping. Keyed per hub so one
  // hub's mail loop can't starve every other hub's inbound; the global bucket
  // stays as an overall ceiling on spend.
  if (!(await rateLimit(`inbound:${hubId}`, 60, 3600)).ok) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }
  if (!(await rateLimit("inbound", 500, 3600)).ok) {
    return NextResponse.json({ error: "rate limited" }, { status: 429 });
  }

  const text = `${subject}\n\n${body}`.slice(0, 6000);

  // AI analysis of mail is opt-in (Law 25). If no active member of this hub
  // has switched it on, the message is NOT sent to the model. It is still
  // recorded as a bare review item — the person forwarded it here on purpose,
  // and silently dropping a bill would be worse — with a note saying why it
  // was not read. Covers every address handed out before the consent existed.
  // The hub's AI allowance (and the global ceiling) apply here too; over it,
  // the mail is still recorded, just not analysed.
  // Forwarded mail has no session, so its Claude credit comes from whoever
  // created the hub; out of credit, it is recorded unanalysed like the rest.
  const payerId =
    (await prisma.hub.findUnique({ where: { id: hubId }, select: { createdById: true } }))?.createdById ?? null;
  const aiAllowed =
    (await hubHasMailAiConsent(hubId)) &&
    !(await overAiBudget(hubId)) &&
    !(payerId && (await creditBlock(payerId)));

  // Charged to the hub, not a user: forwarded mail arrives with no session.
  // `hubId` is resolved above and is non-null by this point.
  const result = aiAllowed
    ? await parseText(text, undefined, 25, hubId, payerId ? { userId: payerId, feature: "mail", hubId } : undefined)
    : ({ ok: false, error: NOT_ANALYSED } as const);

  if (!result.ok) {
    // Still record it so the user can see something arrived and triage manually.
    await prisma.reviewItem.create({
      data: {
        source: "email",
        hubId,
        sourceRef,
        fromAddress: from,
        sourceSnippet: text.slice(0, 500),
        note: aiAllowed ? `Couldn't auto-parse: ${result.error}` : NOT_ANALYSED,
        draft: {
          kind: "task",
          title: subject || "Forwarded email",
          date: null,
          time: null,
          amount: null,
          entryType: "EXPENSE",
          billingCycle: "MONTHLY",
          priority: "MED",
          ventureId: null,
          note: body.slice(0, 500) || null,
          visibility: "SHARED",
          suggestedReply: null,
        } satisfies Draft,
      },
    });
    return NextResponse.json({ ok: true, parsed: 0, ...(aiAllowed ? {} : { analysed: false }) });
  }

  let created = 0;
  for (const draft of result.drafts) {
    // De-dupe: skip an identical pending item from the last 3 days.
    // Scoped to this hub: unscoped, one tenant's "Hydro bill" would suppress
    // another tenant's, silently dropping a legitimate item.
    const dup = await prisma.reviewItem.findFirst({
      where: {
        hubId,
        status: "PENDING",
        createdAt: { gte: new Date(Date.now() - 3 * 864e5) },
        draft: { path: ["title"], equals: draft.title },
      },
    });
    if (dup) continue;

    let note: string | null = null;
    if (draft.kind === "subscription") {
      // Also hub-scoped — this runs on the owner client, so without hubId it
      // reads across every tenant to decide the note.
      const existing = await prisma.subscription.findFirst({
        where: { hubId, status: "ACTIVE", name: { equals: draft.title, mode: "insensitive" } },
        select: { id: true },
      });
      if (existing) note = "Updates an existing subscription";
    }

    await prisma.reviewItem.create({
      data: {
        source: "email",
        hubId,
        sourceRef,
        fromAddress: from,
        sourceSnippet: text.slice(0, 500),
        note,
        draft: draft as unknown as object,
      },
    });
    created++;
  }

  return NextResponse.json({ ok: true, parsed: result.drafts.length, created });
}
