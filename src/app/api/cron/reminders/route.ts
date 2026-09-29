import { NextResponse } from "next/server";
import { bearerMatches } from "@/lib/bearer";

import { monitored } from "@/lib/observability";
import { dispatchTimelyReminders } from "@/lib/timely";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Timely reminders on their own (event in 1 h, cancel-by, debt due tomorrow).
 * `/api/mail/poll` already runs these every time it's hit; this route exists
 * so they can be given a separate, tighter schedule later. Same secret as the
 * mail poller, since it's the same external scheduler. Idempotent via the
 * ReminderSent ledger, so both routes running is harmless.
 */
export async function GET(req: Request) {
  if (!bearerMatches(req, process.env.MAIL_POLL_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await monitored("reminders.timely", {}, () => dispatchTimelyReminders(20_000));
  return NextResponse.json({ ok: true, ...result, ranAt: new Date().toISOString() });
}
