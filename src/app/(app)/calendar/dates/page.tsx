import Link from "next/link";
import { format } from "date-fns";

import { listSpecialDates, nextOccurrence, SPECIAL_EMOJI, specialMeta } from "@/lib/plans";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { countdownLabel } from "@/lib/format";
import { SpecialDateForm } from "./SpecialDateForm";
import { deleteSpecialDate } from "./actions";

export const dynamic = "force-dynamic";

export default async function SpecialDatesPage() {
  const { user, hub } = await requireHub();
  const rows = await withHub(user.id, (tx) => listSpecialDates(tx, hub.id, user.id));

  const now = new Date();
  const dates = rows
    .map((s) => {
      const next = nextOccurrence(s.month, s.day, now);
      return { s, next, meta: specialMeta(s, next) };
    })
    .sort((a, b) => a.next.getTime() - b.next.getTime());

  return (
    <div className="space-y-4 p-3">
      <Link href="/calendar" className="text-xs font-semibold text-[var(--color-text-dim)]">
        ← Calendar
      </Link>
      <div>
        <h1 className="text-lg font-bold">Special dates</h1>
        <p className="text-[0.68rem] text-[var(--color-text-dim)]">
          Birthdays and anniversaries come back every year, with reminders. Holidays like
          Saint-Valentin and Noël already show on the calendar
          {hub.showOccasions ? "" : " — turned off for this hub (members page)"}.
        </p>
      </div>

      <SpecialDateForm />

      {dates.length === 0 ? (
        <p className="card p-6 text-center text-sm text-[var(--color-text-dim)]">
          Nothing yet. Start with the birthdays you can&apos;t afford to forget.
        </p>
      ) : (
        <div className="card divide-y divide-[var(--color-border)]">
          {dates.map(({ s, next, meta }) => (
            <div key={s.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {SPECIAL_EMOJI[s.kind]} {s.title}
                </div>
                <div className="text-[0.7rem] text-[var(--color-text-dim)]">
                  {format(next, "EEEE, MMM d")}
                  {meta ? ` · ${meta}` : ""}
                  {s.visibility === "PRIVATE" ? " · private" : ""}
                </div>
                {s.notes && (
                  <div className="mt-0.5 text-[0.7rem] text-[var(--color-text-dim)]">{s.notes}</div>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-xs font-semibold">{countdownLabel(next)}</span>
                <form action={deleteSpecialDate}>
                  <input type="hidden" name="id" value={s.id} />
                  <button className="text-[0.62rem] font-semibold text-[var(--color-text-dim)] underline">
                    delete
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
