import Link from "next/link";

import { requireHub } from "@/lib/session";
import { withHub } from "@/lib/hub-context";
import { listMembers, listVentures, pendingReviewCount } from "@/lib/data";
import { QuickAdd } from "@/components/QuickAdd";
import { BottomNav } from "@/components/BottomNav";
import { Avatar } from "@/components/Avatar";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { ToastHost } from "@/components/Toast";
import { signOutAction } from "./auth-actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, hub } = await requireHub();
  const [ventures, members, reviewCount] = await withHub(user.id, (tx) =>
    Promise.all([listVentures(tx, hub.id), listMembers(tx, hub.id), pendingReviewCount(tx)]),
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <ServiceWorkerRegister />
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 px-4 py-2.5 backdrop-blur">
        <span className="font-bold tracking-tight">Life Hub</span>
        <div className="flex items-center gap-2.5">
          <Link href="/inbox" aria-label="Review inbox" className="relative text-lg leading-none">
            📥
            {reviewCount > 0 && (
              <span className="absolute -right-1.5 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--color-danger)] px-1 text-[0.6rem] font-bold text-white">
                {reviewCount > 9 ? "9+" : reviewCount}
              </span>
            )}
          </Link>
          <Link href="/agenda" aria-label="Agenda" className="text-lg leading-none">
            📋
          </Link>
          <Link href="/assistant" aria-label="Assistant" className="text-lg leading-none">
            ✨
          </Link>
          <Link href="/calendar" aria-label="Calendar" className="text-lg leading-none">
            📅
          </Link>
          <Link href="/notifications" aria-label="Notifications" className="text-lg leading-none">
            🔔
          </Link>
          <Avatar name={user.name} email={user.email} size={26} />
          <form action={signOutAction}>
            <button className="text-xs font-semibold text-[var(--color-text-dim)]">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <QuickAdd
        ventures={ventures.map((v) => ({ id: v.id, name: v.name }))}
        members={members}
        defaultAssigneeId={user.id}
        aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)}
      />

      <main className="flex-1 overflow-y-auto">{children}</main>

      <ToastHost />
      <BottomNav />
    </div>
  );
}
