import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { isToday, isYesterday, startOfDay } from "date-fns";

import { ActivityRows } from "@/components/ActivityRows";
import { PageHeader } from "@/components/SectionHeader";
import { ACTIVITY_PAGE_SIZE, recentActivity, type ActivityRow } from "@/lib/activity";
import { hubChrome } from "@/lib/data";
import { money } from "@/lib/format";
import { withHub } from "@/lib/hub-context";
import { fmtDay, fmtTime } from "@/lib/i18n";
import { getLang, getT } from "@/lib/i18n-server";
import { requireHub } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Everything the hub did lately, newest first, a day at a time, 30 to a page. */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const { user, hub } = await requireHub();
  const sp = await searchParams;
  const page = Math.max(1, Math.min(500, Number.parseInt(sp.p ?? "1", 10) || 1));
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const now = new Date();

  const [{ rows, hasMore, links }, { members }] = await Promise.all([
    withHub(user.id, (tx) =>
      recentActivity(tx, hub.id, user.id, {
        take: ACTIVITY_PAGE_SIZE,
        skip: (page - 1) * ACTIVITY_PAGE_SIZE,
      }),
    ),
    hubChrome(user.id, hub.id),
  ]);

  // Rows arrive newest first, so each day's lines are already together.
  const days: { key: number; label: string; rows: ActivityRow[] }[] = [];
  for (const r of rows) {
    const key = startOfDay(r.createdAt).getTime();
    const last = days[days.length - 1];
    if (last?.key === key) last.rows.push(r);
    else {
      const label = isToday(r.createdAt)
        ? t("Today")
        : isYesterday(r.createdAt)
          ? t("Yesterday")
          : fmtDay(r.createdAt, lang);
      days.push({ key, label, rows: [r] });
    }
  }

  const locale = user.locale ?? "en-CA";
  const alone = members.length < 2;

  return (
    <div className="page">
      <PageHeader
        back={{ href: "/today", label: t("Today") }}
        title={t("Activity")}
        sub={t("Who did what in {hub} — the last 90 days.", { hub: hub.name })}
      />

      {rows.length === 0 ? (
        <div className="card p-4 text-sm text-[var(--color-text-dim)]">
          {page > 1
            ? t("Nothing further back.")
            : alone
              ? t("What you add and finish shows up here. Invite someone to this hub and you'll see what they do too.")
              : t("Nothing yet. What you and the others add or finish shows up here.")}
        </div>
      ) : (
        days.map((d) => (
          <section key={d.key}>
            <h2 className="section-title mb-2 px-1 first-letter:uppercase">{d.label}</h2>
            <ActivityRows
              rows={d.rows}
              links={links}
              members={members}
              viewerId={user.id}
              now={now}
              lang={lang}
              t={t}
              formatMoney={(c) => money(c, hub.currency, locale)}
              time={(r) => fmtTime(r.createdAt, lang)}
            />
          </section>
        ))
      )}

      {(page > 1 || hasMore) && (
        <nav className="flex items-center justify-between px-1" aria-label={t("Pages")}>
          {page > 1 ? (
            <Link href={page === 2 ? "/activity" : `/activity?p=${page - 1}`} className="section-link">
              <ChevronLeft size={14} strokeWidth={2.25} aria-hidden />
              {t("Newer")}
            </Link>
          ) : (
            <span />
          )}
          {hasMore ? (
            <Link href={`/activity?p=${page + 1}`} className="section-link">
              {t("Older")}
              <ChevronRight size={14} strokeWidth={2.25} aria-hidden />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
