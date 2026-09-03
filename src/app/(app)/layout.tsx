import Link from "next/link";

import { requireUser } from "@/lib/session";
import { listMembers, listVentures } from "@/lib/data";
import { QuickAdd } from "@/components/QuickAdd";
import { BottomNav } from "@/components/BottomNav";
import { Avatar } from "@/components/Avatar";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { signOutAction } from "./auth-actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const [ventures, members] = await Promise.all([listVentures(), listMembers()]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col">
      <ServiceWorkerRegister />
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 px-4 py-2.5 backdrop-blur">
        <span className="font-bold tracking-tight">Life Hub</span>
        <div className="flex items-center gap-3">
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
      />

      <main className="flex-1 overflow-y-auto">{children}</main>

      <BottomNav />
    </div>
  );
}
