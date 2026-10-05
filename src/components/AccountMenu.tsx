"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Coins,
  MessageCircle,
  CalendarDays,
  Clock,
  CreditCard,
  ListOrdered,
  LogOut,
  Palette,
  Plane,
  Settings,
  Sparkles,
  Star,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

import { Avatar } from "@/components/Avatar";
import { useLang, useT } from "@/components/I18nProvider";
import { setLocale } from "@/app/(app)/appearance/actions";
import { signOutAction } from "@/app/(app)/auth-actions";

/**
 * Everything that used to be a bare emoji in the header row. Six unlabelled
 * icons plus a text "Sign out" overflowed the 375px header on a phone; behind
 * the avatar they get real labels and the header keeps three elements.
 */
const LINKS: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: "/agenda", label: "Agenda", Icon: ListOrdered },
  { href: "/calendar", label: "Calendar", Icon: CalendarDays },
  { href: "/schedule", label: "Schedules", Icon: Clock },
  { href: "/trips", label: "Trips", Icon: Plane },
  { href: "/favorites", label: "Favourites", Icon: Star },
  { href: "/assistant", label: "Assistant", Icon: Sparkles },
  { href: "/chats", label: "Chats", Icon: MessageCircle },
  { href: "/credits", label: "Claude credit", Icon: Coins },
  { href: "/notifications", label: "Notifications", Icon: Bell },
  { href: "/appearance", label: "Appearance", Icon: Palette },
  { href: "/account", label: "Your account", Icon: Settings },
  { href: "/billing", label: "Plan & billing", Icon: CreditCard },
  { href: "/invitations", label: "Invite to Life Hub", Icon: UserPlus },
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
    <div role="group" aria-label={t("Language")} className="flex gap-1 p-1">
      {(["fr", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => pick(l)}
          aria-pressed={lang === l}
          disabled={pending}
          className={`min-h-[36px] flex-1 rounded-[10px] px-2 text-xs font-semibold ${
            lang === l
              ? "bg-[var(--color-primary)] text-[var(--color-primary-fg)]"
              : "bg-[var(--color-surface-2)] text-[var(--color-text-dim)]"
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
  username = null,
  avatarUrl = null,
}: {
  username?: string | null;
  avatarUrl?: string | null;
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
        className="icon-btn"
      >
        <Avatar name={name} email={email} src={avatarUrl} size={32} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="menu absolute right-0 top-full z-40 mt-1 max-h-[calc(100dvh-5rem)] w-60 overflow-y-auto" style={{ transformOrigin: "top right" }}>
            <div className="flex items-center gap-3 px-3 py-2.5">
              <Avatar name={name} email={email} src={avatarUrl} size={36} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{name ?? t("You")}</div>
                {username && (
                  <div className="truncate text-xs text-[var(--color-text-dim)]">@{username}</div>
                )}
                {email && (
                  <div className="truncate text-xs text-[var(--color-text-dim)]">{email}</div>
                )}
              </div>
            </div>

            <LanguageSwitch />

            <div className="menu-sep" />

            {LINKS.map(({ href, label, Icon }) => (
              <Link key={href} href={href} onClick={() => setOpen(false)} className="menu-item">
                <Icon size={18} strokeWidth={1.9} aria-hidden />
                {t(label)}
              </Link>
            ))}

            <div className="menu-sep" />

            <form action={signOutAction}>
              <button type="submit" className="menu-item text-[var(--color-text-dim)]">
                <LogOut size={18} strokeWidth={1.9} aria-hidden />
                {t("Sign out")}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
