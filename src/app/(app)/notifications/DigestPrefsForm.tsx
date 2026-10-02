"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { useT } from "@/components/I18nProvider";
import { updateNotificationPrefs } from "./actions";

function SaveButton() {
  const { pending } = useFormStatus();
  const t = useT();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary mt-3 w-full">
      {pending ? t("Saving…") : t("Save digest settings")}
    </button>
  );
}

export function DigestPrefsForm({
  emailDigestEnabled,
  digestHour,
  timezone,
}: {
  emailDigestEnabled: boolean;
  digestHour: number;
  timezone: string;
}) {
  const t = useT();
  const detected =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : timezone;
  const [tz, setTz] = useState(timezone || detected);

  return (
    <form action={updateNotificationPrefs} className="card p-4">
      <p className="text-sm font-semibold">{t("Daily email digest")}</p>
      <p className="mt-1 text-xs text-[var(--color-text-dim)]">
        {t("A once-a-day summary of everything due in the next 48 hours — the safety net if push isn’t working.")}
      </p>

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="emailDigestEnabled"
          defaultChecked={emailDigestEnabled}
        />
        {t("Email me the daily digest")}
      </label>

      {/* No hour picker: the digest runs from one daily cron, so a "preferred
          hour" control did nothing however it was set. The stored value rides
          along unchanged for the day per-person timing exists. */}
      <input type="hidden" name="digestHour" value={digestHour} />
      <label className="mt-3 block text-xs font-semibold text-[var(--color-text-dim)]">
        {t("Time zone")}
        <input
          name="timezone"
          value={tz}
          onChange={(e) => setTz(e.target.value)}
          className="field mt-1"
        />
      </label>

      <p className="mt-2 text-[0.7rem] text-[var(--color-text-dim)]">
        {t("The digest goes out once a day, in the morning, at the same time for everyone — the hour can't be chosen yet.")}
      </p>

      <SaveButton />
    </form>
  );
}
