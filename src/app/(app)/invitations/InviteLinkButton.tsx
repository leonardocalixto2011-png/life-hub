"use client";

import { useState, useTransition } from "react";
import { Link2 } from "lucide-react";

import { CopyField } from "@/components/CopyField";
import { useT } from "@/components/I18nProvider";
import { createInviteLink } from "./actions";

/**
 * Makes an invitation link and shows it once. It can't be shown again (only
 * a hash is kept), which the hint says, so nobody hunts for it later.
 */
export function InviteLinkButton({ disabled }: { disabled: boolean }) {
  const t = useT();
  const [pending, start] = useTransition();
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="form-stack">
      {link ? (
        <>
          <CopyField value={link} label={t("Invitation link")} />
          <p className="field-hint mt-0">
            {t("Send it to one person. It works once, for 14 days, and won't be shown again here.")}
          </p>
        </>
      ) : (
        <button
          type="button"
          className="btn btn-secondary w-full"
          disabled={pending || disabled}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await createInviteLink();
              if (r.link) setLink(r.link);
              else setError(r.error ?? "Could not create the link.");
            })
          }
        >
          <Link2 size={16} strokeWidth={2} aria-hidden />
          {pending ? t("Creating…") : t("Create an invitation link")}
        </button>
      )}
      {error && (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          {t(error)}
        </p>
      )}
    </div>
  );
}
