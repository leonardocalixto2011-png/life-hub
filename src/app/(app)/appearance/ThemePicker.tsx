"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { THEMES } from "@/lib/themes";
import { setTheme } from "./actions";

export function ThemePicker({ current }: { current: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Optimistic: the swatch highlights immediately, before the layout
  // re-renders with the new palette.
  const [selected, setSelected] = useState(current);

  function choose(id: string) {
    if (id === selected) return;
    setSelected(id);
    startTransition(async () => {
      await setTheme(id);
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {THEMES.map((t) => {
        const active = t.id === selected;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => choose(t.id)}
            disabled={pending}
            aria-pressed={active}
            className="flex flex-col items-center gap-1.5 rounded-xl border p-2.5 disabled:opacity-60"
            style={{
              borderColor: active ? "var(--color-primary)" : "var(--color-border)",
              borderWidth: active ? 2 : 1,
              background: "var(--color-surface)",
            }}
          >
            <span
              className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-border)]"
              style={{ background: t.swatch[0] }}
            >
              <span
                className="h-4 w-4 rounded-full"
                style={{ background: t.swatch[1] }}
              />
            </span>
            <span className="text-[0.7rem] font-semibold">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
