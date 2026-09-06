"use client";

import Link from "next/link";
import { useState } from "react";

import { Avatar } from "@/components/Avatar";
import { signOutAction } from "@/app/(app)/auth-actions";

/**
 * Everything that used to be a bare emoji in the header row. Six unlabelled
 * icons plus a text "Sign out" overflowed the 375px header on a phone; behind
 * the avatar they get real labels and the header keeps three elements.
 */
const LINKS = [
  { href: "/agenda", label: "Agenda", icon: "📋" },
  { href: "/calendar", label: "Calendar", icon: "📅" },
  { href: "/assistant", label: "Assistant", icon: "✨" },
  { href: "/notifications", label: "Notifications", icon: "🔔" },
  { href: "/appearance", label: "Appearance", icon: "🖼️" },
];

export function AccountMenu({
  name,
  email,
}: {
  name: string | null;
  email: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        className="block rounded-full"
      >
        <Avatar name={name} email={email} size={28} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="card absolute right-0 top-full z-40 mt-2 w-52 divide-y divide-[var(--color-border)] p-0">
            <div className="px-3 py-2">
              <div className="truncate text-sm font-semibold">{name ?? "You"}</div>
              {email && (
                <div className="truncate text-[0.68rem] text-[var(--color-text-dim)]">{email}</div>
              )}
            </div>

            <div className="p-1">
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm"
                >
                  <span className="text-base leading-none">{l.icon}</span>
                  {l.label}
                </Link>
              ))}
            </div>

            <div className="p-1">
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="w-full rounded-lg px-2 py-2 text-left text-sm text-[var(--color-text-dim)]"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
