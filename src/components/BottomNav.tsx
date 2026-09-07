"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/today", label: "Today", icon: "☀️" },
  { href: "/tasks", label: "Tasks", icon: "✓" },
  { href: "/deadlines", label: "Deadlines", icon: "⏳" },
  { href: "/subscriptions", label: "Subs", icon: "🔁" },
  { href: "/budget", label: "Budget", icon: "💳" },
];

/**
 * Renders inside the <Link>, which is what `useLinkStatus` requires — it
 * reports the pending state of *its own* link only. That's the point: the tab
 * you tapped is the one that should look busy, not the whole bar.
 *
 * The delay before showing anything is deliberate. Most navigations resolve
 * faster than this, and a spinner that flashes for 60ms reads as a glitch;
 * one that appears only when the trip is genuinely slow reads as the app
 * being honest about waiting.
 */
function PendingDot() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-0.5 origin-left bg-[var(--color-primary)]"
      style={{
        opacity: pending ? 1 : 0,
        transform: pending ? "scaleX(1)" : "scaleX(0)",
        transition: pending
          ? "opacity .12s linear .15s, transform 1.6s cubic-bezier(.1,.7,.3,1) .15s"
          : "opacity .12s linear",
      }}
    />
  );
}

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="safe-b sticky bottom-0 z-20 grid grid-cols-5 border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur">
      {ITEMS.map((it) => {
        const active = pathname === it.href || pathname.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            className="relative flex flex-col items-center gap-0.5 py-2 text-[0.66rem] font-medium transition-colors active:bg-[var(--color-surface-2)]"
            style={{ color: active ? "var(--color-primary)" : "var(--color-text-dim)" }}
          >
            <PendingDot />
            <span className="text-base leading-none">{it.icon}</span>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
