"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { updateNotificationPrefs } from "./actions";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="btn btn-primary mt-3 w-full">
      {pending ? "Saving…" : "Save digest settings"}
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
  const detected =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : timezone;
  const [tz, setTz] = useState(timezone || detected);

  return (
    <form action={updateNotificationPrefs} className="card p-4">
      <p className="text-sm font-semibold">Daily email digest</p>
      <p className="mt-1 text-xs text-[var(--color-text-dim)]">
        A once-a-day summary of everything due in the next 48 hours — the safety net
        if push isn’t working.
      </p>

      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="emailDigestEnabled"
          defaultChecked={emailDigestEnabled}
        />
        Email me the daily digest
      </label>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-xs font-semibold text-[var(--color-text-dim)]">
          Preferred hour
          <select
            name="digestHour"
            defaultValue={String(digestHour)}
            className="field mt-1"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-[var(--color-text-dim)]">
          Time zone
          <input
            name="timezone"
            value={tz}
            onChange={(e) => setTz(e.target.value)}
            className="field mt-1"
          />
        </label>
      </div>

      <p className="mt-2 text-[0.7rem] text-[var(--color-text-dim)]">
        Note: on the current hosting plan the digest is sent once daily at a fixed
        time for everyone — your preferred hour is saved for when per-user timing is
        enabled.
      </p>

      <SaveButton />
    </form>
  );
}
