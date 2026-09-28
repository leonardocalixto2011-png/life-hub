"use client";

import { useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";

import { makeRecurring } from "@/app/(app)/tasks/actions";
import { showToast } from "@/components/Toast";
import { useT } from "@/components/I18nProvider";

type Suggestion = { title: string; count: number; latestId: string };

const DISMISS_KEY = "life-hub:recurring-dismissed";

// localStorage as an external store. The raw string is the snapshot — stable
// between reads, so no re-render loop — and it is parsed during render. The
// server (and the hydrating client render) see "[]", so markup always matches.
// `memory` keeps a dismissal working for the session when storage is blocked.
const listeners = new Set<() => void>();
let memory = "[]";

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

function readRaw(): string {
  try {
    return localStorage.getItem(DISMISS_KEY) ?? memory;
  } catch {
    return memory;
  }
}

function writeDismissed(list: string[]) {
  memory = JSON.stringify(list.slice(-50));
  try {
    localStorage.setItem(DISMISS_KEY, memory);
  } catch {
    /* private mode / storage blocked — `memory` covers this session */
  }
  listeners.forEach((l) => l());
}

function parseDismissed(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function RecurringNudge({ suggestions }: { suggestions: Suggestion[] }) {
  const router = useRouter();
  const t = useT();
  const dismissed = parseDismissed(useSyncExternalStore(subscribe, readRaw, () => "[]"));
  const [pending, start] = useTransition();

  const visible = suggestions.filter(
    (s) => !dismissed.includes(s.title.toLowerCase()),
  );
  if (visible.length === 0) return null;
  const s = visible[0];

  function dismiss() {
    writeDismissed([...dismissed, s.title.toLowerCase()]);
  }

  function apply(cycle: "weekly" | "monthly") {
    start(async () => {
      await makeRecurring(s.latestId, cycle);
      dismiss();
      showToast({ message: t(cycle === "weekly" ? "“{title}” now repeats weekly" : "“{title}” now repeats monthly", { title: s.title }) });
      router.refresh();
    });
  }

  return (
    <div className="card p-3">
      <p className="text-xs text-[var(--color-text-dim)]">
        {t("You've added")} <span className="font-semibold text-[var(--color-text)]">“{s.title}”</span>{" "}
        {t("{n} times. Make it recurring?", { n: s.count })}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button onClick={() => apply("monthly")} disabled={pending} className="btn btn-primary">
          {t("Monthly")}
        </button>
        <button onClick={() => apply("weekly")} disabled={pending} className="btn">
          {t("Weekly")}
        </button>
        <button onClick={dismiss} disabled={pending} className="btn btn-ghost">
          {t("Not now")}
        </button>
      </div>
    </div>
  );
}
