"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { makeRecurring } from "@/app/(app)/tasks/actions";
import { showToast } from "@/components/Toast";
import { useT } from "@/components/I18nProvider";

type Suggestion = { title: string; count: number; latestId: string };

const DISMISS_KEY = "life-hub:recurring-dismissed";

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function RecurringNudge({ suggestions }: { suggestions: Suggestion[] }) {
  const router = useRouter();
  const t = useT();
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [pending, start] = useTransition();

  useEffect(() => setDismissed(readDismissed()), []);

  const visible = suggestions.filter(
    (s) => !dismissed.includes(s.title.toLowerCase()),
  );
  if (visible.length === 0) return null;
  const s = visible[0];

  function dismiss() {
    const next = [...dismissed, s.title.toLowerCase()];
    setDismissed(next);
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(next.slice(-50)));
    } catch {
      /* ignore */
    }
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
