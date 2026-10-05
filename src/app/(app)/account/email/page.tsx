import { MailCheck } from "lucide-react";

import { requireUser } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
import { PageHeader } from "@/components/SectionHeader";
import { SubmitButton } from "@/components/SubmitButton";
import { confirmEmailChange } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Where the confirmation link for a new sign-in address lands. The change
 * happens on the button, not on opening the page: mail scanners open links to
 * check them, and that must not be what switches someone's address.
 */
export default async function ConfirmEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  await requireUser();
  const t = await getT();
  return (
    <div className="page">
      <PageHeader back={{ href: "/account", label: t("Your account") }} title={t("Confirm your new address")} />
      <p className="text-sm text-[var(--color-text-dim)]">
        {t("Once confirmed, sign-in links go to the new address only, and the old one gets a notice.")}
      </p>
      <form action={confirmEmailChange.bind(null, token)}>
        <SubmitButton className="btn btn-primary btn-lg w-full" pendingLabel={t("Saving…")}>
          <MailCheck size={18} strokeWidth={2} aria-hidden />
          {t("Confirm")}
        </SubmitButton>
      </form>
    </div>
  );
}
