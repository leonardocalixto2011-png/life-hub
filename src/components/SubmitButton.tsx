"use client";

import { createContext, useContext } from "react";
import { useFormStatus } from "react-dom";

import { useT } from "@/components/I18nProvider";

/** Pending state for forms that submit via onSubmit (see ActionForm), where useFormStatus can't see it. */
export const FormPending = createContext(false);

/**
 * A form's submit button that disables itself while the server action runs —
 * a second tap on a slow phone connection otherwise submits twice (two tasks,
 * two budget entries). Must be rendered *inside* the <form>: useFormStatus
 * reads the nearest parent form.
 *
 * Works from server components too: pass the already-translated label, and
 * `pendingLabel` if "Saving…" doesn't fit (e.g. "Deleting…").
 */
export function SubmitButton({
  children,
  pendingLabel,
  className = "btn btn-primary",
  disabled,
  ...rest
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> & { pendingLabel?: string }) {
  const status = useFormStatus();
  const ctxPending = useContext(FormPending);
  const pending = status.pending || ctxPending;
  const t = useT();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending || undefined}
      className={className}
      {...rest}
    >
      {pending ? (pendingLabel ?? t("Saving…")) : children}
    </button>
  );
}
