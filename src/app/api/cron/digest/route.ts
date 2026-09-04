import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
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
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
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
  let totalCount = 0;

  await Promise.all(
    users.map(async (u) => {
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
    }),
  );

  return NextResponse.json({
    ok: true,
    count: totalCount,
    pushed,
    emailed,
    ranAt: new Date().toISOString(),
  });
}
