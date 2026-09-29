"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Avatar } from "@/components/Avatar";
import { useLang, useT } from "@/components/I18nProvider";
import { setLocale } from "@/app/(app)/appearance/actions";
import { signOutAction } from "@/app/(app)/auth-actions";

/**
 * Everything that used to be a bare emoji in the header row. Six unlabelled
 * icons plus a text "Sign out" overflowed the 375px header on a phone; behind
 * the avatar they get real labels and the header keeps three elements.
 */
const LINKS = [
  { href: "/agenda", label: "Agenda", icon: "📋" },
  { href: "/calendar", label: "Calendar", icon: "📅" },
  { href: "/schedule", label: "Schedules", icon: "🕐" },
  { href: "/trips", label: "Trips", icon: "✈️" },
  { href: "/favorites", label: "Favourites", icon: "⭐" },
  { href: "/assistant", label: "Assistant", icon: "✨" },
  { href: "/notifications", label: "Notifications", icon: "🔔" },
  { href: "/appearance", label: "Appearance", icon: "🖼️" },
  { href: "/account", label: "Your account", icon: "⚙️" },
];

/**
 * Français / English, one tap from every screen. The full picker (which also
 * sets number formatting for other regions) stays on /appearance, but it sat
 * below the fold there and people didn't find it.
 */
function LanguageSwitch() {
  const lang = useLang();
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();

  function pick(next: "fr" | "en") {
    if (next === lang || pending) return;
    start(async () => {
      await setLocale(next === "fr" ? "fr-CA" : "en-CA");
      router.refresh();
    });
  }

  return (
    <div role="group" aria-label={t("Language")} className="flex gap-1 px-3 pb-2">
      {(["fr", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => pick(l)}
          aria-pressed={lang === l}
          disabled={pending}
          className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold ${
            lang === l
              ? "bg-[var(--color-primary)] text-[var(--color-primary-fg)]"
              : "border border-[var(--color-border)] text-[var(--color-text-dim)]"
          }`}
        >
          {l === "fr" ? "Français" : "English"}
        </button>
      ))}
    </div>
  );
}

export function AccountMenu({
  name,
  email,
}: {
  name: string | null;
  email: string | null;
}) {
  const [open, setOpen] = useState(false);
  const t = useT();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("Account menu")}
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
              <div className="truncate text-sm font-semibold">{name ?? t("You")}</div>
              {email && (
                <div className="truncate text-[0.68rem] text-[var(--color-text-dim)]">{email}</div>
              )}
            </div>

            <div className="pt-2">
              <LanguageSwitch />
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
                  {t(l.label)}
                </Link>
              ))}
            </div>

            <div className="p-1">
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="w-full rounded-lg px-2 py-2 text-left text-sm text-[var(--color-text-dim)]"
                >
                  {t("Sign out")}
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
