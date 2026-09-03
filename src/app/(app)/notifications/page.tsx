import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { PushToggle } from "@/components/PushToggle";
import { InstallHint } from "@/components/InstallHint";
import { DigestPrefsForm } from "./DigestPrefsForm";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();

  const [pref, deviceCount] = await Promise.all([
    prisma.notificationPreference.findUnique({ where: { userId: user.id } }),
    prisma.pushSubscription.count({ where: { userId: user.id } }),
  ]);

  const pushConfigured = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);

  return (
    <div className="space-y-4 p-3">
      <div>
        <Link href="/today" className="text-xs font-semibold text-[var(--color-text-dim)]">
          ← Today
        </Link>
        <h1 className="mt-1 text-lg font-bold">Notifications</h1>
        <p className="text-xs text-[var(--color-text-dim)]">
          {deviceCount > 0
            ? `${deviceCount} device${deviceCount === 1 ? "" : "s"} registered for push.`
            : "No devices registered for push yet."}
        </p>
      </div>

      {!pushConfigured && (
        <div className="card border-[var(--color-danger)] p-4 text-xs text-[var(--color-danger)]">
          Push isn’t configured on the server (no VAPID key). Run{" "}
          <code>npm run gen:vapid</code> and add the keys to the environment. The
          email digest still works.
        </div>
      )}

      <PushToggle />
      <InstallHint />

      <DigestPrefsForm
        emailDigestEnabled={pref?.emailDigestEnabled ?? true}
        digestHour={pref?.digestHour ?? 7}
        timezone={pref?.timezone ?? "America/Toronto"}
      />
    </div>
  );
}
