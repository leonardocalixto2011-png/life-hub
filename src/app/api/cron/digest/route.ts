import { NextResponse } from "next/server";
import { bearerMatches } from "@/lib/bearer";

import { reportError } from "@/lib/observability";

import { prisma } from "@/lib/prisma";
import { mapLimit } from "@/lib/async";
import { pruneRateLimits } from "@/lib/rate-limit";
import { pruneAccountLeftovers, pruneActivity, pruneExpiredSignInTokens, pruneReviewItems } from "@/lib/retention";
import { dispatchReminders } from "@/lib/reminders";
import { sendEmail } from "@/lib/email";
import { sendPushToUser, viewAction } from "@/lib/push";
import {
  collectDigestForUser,
  digestHtml,
  digestPush,
  digestSubject,
  digestText,
} from "@/lib/digest";
import { langOf } from "@/lib/i18n";

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
      locale: true,
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
    // Each person reads their digest in their own language (Appearance → locale).
    const reader = { lang: langOf(u.locale), locale: u.locale };
    const subject = digestSubject(digest, reader);
    const text = digestText(digest, reader);
    const html = digestHtml(digest, appUrl, reader);

    if ((pref?.pushEnabled ?? true) && u._count.pushSubscriptions > 0) {
      // Names what matters ("Today: Pay Hydro ($84) · …"), not a bare count.
      const { title, body } = digestPush(digest, reader);
      const r = await sendPushToUser(u.id, {
        title,
        body,
        url: "/today",
        tag: "digest",
        actions: viewAction(reader.lang),
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

  // Retention (DATA-INVENTORY.md §5): parsed email in the review inbox is kept
  // 90 days, then deleted. Same reasoning for riding this job. A failure here
  // must not turn a digest run that already went out into a 500.
  let prunedReviews: { expired: number; deleted: number } | { error: true };
  try {
    prunedReviews = await pruneReviewItems();
  } catch (err) {
    prunedReviews = { error: true };
    await reportError("cron.digest.retention_failed", err, {});
  }
  // The activity feed keeps 90 days too. Its own try: one sweep failing must
  // not skip the other.
  let prunedActivity: number | { error: true };
  try {
    prunedActivity = await pruneActivity();
  } catch (err) {
    prunedActivity = { error: true };
    await reportError("cron.digest.activity_retention_failed", err, {});
  }
  let prunedSignInTokens: number | { error: true };
  try {
    prunedSignInTokens = await pruneExpiredSignInTokens();
  } catch (err) {
    prunedSignInTokens = { error: true };
    await reportError("cron.digest.token_retention_failed", err, {});
  }

  let prunedAccounts: Awaited<ReturnType<typeof pruneAccountLeftovers>> | { error: true };
  try {
    prunedAccounts = await pruneAccountLeftovers();
  } catch (err) {
    prunedAccounts = { error: true };
    await reportError("cron.digest.account_retention_failed", err, {});
  }

  return NextResponse.json({
    ok: true,
    prunedAccounts,
    count: totalCount,
    prunedRateLimits,
    prunedReviews,
    prunedSignInTokens,
    prunedActivity,
    reminded,
    failed,
    pushed,
    emailed,
    ranAt: new Date().toISOString(),
  });
}
