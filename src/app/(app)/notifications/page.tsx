import Link from "next/link";
import { CalendarClock, CalendarDays, Landmark, Repeat, Sun, UserRound } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireHub } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
import { PushToggle } from "@/components/PushToggle";
import { InstallHint } from "@/components/InstallHint";
import { DigestPrefsForm } from "./DigestPrefsForm";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const { user } = await requireHub();
  const t = await getT();

  const [pref, deviceCount] = await Promise.all([
    prisma.notificationPreference.findUnique({ where: { userId: user.id } }),
    prisma.pushSubscription.count({ where: { userId: user.id } }),
  ]);

  const pushConfigured = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);

  return (
    <div className="page">
      <div>
        <Link href="/today" className="back-link">
          {t("Today")}
        </Link>
        <h1 className="page-title">{t("Notifications")}</h1>
        <p className="page-sub">
          {deviceCount > 0
            ? t("{n} devices registered for push.", { n: deviceCount })
            : t("No devices registered for push yet.")}
        </p>
      </div>

      {!pushConfigured && (
        <div className="card border-[var(--color-danger)] p-4 text-xs text-[var(--color-danger)]">
          {t("Push isn’t configured on the server (no VAPID key). Run {cmd} and add the keys to the environment. The email digest still works.", { cmd: "npm run gen:vapid" })}
        </div>
      )}

      <PushToggle />

      {/* What arrives, and when — so "will it remind me?" has an answer. */}
      <section className="card p-4" aria-labelledby="notify-what">
        <h2 id="notify-what" className="text-sm font-semibold">
          {t("What you’ll be notified about")}
        </h2>
        <ul className="mt-3 space-y-3 text-sm leading-snug">
          {(
            [
              ["morning", Sun, t("A morning summary around 8 a.m. — what’s due today and tomorrow.")],
              ["event", CalendarDays, t("1 hour before an event on your calendar.")],
              ["subs", Repeat, t("Subscriptions: 3 days before the cancel-by date, and on the day.")],
              ["debts", Landmark, t("Debts: the day before a payment is due.")],
              ["deadlines", CalendarClock, t("Deadlines and special dates: on the days you choose (e.g. 7, 3, 1 days before).")],
              ["assigned", UserRound, t("When someone assigns you a task.")],
            ] as const
          ).map(([key, Icon, text]) => (
            <li key={key} className="flex items-start gap-3">
              <span className="icon-tile h-7 w-7" aria-hidden>
                <Icon size={15} strokeWidth={2} />
              </span>
              <span className="pt-1">{text}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-[var(--color-text-dim)]">
          {t("Pushes need notifications turned on for each phone or computer you use.")}
        </p>
      </section>

      <InstallHint />

      <DigestPrefsForm
        emailDigestEnabled={pref?.emailDigestEnabled ?? true}
        digestHour={pref?.digestHour ?? 7}
        timezone={pref?.timezone ?? "America/Toronto"}
      />
    </div>
  );
}
