"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/today", label: "Today", icon: "☀️" },
  { href: "/tasks", label: "Tasks", icon: "✓" },
  { href: "/deadlines", label: "Deadlines", icon: "⏳" },
  { href: "/subscriptions", label: "Subs", icon: "🔁" },
  { href: "/money", label: "Budget", icon: "💳" },
];

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
            className="flex flex-col items-center gap-0.5 py-2 text-[0.66rem] font-medium"
            style={{ color: active ? "var(--color-primary)" : "var(--color-text-dim)" }}
          >
            <span className="text-base leading-none">{it.icon}</span>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
