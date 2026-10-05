import Link from "next/link";
import { Coins, Gift, Gauge } from "lucide-react";

import { requireUser } from "@/lib/session";
import { getLang, getT } from "@/lib/i18n-server";
import { money } from "@/lib/format";
import { centsToInput } from "@/lib/money";
import {
  creditMarkup,
  creditsEnforced,
  getWallet,
  recentEntries,
  spentThisMonth,
  usageByFeature,
} from "@/lib/credits";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader } from "@/components/SectionHeader";
import { FormSection } from "@/components/Form";
import { stripeConfigured } from "@/lib/billing/stripe";
import { CREDIT_PACKS_CENTS } from "@/lib/billing/plans";
import { buyCredits } from "../billing/actions";
import { Agree } from "../billing/Agree";
import { adminAdjustCredit, setMonthlyLimit } from "./actions";

export const dynamic = "force-dynamic";

const FEATURES: Record<string, string> = {
  assistant: "Assistant",
  quick_add: "Quick add",
  photo: "Photo reading",
  mail: "Mail sorting",
  other: "Other",
};

const KINDS: Record<string, string> = {
  GRANT: "Credit added",
  TOPUP: "Top-up",
  ADJUST: "Adjustment",
  REFUND: "Refund",
};

/**
 * Each person's own Claude credit: what is left, where it went this month,
 * and a ceiling they control. Every AI call in the app is charged to the
 * person who made it (mail sorting to the mailbox's owner).
 */
export default async function CreditsPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const user = await requireUser();
  const [t, lang, { done }] = await Promise.all([getT(), getLang(), searchParams]);
  const locale = user.locale ?? (lang === "fr" ? "fr-CA" : "en-CA");
  const [wallet, spent, byFeature, entries] = await Promise.all([
    getWallet(user.id),
    spentThisMonth(user.id),
    usageByFeature(user.id),
    recentEntries(user.id, 40),
  ]);

  // Calls cost fractions of a cent; show those as "< 0,01 $" rather than 0.
  const fmt = (millicents: number) => {
    const abs = Math.abs(millicents);
    if (abs > 0 && abs < 1000) return (millicents < 0 ? "−" : "") + "< " + money(1, "CAD", locale);
    return money(Math.round(millicents / 1000), "CAD", locale);
  };
  const markup = creditMarkup();
  const low = wallet.balanceMillicents < 50_000;

  return (
    <div className="page">
      <PageHeader back={{ href: "/assistant", label: t("Assistant") }} title={t("Claude credit")} sub={t("Your own balance for the AI features.")} />

      <section className="card p-4">
        <div className="flex items-center gap-3">
          <Coins className="size-6 text-[var(--color-primary)]" aria-hidden />
          <div>
            <p className="text-xs text-[var(--color-text-dim)]">{t("Balance")}</p>
            <p className={`text-2xl font-semibold ${low ? "text-[var(--color-danger)]" : ""}`}>{fmt(wallet.balanceMillicents)}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-[var(--color-text-dim)]">{t("This month")}</p>
            <p className="text-lg font-semibold">{fmt(spent)}</p>
          </div>
        </div>
        {!creditsEnforced() && (
          <p className="mt-3 text-xs text-[var(--color-text-dim)]">{t("Credit is tracked but not enforced on this server.")}</p>
        )}
        {low && (
          <p className="mt-3 text-sm text-[var(--color-danger)]">
            {t("Your credit is almost used up. The assistant stops when it reaches zero; everything else in the app keeps working.")}
          </p>
        )}
      </section>

      {done === "credits" && <p className="card p-4 text-sm">{t("Thank you! Your credits will appear in a few seconds.")}</p>}

      <FormSection title={t("Add credit")}>
        {stripeConfigured() ? (
          <ActionForm action={buyCredits} className="form-stack">
            <p className="field-hint mt-0">
              {t("Paid by card through Stripe, in Canadian dollars. Credit never expires and never reloads on its own; whatever is left is refunded on request if you close your account.")}
            </p>
            <fieldset className="flex flex-wrap gap-3 text-sm">
              <legend className="sr-only">{t("Amount")}</legend>
              {CREDIT_PACKS_CENTS.map((c, i) => (
                <label key={c} className="flex items-center gap-2" htmlFor={`pack-${c}`}>
                  <input id={`pack-${c}`} type="radio" name="cents" value={c} defaultChecked={i === 1} />
                  {money(c, "CAD", locale)}
                </label>
              ))}
            </fieldset>
            <Agree t={t} id="credits" />
            <SubmitButton className="btn btn-primary w-full" pendingLabel="…">
              {t("Buy credit")}
            </SubmitButton>
          </ActionForm>
        ) : (
          <p className="text-sm text-[var(--color-text-dim)]">
            {t("Paying by card is coming soon. Until then, ask the person who runs Life Hub to add credit to your account.")}
          </p>
        )}
      </FormSection>

      <FormSection title={t("Where it went this month")}>
        {byFeature.length === 0 ? (
          <p className="text-sm text-[var(--color-text-dim)]">{t("Nothing spent yet this month.")}</p>
        ) : (
          <ul className="-my-1 divide-y divide-[var(--color-border)]">
            {byFeature.map((f) => (
              <li key={f.feature} className="flex items-center justify-between p-3 text-sm">
                <span>
                  {t(FEATURES[f.feature] ?? FEATURES.other)}
                  <span className="ml-2 text-xs text-[var(--color-text-dim)]">{t("{n} requests", { n: f.calls })}</span>
                </span>
                <span className="font-semibold">{fmt(f.millicents)}</span>
              </li>
            ))}
          </ul>
        )}
      </FormSection>

      <FormSection title={t("Monthly limit")}>
        <ActionForm action={setMonthlyLimit} className="form-stack">
          <label className="text-sm">
            <span className="flex items-center gap-2">
              <Gauge className="size-4" aria-hidden /> {t("Stop the AI features after this much in a month (leave empty for no limit)")}
            </span>
            <input
              name="limit"
              inputMode="decimal"
              className="field mt-1"
              placeholder="10"
              defaultValue={wallet.monthlyLimitCents != null ? centsToInput(wallet.monthlyLimitCents) : ""}
            />
          </label>
          <SubmitButton>{t("Save")}</SubmitButton>
        </ActionForm>
      </FormSection>

      <FormSection title={t("How it is priced")}>
        <p className="text-sm text-[var(--color-text-dim)]">
          {t(
            "Each request is charged by the amount of text Claude reads and writes, at {x}× what Anthropic charges us. The difference pays for running Life Hub. A short question usually costs less than a cent; a long conversation with many steps can cost a few cents.",
            { x: String(markup).replace(".", lang === "fr" ? "," : ".") },
          )}
        </p>
      </FormSection>

      <FormSection title={t("History")}>
        {entries.length === 0 ? (
          <p className="text-sm text-[var(--color-text-dim)]">{t("Nothing yet.")}</p>
        ) : (
          <ul className="-my-1 divide-y divide-[var(--color-border)]">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">
                    {e.kind === "USAGE"
                      ? t(FEATURES[e.feature ?? "other"] ?? FEATURES.other)
                      : e.note === "welcome"
                        ? t("Welcome credit")
                        : t(KINDS[e.kind] ?? "Adjustment")}
                  </span>
                  <span className="block text-xs text-[var(--color-text-dim)]">
                    {e.createdAt.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
                    {e.kind !== "USAGE" && e.note && e.note !== "welcome" ? ` · ${e.note}` : ""}
                  </span>
                </span>
                <span className={`shrink-0 font-semibold ${e.amountMillicents > 0 ? "text-[var(--color-ok)]" : ""}`}>
                  {e.amountMillicents > 0 ? "+" : ""}
                  {fmt(e.amountMillicents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </FormSection>

      {user.role === "ADMIN" && (
        <FormSection title={t("Administrator: add or remove credit")}>
          <ActionForm action={adminAdjustCredit} className="form-stack">
            <input name="who" className="field" placeholder={t("Email or @username")} required />
            <input name="amount" inputMode="decimal" className="field" placeholder={t("Amount, e.g. 5 or -2")} required />
            <input name="note" className="field" placeholder={t("Note (optional)")} maxLength={200} />
            <SubmitButton>{t("Apply")}</SubmitButton>
          </ActionForm>
          <p className="flex items-center gap-2 text-xs text-[var(--color-text-dim)]">
            <Gift className="size-4" aria-hidden /> {t("Every change is recorded with your name.")}
          </p>
        </FormSection>
      )}

      <p className="text-center text-xs text-[var(--color-text-dim)]">
        <Link href="/chats" className="underline">
          {t("Back to chats")}
        </Link>
      </p>
    </div>
  );
}
