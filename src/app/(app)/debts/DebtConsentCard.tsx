import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import type { T } from "@/lib/i18n";
import { SubmitButton } from "@/components/SubmitButton";
import { acceptDebtConsent } from "./actions";

/**
 * The gate in front of the debt tracker (Québec Law 25: debts and default
 * status are sensitive, so consent must be express and given separately from
 * everything else). Shown before a first debt, and to people who already had
 * debts when this was introduced — their debts stay off the page until they
 * agree.
 *
 * Both boxes start unchecked and are `required`, so the browser refuses to
 * submit without them; `acceptDebtConsent` and `createDebt` re-check on the
 * server. No client JavaScript is involved in giving consent.
 */
export function DebtConsentCard({
  t,
  existingCount,
  alreadyAdult,
}: {
  t: T;
  /** Debts this person already had before consenting (0 for a newcomer). */
  existingCount: number;
  /** They attested to being 18+ elsewhere (mail analysis) — don't ask twice. */
  alreadyAdult: boolean;
}) {
  return (
    <form action={acceptDebtConsent} className="form-card" aria-labelledby="debt-consent-title">
      <div className="flex items-start gap-3">
        <span className="icon-tile shrink-0" aria-hidden>
          <ShieldCheck size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h2 id="debt-consent-title" className="text-base font-bold">
            {t("Before you track debts")}
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-dim)]">
            {t("Debts — and whether one is in default — are sensitive information. Here is what happens to them:")}
          </p>
        </div>
      </div>

      <ul className="list-disc space-y-1.5 pl-5 text-sm">
        <li>{t("Only you see them. Being in a hub shows them to nobody; sharing is a separate choice you make hub by hub.")}</li>
        <li>{t("They are never sold and never used for advertising.")}</li>
        <li>{t("You can download or delete them at any time from Your account.")}</li>
        <li>{t("This part of Life Hub is for adults: you must be 18 or older.")}</li>
      </ul>

      {existingCount > 0 && (
        <p className="text-sm font-semibold">
          {existingCount === 1
            ? t("You already have 1 debt here. It stays hidden on this page until you agree.")
            : t("You already have {n} debts here. They stay hidden on this page until you agree.", {
                n: existingCount,
              })}
        </p>
      )}

      <label className="check-row items-start">
        <input type="checkbox" name="consent" required className="mt-0.5" />
        <span>{t("I agree to Life Hub keeping my debts, including whether they are in default, so I can track them.")}</span>
      </label>
      {!alreadyAdult && (
        <label className="check-row items-start">
          <input type="checkbox" name="age18" required className="mt-0.5" />
          <span>{t("I am 18 or older.")}</span>
        </label>
      )}

      <SubmitButton className="btn btn-primary btn-lg w-full" pendingLabel={t("Saving…")}>
        {t("I agree")}
      </SubmitButton>
      <p className="field-hint mt-0">
        {t("You can withdraw this later, at the bottom of this page.")}{" "}
        <Link href="/confidentialite" className="underline">
          {t("Privacy policy")}
        </Link>
      </p>
    </form>
  );
}
