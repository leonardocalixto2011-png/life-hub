import { NextResponse } from "next/server";
import { bearerMatches } from "@/lib/bearer";

import { reportError } from "@/lib/observability";

import { prisma } from "@/lib/prisma";
import { mapLimit } from "@/lib/async";
import { pruneRateLimits } from "@/lib/rate-limit";
import { dispatchReminders } from "@/lib/reminders";
import { sendEmail } from "@/lib/email";
import { sendPushToUser } from "@/lib/push";
import {
  collectDigestForUser,
  digestHtml,
  digestSubject,
  digestText,
} from "@/lib/digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  return bearerMatches(req, process.env.CRON_SECRET);
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const users = await prisma.user.findMany({
    where: { email: { not: null } },
    select: {
      id: true,
      email: true,
      notificationPref: true,
      _count: { select: { pushSubscriptions: true } },
    },
  });

  let pushed = 0;
  let emailed = 0;
  let failed = 0;
  let reminded = 0;
  let totalCount = 0;

  // Bounded fan-out: each user's collect opens its own withHub transaction
  // per hub, so unbounded Promise.all would spike Neon connections as the
  // roster grows.
  await mapLimit(users, 4, async (u) => {
    try {
    // Dated reminders ride this cron because Vercel Hobby caps us at two
    // schedules and both are spent. Runs before the digest early-return: a
    // reminder is due on its own terms whether or not anything else is.
    reminded += await dispatchReminders(u.id);

    const digest = await collectDigestForUser(u.id, 48);
    totalCount += digest.count;
    if (digest.count === 0) return;

    const pref = u.notificationPref;
    const subject = digestSubject(digest);
    const text = digestText(digest);
    const html = digestHtml(digest, appUrl);

    if ((pref?.pushEnabled ?? true) && u._count.pushSubscriptions > 0) {
      const r = await sendPushToUser(u.id, {
        title: "Life Hub — daily digest",
        body: `${digest.count} thing${digest.count === 1 ? "" : "s"} due in the next 48h. Tap to review.`,
        url: "/today",
        tag: "digest",
      });
      if (r.sent > 0) pushed++;
    }

    if ((pref?.emailDigestEnabled ?? true) && u.email) {
      await sendEmail({ to: u.email, subject, html, text });
      emailed++;
    }
    } catch (err) {
      // One person's digest failing must not abort everyone else's.
      failed++;
      await reportError("cron.digest.user_failed", err, { userId: u.id });
    }
  });

  // Piggyback the rate-limit sweep on a job that already runs daily.
  const prunedRateLimits = await pruneRateLimits();

  return NextResponse.json({
    ok: true,
    count: totalCount,
    prunedRateLimits,
    reminded,
    failed,
    pushed,
    emailed,
    ranAt: new Date().toISOString(),
  });
}
