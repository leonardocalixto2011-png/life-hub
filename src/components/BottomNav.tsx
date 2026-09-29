"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

import { CalendarClock, CircleCheckBig, Repeat, Sun, Wallet, type LucideIcon } from "lucide-react";

import { useT } from "@/components/I18nProvider";

const ITEMS: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: "/today", label: "Today", Icon: Sun },
  { href: "/tasks", label: "Tasks", Icon: CircleCheckBig },
  { href: "/deadlines", label: "Deadlines", Icon: CalendarClock },
  { href: "/subscriptions", label: "Subs", Icon: Repeat },
  { href: "/budget", label: "Budget", Icon: Wallet },
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

export function BottomNav({ current }: { current?: string } = {}) {
  // `current` only overrides the detected route (used by a static preview);
  // in the app it is always left unset.
  const detected = usePathname();
  const pathname = current ?? detected;
  const t = useT();

  return (
    <nav
      aria-label={t("Main")}
      className="opaque safe-b sticky bottom-0 z-20 grid grid-cols-5 border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 px-1 backdrop-blur"
    >
      {ITEMS.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className="tabbar-item"
            aria-current={active ? "page" : undefined}
          >
            <PendingDot />
            <span className="tabbar-icon" aria-hidden>
              <Icon size={22} strokeWidth={active ? 2.25 : 1.9} />
            </span>
            <span className="max-w-full truncate px-0.5">{t(label)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
