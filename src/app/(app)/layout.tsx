import Link from "next/link";

import { requireHub, listMyHubs } from "@/lib/session";
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
  const [{ ventures, members, reviewCount }, hubs] = await Promise.all([
    hubChrome(user.id, hub.id),
    listMyHubs(user.id),
  ]);

  return (
    <div
      className="relative mx-auto flex min-h-dvh max-w-md flex-col"
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
        A scrim over the background photo.

        Without it the photo sits directly behind the page and every piece of
        secondary text — the section headings, the date under the greeting —
        lands on whatever happens to be in the picture and becomes unreadable.
        Those use --color-text-dim, which is chosen for contrast against
        --color-bg, not against someone's living room.

        88% rather than a full cover: the photo still reads as *your* photo
        around the edges and through the gaps between cards, but nothing on
        top of it has to fight for legibility. Only rendered when there is a
        photo, so a plain background stays exactly as it was.
      */}
      {user.backgroundImageUrl && (
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{ background: "color-mix(in srgb, var(--color-bg) 88%, transparent)" }}
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
        <HubSwitcher hubs={hubs} currentHubId={hub.id} />
        <div className="flex items-center gap-3">
          <Link href="/inbox" aria-label="Review inbox" className="relative text-lg leading-none">
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

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>

      <ToastHost />
      <BottomNav />
    </div>
  );
}
