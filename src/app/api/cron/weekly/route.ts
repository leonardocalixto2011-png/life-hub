import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { sendPushToUser } from "@/lib/push";
import { collectWeekly, weeklyHtml, weeklySubject, weeklyText } from "@/lib/digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const w = await collectWeekly();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const subject = weeklySubject();
  const text = weeklyText(w);
  const html = weeklyHtml(w, appUrl);

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

  await Promise.all(
    users.map(async (u) => {
      const pref = u.notificationPref;
      if ((pref?.pushEnabled ?? true) && u._count.pushSubscriptions > 0) {
        const r = await sendPushToUser(u.id, {
          title: "Life Hub — the week ahead",
          body: text,
          url: "/agenda",
          tag: "weekly",
        });
        if (r.sent > 0) pushed++;
      }
      if ((pref?.emailDigestEnabled ?? true) && u.email) {
        await sendEmail({ to: u.email, subject, html, text });
        emailed++;
      }
    }),
  );

  return NextResponse.json({ ok: true, pushed, emailed, summary: text });
}
