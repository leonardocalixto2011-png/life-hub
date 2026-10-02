"use client";

import { useState, useTransition } from "react";

import { thankActivity } from "@/app/(app)/activity/actions";
import { useT } from "@/components/I18nProvider";
import { showToast } from "@/components/Toast";
import { haptic } from "@/lib/haptics";

/**
 * "🙏" on someone else's line in the activity feed. One tap, once: it fills
 * in, the count goes up by one, and that person gets a single notification.
 * Routine rung of the ladder — a press and a tiny buzz, nothing celebrates.
 */
export function ThankButton({
  id,
  count,
  thanked,
  name,
}: {
  id: string;
  count: number;
  thanked: boolean;
  /** Who is being thanked — for the accessible label only. */
  name: string;
}) {
  const t = useT();
  const [state, setState] = useState({ count, thanked });
  const [pending, start] = useTransition();

  function onClick() {
    if (state.thanked || pending) return;
    const before = state;
    haptic();
    setState({ count: before.count + 1, thanked: true }); // optimistic
    start(async () => {
      try {
        const r = await thankActivity(id);
        if (r.ok) setState({ count: r.count, thanked: true });
        else {
          setState(before);
          showToast({ message: t(r.error) });
        }
      } catch {
        setState(before);
        showToast({ message: t("Something went wrong. Try again.") });
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state.thanked}
      aria-pressed={state.thanked}
      aria-label={state.thanked ? t("You said thanks to {name}", { name }) : t("Say thanks to {name}", { name })}
      title={state.thanked ? t("Thanks sent") : t("Say thanks")}
      className="thank-btn"
      data-on={state.thanked ? "" : undefined}
    >
      <span aria-hidden>🙏</span>
      {state.count > 0 && <span className="tabular-nums">{state.count}</span>}
    </button>
  );
}
