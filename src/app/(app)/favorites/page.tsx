import Link from "next/link";
import { CalendarDays, ChevronDown, ChevronUp, CircleCheck, Wallet } from "lucide-react";

import { requireHub } from "@/lib/session";
import { hubChrome } from "@/lib/data";
import { getT } from "@/lib/i18n-server";
import { centsToInput } from "@/lib/money";
import { FAVORITE_CAP } from "@/lib/favorites";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { createFavorite, deleteFavorite, moveFavorite, updateFavorite } from "./actions";

export const dynamic = "force-dynamic";

const KIND_ICON = { BUDGET: Wallet, TASK: CircleCheck, EVENT: CalendarDays } as const;

export default async function FavoritesPage() {
  const { user, hub } = await requireHub();
  const t = await getT();
  // Same cached lookup the layout already made for the chip row.
  const { favorites, ventures } = await hubChrome(user.id, hub.id);
  const label = "block text-xs font-semibold text-[var(--color-text-dim)]";
  const small = "inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-dim)]";

  return (
    <div className="page">
      <div>
        <Link href="/today" className="back-link">
          {t("Today")}
        </Link>
        <h1 className="page-title">{t("Favourites")}</h1>
        <p className="page-sub">
          {t("Things you log all the time. One tap under the quick-add box adds them for today. Only you see yours.")}
        </p>
      </div>

      {favorites.length === 0 ? (
        <p className="card px-5 py-8 text-center text-sm text-[var(--color-text-dim)]">
          {t("No favourites yet. Add one below, or tap “⭐ Save as favourite” after a quick-add.")}
        </p>
      ) : (
        <ul className="list">
          {favorites.map((f, i) => (
            <li key={f.id} className="space-y-2 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className={small}>
                  {(() => {
                    const Icon = KIND_ICON[f.kind];
                    return <Icon size={14} strokeWidth={2} aria-hidden />;
                  })()}
                  {f.kind === "BUDGET"
                    ? f.entryType === "INCOME"
                      ? t("Income")
                      : t("Expense")
                    : f.kind === "EVENT"
                      ? t("Event")
                      : t("Task")}
                </span>
                <div className="flex items-center gap-1">
                  <form action={moveFavorite}>
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="dir" value="up" />
                    <SubmitButton className="btn btn-ghost btn-sm btn-icon w-9" disabled={i === 0} pendingLabel="…" aria-label={t("Move up")}>
                      <ChevronUp size={18} strokeWidth={2.25} aria-hidden />
                    </SubmitButton>
                  </form>
                  <form action={moveFavorite}>
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="dir" value="down" />
                    <SubmitButton
                      className="btn btn-ghost btn-sm btn-icon w-9"
                      disabled={i === favorites.length - 1}
                      pendingLabel="…"
                      aria-label={t("Move down")}
                    >
                      <ChevronDown size={18} strokeWidth={2.25} aria-hidden />
                    </SubmitButton>
                  </form>
                  <form action={deleteFavorite}>
                    <input type="hidden" name="id" value={f.id} />
                    <SubmitButton className="btn btn-ghost btn-sm text-[var(--color-danger)]" pendingLabel="…">
                      {t("delete")}
                    </SubmitButton>
                  </form>
                </div>
              </div>
              {/* Keyed on the saved values so a successful save remounts with them. */}
              <ActionForm
                key={`${f.label}|${f.amountCents ?? ""}`}
                action={updateFavorite}
                className="flex items-end gap-2"
              >
                <input type="hidden" name="id" value={f.id} />
                <input name="label" defaultValue={f.label} maxLength={60} required className="field min-w-0 flex-1" aria-label={t("Name")} />
                <input
                  name="amount"
                  defaultValue={centsToInput(f.amountCents)}
                  inputMode="decimal"
                  placeholder="$"
                  className="field w-20"
                  aria-label={t("Amount")}
                />
                <SubmitButton className="btn shrink-0 px-3">{t("Save")}</SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      )}

      {favorites.length < FAVORITE_CAP ? (
        <ActionForm action={createFavorite} className="card space-y-3 p-4">
          <div className="text-sm font-semibold">{t("Add a favourite")}</div>
          <label className={label}>
            {t("Name")}
            <input name="label" required maxLength={60} className="field mt-1" placeholder={t("Gas, Coffee, Metro groceries…")} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className={label}>
              {t("What it adds")}
              <select name="kind" defaultValue="BUDGET" className="field mt-1">
                <option value="BUDGET">{t("Budget entry")}</option>
                <option value="TASK">{t("Task")}</option>
                <option value="EVENT">{t("Event")}</option>
              </select>
            </label>
            <label className={label}>
              {t("Amount")}
              <input name="amount" inputMode="decimal" className="field mt-1" placeholder="60" />
            </label>
            <label className={label}>
              {t("Expense or income")}
              <select name="entryType" defaultValue="EXPENSE" className="field mt-1">
                <option value="EXPENSE">{t("Expense")}</option>
                <option value="INCOME">{t("Income")}</option>
              </select>
            </label>
            <label className={label}>
              {t("Venture")}
              <select name="ventureId" defaultValue="" className="field mt-1">
                <option value="">—</option>
                {ventures.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className={label}>
            {t("Budget category (optional)")}
            <input name="category" maxLength={60} className="field mt-1" placeholder={t("Defaults to the name")} />
          </label>
          <p className="text-[0.68rem] text-[var(--color-text-dim)]">
            {t("Budget favourites need an amount. “Expense or income” only matters for budget entries.")}
          </p>
          <SubmitButton className="btn btn-primary w-full">{t("Add favourite")}</SubmitButton>
        </ActionForm>
      ) : (
        <p className="text-center text-xs text-[var(--color-text-dim)]">
          {t("You can keep up to 12 favourites per hub. Delete one first.")}
        </p>
      )}
    </div>
  );
}
