"use client";

import { useState, useTransition } from "react";

import type { ActionResult } from "@/lib/action-result";
import { useT } from "@/components/I18nProvider";
import { FormPending } from "@/components/SubmitButton";
import { showToast } from "@/components/Toast";

/**
 * A form for a server action that returns `{ error }` (see `formResult`).
 * The message is shown inline, translated — the English text is the key —
 * instead of the action throwing its way to the error page.
 *
 * Submitted through onSubmit rather than `action=` on purpose: React resets
 * an action form's fields whenever the action returns, which would wipe what
 * the person typed on exactly the submits that need correcting. Here fields
 * reset only on success. Pending state reaches <SubmitButton> via context.
 */
export function ActionForm({
  action,
  className,
  children,
}: {
  action: (fd: FormData) => Promise<ActionResult>;
  className?: string;
  children: React.ReactNode;
}) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    start(async () => {
      const res = await action(fd);
      if (res?.error) {
        setError(res.error);
      } else {
        setError(null);
        form.reset();
        // A toast, not a line under the form: a successful submit often
        // re-renders the page around the form (or collapses the section it
        // sits in), and a note in there would vanish with it.
        if (res?.notice) showToast({ message: t(res.notice, res.noticeVars) });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className={className}>
      <FormPending.Provider value={pending}>{children}</FormPending.Provider>
      {error && (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          {t(error)}
        </p>
      )}
    </form>
  );
}
