"use client";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { useT } from "@/components/I18nProvider";

/**
 * A destructive submit button that asks once, in place. The first tap turns
 * the button into the question ("Confirm delete?") for four seconds; a second
 * tap inside that window submits the surrounding <form>. No dialog: the
 * question appears exactly where the thumb already is, and doing nothing
 * cancels it.
 *
 * Must be rendered inside the <form> whose action deletes (useFormStatus
 * reads the nearest parent form), like <SubmitButton>.
 */
export function ConfirmButton({
  children,
  confirmLabel,
  pendingLabel,
  className = "btn btn-quiet-danger w-full",
  armedClassName = "btn btn-danger w-full",
  windowMs = 4000,
}: {
  children: React.ReactNode;
  /** The question shown while armed. Defaults to "Confirm delete?". */
  confirmLabel?: string;
  pendingLabel?: string;
  className?: string;
  armedClassName?: string;
  windowMs?: number;
}) {
  const t = useT();
  const { pending } = useFormStatus();
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), windowMs);
    return () => clearTimeout(id);
  }, [armed, windowMs]);

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      aria-live="polite"
      data-armed={armed ? "" : undefined}
      className={armed && !pending ? armedClassName : className}
      onClick={(e) => {
        if (armed) return; // second tap: let the form submit
        e.preventDefault();
        setArmed(true);
      }}
      // Losing focus is as clear a "never mind" as waiting.
      onBlur={() => setArmed(false)}
    >
      {pending ? (pendingLabel ?? t("Deleting…")) : armed ? (confirmLabel ?? t("Confirm delete?")) : children}
    </button>
  );
}
