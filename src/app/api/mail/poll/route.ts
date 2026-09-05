import { NextResponse } from "next/server";

import { pollAllMailAccounts } from "@/lib/mail/poll";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.MAIL_POLL_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Hit by an external scheduler (e.g. cron-job.org) every 15-30 min — Vercel
 * Hobby's own cron can't run more often than once a day, see the plan.
 */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await pollAllMailAccounts();
  return NextResponse.json({ ok: true, ...result, ranAt: new Date().toISOString() });
}
