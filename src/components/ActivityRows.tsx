import Link from "next/link";

import { Avatar } from "@/components/Avatar";
import { ThankButton } from "@/components/ThankButton";
import { activityText, relativeTime, type ActivityRow } from "@/lib/activity";
import type { Lang, T } from "@/lib/i18n";
import { personFirstName, type PersonLike } from "@/lib/people";
import "./social.css";

/**
 * Feed lines — "Chantelle a terminé « Payer Hydro » · il y a 2 h". Shared by
 * the compact card on /today and the full /activity page; a server component,
 * with only the 🙏 button hydrating.
 *
 * Names are display names from the hub's member list (never an address — see
 * lib/people.ts). Someone who has since left the hub reads as "Member".
 * A line is a link only while its item still exists and is visible to the
 * viewer (`links`, from activityLinks).
 */
export function ActivityRows({
  rows,
  links,
  members,
  viewerId,
  now,
  lang,
  t,
  formatMoney,
  time,
}: {
  rows: ActivityRow[];
  links: Map<string, string>;
  members: ({ id: string } & NonNullable<PersonLike>)[];
  viewerId: string;
  now: Date;
  lang: Lang;
  t: T;
  formatMoney: (cents: number) => string;
  /** Override the trailing time (the /activity page shows the clock time under a day heading). */
  time?: (row: ActivityRow) => string;
}) {
  const byId = new Map(members.map((m) => [m.id, m]));
  const nameOf = (id: string) => personFirstName(byId.get(id), t("Member"));

  return (
    <div className="list">
      {rows.map((r) => {
        const actor = byId.get(r.actorId);
        const href = links.get(r.id);
        const body = (
          <>
            <Avatar name={actor?.name} email={actor?.email} size={32} />
            <span className="min-w-0 flex-1">
              <span className="activity-text">{activityText(r, nameOf, t, formatMoney)}</span>
              <span className="activity-time">{time ? time(r) : relativeTime(r.createdAt, now, lang)}</span>
            </span>
          </>
        );
        const mine = r.actorId === viewerId;
        return (
          <div key={r.id} className="activity-row">
            {href ? <Link href={href}>{body}</Link> : <div className="activity-body">{body}</div>}
            {mine ? (
              r.thankedById.length > 0 && (
                <span className="thank-count" title={t("Thanks received")}>
                  <span aria-hidden>🙏</span>
                  <span className="tabular-nums">{r.thankedById.length}</span>
                  <span className="sr-only">{t("Thanks received")}</span>
                </span>
              )
            ) : (
              <ThankButton
                id={r.id}
                count={r.thankedById.length}
                thanked={r.thankedById.includes(viewerId)}
                name={nameOf(r.actorId)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
