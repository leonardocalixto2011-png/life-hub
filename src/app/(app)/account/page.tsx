import Link from "next/link";

import { requireUser } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
import { deleteMyAccount } from "./actions";

export const dynamic = "force-dynamic";

/**
 * The two rights that need a working button rather than a paragraph in a
 * policy: get a copy of your data, and have it erased.
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const t = await getT();

  return (
    <div className="space-y-4 p-3">
      <div>
        <Link href="/today" className="text-xs font-semibold text-[var(--color-text-dim)]">
          ← {t("Today")}
        </Link>
        <h1 className="mt-1 text-lg font-bold">{t("Your account")}</h1>
        <p className="text-xs text-[var(--color-text-dim)]">
          {t("Signed in as {email}.", { email: user.email })}
        </p>
      </div>

      {sp.error && (
        <div className="card border-[var(--color-danger)] p-3 text-xs text-[var(--color-danger)]">
          {sp.error}
        </div>
      )}

      <section className="card space-y-2 p-3">
        <div className="text-xs font-semibold">{t("Download your data")}</div>
        <p className="text-[0.68rem] text-[var(--color-text-dim)]">
          {t("A JSON file with everything Life Hub holds about you — tasks, events, budget entries, subscriptions, debts, hub memberships and settings. Mailbox passwords and push endpoints are left out on purpose.")}
        </p>
        <a href="/api/account/export" className="btn w-full" download>
          {t("Download JSON")}
        </a>
      </section>

      <section className="card space-y-2 p-3">
        <div className="text-xs font-semibold text-[var(--color-danger)]">{t("Delete your account")}</div>
        <p className="text-[0.68rem] text-[var(--color-text-dim)]">
          {t("Permanent, and there is no undo. Your debts, mailbox connections, notification settings and personal hubs are destroyed.")}
        </p>
        <p className="text-[0.68rem] text-[var(--color-text-dim)]">
          {t("Things you created in a hub you share with other people — tasks, events, budget entries — stay, with your name removed. A shared hub you own passes to its longest-standing member; if you're its only member it's deleted with everything in it.")}
        </p>
        <form action={deleteMyAccount} className="space-y-2">
          <label className="block text-[0.68rem] font-semibold text-[var(--color-text-dim)]">
            {t("Type {email} to confirm", { email: user.email })}
            <input
              name="confirmEmail"
              autoComplete="off"
              required
              className="field mt-1"
              placeholder={user.email}
            />
          </label>
          <button type="submit" className="btn w-full text-[var(--color-danger)]">
            {t("Delete my account permanently")}
          </button>
        </form>
      </section>
    </div>
  );
}
