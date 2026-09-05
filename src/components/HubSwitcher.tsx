"use client";

import Link from "next/link";
import { useRef, useState } from "react";

import { switchHub } from "@/app/(app)/hubs/actions";

type Hub = { id: string; name: string; color: string };

export function HubSwitcher({
  hubs,
  currentHubId,
}: {
  hubs: Hub[];
  currentHubId: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = hubs.find((h) => h.id === currentHubId) ?? hubs[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 font-bold tracking-tight"
      >
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ background: current?.color ?? "#6366f1" }}
        />
        <span className="max-w-[9rem] truncate">{current?.name ?? "Life Hub"}</span>
        <span className="text-[0.6rem] text-[var(--color-text-dim)]">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="card absolute left-0 top-full z-40 mt-2 w-56 divide-y divide-[var(--color-border)] p-0">
            <div className="max-h-64 overflow-y-auto">
              {hubs.map((h) => (
                <form key={h.id} action={switchHub.bind(null, h.id)}>
                  <button
                    type="submit"
                    disabled={h.id === currentHubId}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm disabled:font-semibold"
                    style={h.id === currentHubId ? { background: "var(--color-surface-2)" } : undefined}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: h.color }}
                    />
                    <span className="truncate">{h.name}</span>
                    {h.id === currentHubId && <span className="ml-auto text-xs">✓</span>}
                  </button>
                </form>
              ))}
            </div>
            <div className="p-1">
              <Link
                href={`/hubs/${currentHubId}/members`}
                onClick={() => setOpen(false)}
                className="block rounded-lg px-2 py-2 text-sm text-[var(--color-text-dim)]"
              >
                Members & invites
              </Link>
              <Link
                href="/mine"
                onClick={() => setOpen(false)}
                className="block rounded-lg px-2 py-2 text-sm text-[var(--color-text-dim)]"
              >
                Mine, across hubs
              </Link>
              <Link
                href="/mail"
                onClick={() => setOpen(false)}
                className="block rounded-lg px-2 py-2 text-sm text-[var(--color-text-dim)]"
              >
                Connected mailboxes
              </Link>
              <Link
                href="/hubs/new"
                onClick={() => setOpen(false)}
                className="block rounded-lg px-2 py-2 text-sm font-semibold text-[var(--color-primary)]"
              >
                + Create a hub
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
