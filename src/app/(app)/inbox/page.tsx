import Link from "next/link";

import { hubChrome, listPendingReviews } from "@/lib/data";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
import type { Draft } from "@/lib/parse";
import { ReviewCard } from "./ReviewCard";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const { user, hub } = await requireHub();
  const t = await getT();
  const [items, { ventures }] = await Promise.all([
    withHub(user.id, (tx) => listPendingReviews(tx, user.id)),
    hubChrome(user.id, hub.id),
  ]);
  const vOpts = ventures.map((v) => ({ id: v.id, name: v.name }));

  return (
    <div className="page">
      <div>
        <Link href="/today" className="back-link">
          {t("Today")}
        </Link>
        <h1 className="display mt-1 text-2xl">
          {items.length === 0 ? t("Nothing to review.") : t("{n} to review", { n: items.length })}
        </h1>
        <p className="text-xs text-[var(--color-text-dim)]">
          {t("Parsed from forwarded emails. Nothing here is live until you accept it.")}
        </p>
      </div>

      {items.length === 0 ? (
        // An empty review inbox is the app working, not a gap to apologise
        // for — so it explains how mail gets here rather than restating that
        // there is none.
        <div className="card p-6 text-center">
          <p className="mx-auto max-w-[34ch] text-sm text-[var(--color-text-dim)]">
            {t("Forward a bill, renewal notice or booking to this hub's address and it lands here as a draft for you to check.")}
          </p>
          <Link
            href="/mail"
            className="mt-3 inline-block text-xs font-semibold text-[var(--color-primary)]"
          >
            {t("Find the address →")}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <ReviewCard
              key={it.id}
              ventures={vOpts}
              item={{
                id: it.id,
                source: it.source,
                fromAddress: it.fromAddress,
                sourceSnippet: it.sourceSnippet,
                note: it.note,
                createdAt: it.createdAt,
                draft: it.draft as unknown as Draft,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
