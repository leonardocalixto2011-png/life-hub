import { unstable_rethrow } from "next/navigation";

/**
 * What a form-driven server action hands back instead of throwing. A thrown
 * error from a server action lands on the error page — and in production Next
 * replaces its message with a generic one anyway — so an action a person can
 * trip with ordinary input ("Pick a date") returns the message instead, and
 * `<ActionForm>` shows it inline under the form.
 */
export type ActionResult = {
  error?: string;
  /**
   * Something worth saying after a *successful* submit ("dates were moved to
   * match your trip"). English text that doubles as the i18n key, like
   * `error`; `<ActionForm>` shows it as a toast.
   */
  notice?: string;
  noticeVars?: Record<string, string | number>;
};

/**
 * Runs an action body, turning a *plain* `Error` — the user-facing messages
 * this codebase throws, English text that doubles as the i18n key — into
 * `{ error }`. Anything else (redirect / notFound signals, ZodError from a
 * tampered id, Prisma errors whose messages carry internals) is rethrown
 * untouched, so nothing internal ever reaches the screen.
 */
export async function formResult(fn: () => Promise<void | ActionResult>): Promise<ActionResult> {
  try {
    return (await fn()) ?? {};
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof Error && e.constructor === Error) return { error: e.message };
    throw e;
  }
}
