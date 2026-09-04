import Link from "next/link";

import { listPendingReviews, listVentures } from "@/lib/data";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import type { Draft } from "@/lib/parse";
import { ReviewCard } from "./ReviewCard";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const { user, hub } = await requireHub();
  const [items, ventures] = await withHub(user.id, (tx) =>
    Promise.all([listPendingReviews(tx), listVentures(tx, hub.id)]),
  );
  const vOpts = ventures.map((v) => ({ id: v.id, name: v.name }));

  return (
    <div className="space-y-4 p-3">
      <div>
        <Link href="/today" className="text-xs font-semibold text-[var(--color-text-dim)]">
          ← Today
        </Link>
        <h1 className="mt-1 text-lg font-bold">Review inbox</h1>
        <p className="text-xs text-[var(--color-text-dim)]">
          Parsed from forwarded emails. Nothing here is live until you accept it.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="card p-6 text-center text-sm text-[var(--color-text-dim)]">
          Nothing to review. Forward a bill, renewal notice or booking to{" "}
          <span className="font-semibold">hub@hub.cmacservices.ca</span> and it lands here.
        </p>
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
