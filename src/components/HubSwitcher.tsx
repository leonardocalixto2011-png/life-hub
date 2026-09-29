"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Check, ChevronDown, Inbox, Landmark, Mail, Plus, User, Users } from "lucide-react";

import { switchHub } from "@/app/(app)/hubs/actions";
import { useT } from "@/components/I18nProvider";

type Hub = { id: string; name: string; color: string };

export function HubSwitcher({
  hubs,
  currentHubId,
  pendingInvites = 0,
}: {
  hubs: Hub[];
  currentHubId: string;
  pendingInvites?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const t = useT();
  const current = hubs.find((h) => h.id === currentHubId) ?? hubs[0];

  const item = "menu-item";
  const ico = { size: 18, strokeWidth: 1.9, "aria-hidden": true } as const;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="-ml-2 flex min-h-[44px] min-w-0 items-center gap-2 rounded-xl px-2 text-[1.0625rem] font-bold tracking-tight active:bg-[var(--color-surface-2)]"
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: current?.color ?? "#6366f1" }}
        />
        <span className="max-w-[10.5rem] truncate">{current?.name ?? "Life Hub"}</span>
        <ChevronDown size={16} strokeWidth={2.25} className="shrink-0 text-[var(--color-text-dim)]" aria-hidden />
        {pendingInvites > 0 && (
          <span
            aria-label={t("{n} pending invitations", { n: pendingInvites })}
            className="badge"
          >
            {pendingInvites}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="menu absolute left-0 top-full z-40 mt-1 w-64" style={{ transformOrigin: "top left" }}>
            <div className="max-h-64 overflow-y-auto">
              {hubs.map((h) => (
                <form key={h.id} action={switchHub.bind(null, h.id)}>
                  <button
                    type="submit"
                    disabled={h.id === currentHubId}
                    className="menu-item disabled:font-semibold"
                    style={h.id === currentHubId ? { background: "var(--color-surface-2)" } : undefined}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: h.color }}
                    />
                    <span className="truncate">{h.name}</span>
                    {h.id === currentHubId && (
                      <Check size={16} strokeWidth={2.5} className="ml-auto text-[var(--color-primary)]" aria-hidden />
                    )}
                  </button>
                </form>
              ))}
            </div>
            <div className="menu-sep" />
            <div>
              {pendingInvites > 0 && (
                <Link
                  href="/hubs/invites"
                  onClick={() => setOpen(false)}
                  className="menu-item font-semibold text-[var(--color-danger)]"
                >
                  <Inbox {...ico} style={{ color: "var(--color-danger)" }} />
                  {t("Invitations")} · {pendingInvites}
                </Link>
              )}
              <Link href={`/hubs/${currentHubId}/members`} onClick={() => setOpen(false)} className={item}>
                <Users {...ico} />
                {t("Members & invites")}
              </Link>
              <Link href="/mine" onClick={() => setOpen(false)} className={item}>
                <User {...ico} />
                {t("Mine, across hubs")}
              </Link>
              <Link href="/mail" onClick={() => setOpen(false)} className={item}>
                <Mail {...ico} />
                {t("Connected mailboxes")}
              </Link>
              <Link href="/debts" onClick={() => setOpen(false)} className={item}>
                <Landmark {...ico} />
                {t("Debts")}
              </Link>
              <Link
                href="/hubs/new"
                onClick={() => setOpen(false)}
                className="menu-item font-semibold text-[var(--color-primary)]"
              >
                <Plus {...ico} style={{ color: "var(--color-primary)" }} />
                {t("Create a hub")}
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
