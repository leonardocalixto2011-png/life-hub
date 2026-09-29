import { NextResponse } from "next/server";
import { bearerMatches } from "@/lib/bearer";

import { monitored } from "@/lib/observability";

import { pollAllMailAccounts } from "@/lib/mail/poll";
import { dispatchTimelyReminders, type TimelyResult } from "@/lib/timely";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Small, so mail polling keeps most of the external scheduler's ~30s timeout. */
const TIMELY_BUDGET_MS = 5_000;

function authorized(req: Request): boolean {
  return bearerMatches(req, process.env.MAIL_POLL_SECRET);
}

/**
 * Hit by an external scheduler (e.g. cron-job.org) every 15-30 min — Vercel
 * Hobby's own cron can't run more often than once a day, see the plan.
 *
 * Also the heartbeat for timely reminders (event in 1 h, cancel-by, debt due
 * tomorrow — `lib/timely.ts`), run first and on the same shared time budget.
 * A failure there never blocks mail polling.
 */
export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const runStartedAt = Date.now();

  let reminders: TimelyResult | { error: true };
  try {
    reminders = await monitored("reminders.timely", {}, () => dispatchTimelyReminders(TIMELY_BUDGET_MS));
  } catch {
    // monitored() has already reported it; mail polling still runs.
    reminders = { error: true };
  }

  const result = await monitored("mail.poll", {}, () => pollAllMailAccounts(runStartedAt));
  return NextResponse.json({ ok: true, ...result, reminders, ranAt: new Date().toISOString() });
}
