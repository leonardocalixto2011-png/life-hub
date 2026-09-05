import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { parseText, type Draft } from "@/lib/parse";

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

type Extracted = { from: string | null; subject: string; body: string; sourceRef: string | null };

/** Two inbound paths land here: Resend Inbound (Svix-signed) or a Cloudflare
 * Email Worker (shared-secret header, see workers/inbound-email). Whichever
 * ends up working, both feed the same review-inbox pipeline below. */
async function extract(req: Request, raw: string): Promise<Extracted | NextResponse> {
  const cfSecret = req.headers.get("x-inbound-secret");

  if (cfSecret) {
    const expected = process.env.INBOUND_SECRET;
    if (!expected || cfSecret !== expected) {
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
      subject: d.subject ?? "",
      body: d.text?.trim() || (d.html ? stripHtml(d.html) : ""),
      sourceRef: d.messageId ?? null,
    };
  }

  const resendSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (resendSecret && !verifySvix(resendSecret, req.headers, raw)) {
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
    subject: d.subject ?? "",
    body: d.text?.trim() || (d.html ? stripHtml(d.html) : ""),
    sourceRef: d.message_id ?? d.email_id ?? null,
  };
}

export async function POST(req: Request) {
  const raw = await req.text();
  const extracted = await extract(req, raw);
  if (extracted instanceof NextResponse) return extracted;

  const { from, subject, body, sourceRef } = extracted;
  if (!body && !subject) return NextResponse.json({ ok: true, skipped: "empty" });

  const text = `${subject}\n\n${body}`.slice(0, 6000);
  const result = await parseText(text);

  if (!result.ok) {
    // Still record it so the user can see something arrived and triage manually.
    await prisma.reviewItem.create({
      data: {
        source: "email",
        sourceRef,
        fromAddress: from,
        sourceSnippet: text.slice(0, 500),
        note: `Couldn't auto-parse: ${result.error}`,
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
    return NextResponse.json({ ok: true, parsed: 0 });
  }

  let created = 0;
  for (const draft of result.drafts) {
    // De-dupe: skip an identical pending item from the last 3 days.
    const dup = await prisma.reviewItem.findFirst({
      where: {
        status: "PENDING",
        createdAt: { gte: new Date(Date.now() - 3 * 864e5) },
        draft: { path: ["title"], equals: draft.title },
      },
    });
    if (dup) continue;

    let note: string | null = null;
    if (draft.kind === "subscription") {
      const existing = await prisma.subscription.findFirst({
        where: { status: "ACTIVE", name: { equals: draft.title, mode: "insensitive" } },
        select: { id: true },
      });
      if (existing) note = "Updates an existing subscription";
    }

    await prisma.reviewItem.create({
      data: {
        source: "email",
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
