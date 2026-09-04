import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { sendPushToUser } from "@/lib/push";
import { collectWeeklyForUser, weeklyHtml, weeklySubject, weeklyText } from "@/lib/digest";

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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const subject = weeklySubject();

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
  const summaries: string[] = [];

  await Promise.all(
    users.map(async (u) => {
      const w = await collectWeeklyForUser(u.id);
      const text = weeklyText(w);
      const html = weeklyHtml(w, appUrl);
      summaries.push(text);

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

  return NextResponse.json({ ok: true, pushed, emailed, summary: summaries.join(" | ") });
}
