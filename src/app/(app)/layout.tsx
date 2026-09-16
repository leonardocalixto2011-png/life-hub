import Link from "next/link";

import { requireHub, listMyHubs, listPendingInvites } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
import { hubChrome } from "@/lib/data";
import { QuickAdd } from "@/components/QuickAdd";
import { BottomNav } from "@/components/BottomNav";
import { AccountMenu } from "@/components/AccountMenu";
import { HubSwitcher } from "@/components/HubSwitcher";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { ToastHost } from "@/components/Toast";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, hub } = await requireHub();
  const t = await getT();
  const [{ ventures, members, reviewCount }, hubs, invites] = await Promise.all([
    hubChrome(user.id, hub.id),
    listMyHubs(user.id),
    listPendingInvites(user.id),
  ]);

  return (
    <div
      className="relative mx-auto flex min-h-dvh max-w-md flex-col"
      // Lets the stylesheet raise text contrast only for people who actually
      // set a photo, instead of dimming the app for everyone.
      data-photo={user.backgroundImageUrl ? "" : undefined}
      style={{
        // The hub's own colour, exposed to the chrome below. Hubs are places;
        // this is what stops "which hub am I in?" from ever being a question.
        // Deliberately NOT --color-primary: that belongs to the user's chosen
        // theme and drives buttons and links, so the two layers coexist —
        // Chantelle keeps pink controls inside a green hub.
        ["--hub" as string]: hub.color,
        ...(user.backgroundImageUrl
          ? {
              backgroundImage: `url(${user.backgroundImageUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundAttachment: "scroll",
            }
          : {}),
      }}
    >
      {/*
        A scrim over the background photo — and, crucially, not a heavy one.
        Legibility here is solved in two halves rather than by hiding the
        picture, because a photo veiled until it is a grey ghost may as well
        not be set.

        Half one is this: 58%, enough to compress the photo's contrast toward
        the page colour so text has a predictable-ish ground, while the photo
        is still plainly the photo. Half two is in globals.css — `[data-photo]`
        strengthens --text-dim, because the real problem was never the photo's
        brightness, it was that the dim text colour is tuned for contrast
        against --color-bg and nothing else.

        Only rendered when a photo exists, so a plain background is untouched.
      */}
      {user.backgroundImageUrl && (
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{ background: "color-mix(in srgb, var(--color-bg) 58%, transparent)" }}
          aria-hidden
        />
      )}

      <ServiceWorkerRegister />
      {/* A hairline of the hub's colour across the top of the app. Small on
          purpose — enough to register when you switch hubs, not enough to
          fight the user's own theme. The header itself is deliberately NOT
          tinted: 7% of an indigo hub over a sunset theme read as lavender,
          which is two colour systems arguing in the one place the eye lands
          first. The hairline says which hub you're in without that. */}
      <div className="relative z-10 h-[3px] shrink-0" style={{ background: "var(--hub)" }} aria-hidden />
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 px-4 py-2.5 backdrop-blur">
        <HubSwitcher hubs={hubs} currentHubId={hub.id} pendingInvites={invites.length} />
        <div className="flex items-center gap-3">
          <Link href="/inbox" aria-label={t("Review inbox")} className="relative text-lg leading-none">
            📥
            {reviewCount > 0 && (
              <span className="absolute -right-1.5 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--color-danger)] px-1 text-[0.6rem] font-bold text-white">
                {reviewCount > 9 ? "9+" : reviewCount}
              </span>
            )}
          </Link>
          <AccountMenu name={user.name} email={user.email} />
        </div>
      </header>

      {/* Everything from here sits above the scrim, not on the photo. */}
      <div className="relative z-10 flex flex-1 flex-col">
        <QuickAdd
          ventures={ventures.map((v) => ({ id: v.id, name: v.name }))}
          members={members}
          defaultAssigneeId={user.id}
          aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)}
        />

        {/* An invite is the one thing that should interrupt every page: until
            it's answered the person is looking at a hub that isn't the one
            they were asked into, and nothing else in the app tells them so. */}
        {invites.length > 0 && (
          <Link
            href="/hubs/invites"
            className="mx-3 mt-3 flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm"
            style={{
              borderColor: invites[0].color,
              background: `color-mix(in srgb, ${invites[0].color} 12%, var(--color-surface))`,
            }}
          >
            <span className="min-w-0 truncate">
              <span className="font-semibold">{invites[0].invitedBy}</span> {t("invited you to")}{" "}
              <span className="font-semibold">{invites[0].name}</span>
              {invites.length > 1 ? ` (+${invites.length - 1})` : ""}
            </span>
            <span className="shrink-0 font-semibold text-[var(--color-primary)]">{t("Join")} →</span>
          </Link>
        )}

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>

      <ToastHost />
      <BottomNav />
    </div>
  );
}
