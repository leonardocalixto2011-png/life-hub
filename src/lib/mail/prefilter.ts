import type { ParsedMessage } from "./types";

/**
 * Decides whether a message is worth spending a classification call on.
 *
 * Every polled message used to hit the AI classifier. In a real inbox that is
 * mostly newsletters, job alerts and delivery-app promos — roughly one message
 * in nine has anything to file — so most of the spend bought nothing.
 *
 * The rule is deliberately lopsided. Wasting a fraction of a cent on a
 * newsletter is trivial; missing a real bill is not. So bulk mail is only
 * skipped when it *also* shows no sign of money or a date, and anything
 * ambiguous is classified. This trades a bit of remaining waste for a much
 * smaller chance of dropping something that mattered.
 */

/** $12.34, 12,345.67 CAD, €50 — any explicit amount. */
const MONEY =
  /(?:[$€£]\s?\d[\d,]*(?:\.\d{2})?)|(?:\d[\d,]*(?:\.\d{2})?\s?(?:CAD|USD|EUR|GBP)\b)/i;

/**
 * Words that mean "someone wants something from you by a date". English and
 * French — this app's users are in Quebec, and a Hydro-Québec bill says
 * "facture", not "invoice".
 */
const ACTIONABLE =
  /\b(invoice|bill|billing|payment|pay|due|overdue|statement|receipt|renew(?:al|s|ing)?|subscription|appointment|reservation|booking|confirm(?:ation)?|balance|past due|amount owing|facture|paiement|payer|échéance|echeance|relev[ée]|rendez-?vous|réservation|reservation|solde|prélèvement|prelevement|montant|dû|impay[ée])\b/i;

export type PrefilterVerdict = {
  classify: boolean;
  /** Why it was skipped — for logging, never shown to a user. */
  reason?: "bulk-no-signal";
};

export function prefilter(message: ParsedMessage): PrefilterVerdict {
  if (!message.isBulk) return { classify: true };

  // Bulk, but check it isn't a renewal notice or a bill dressed as marketing.
  const haystack = `${message.subject}\n${message.snippet}`;
  if (MONEY.test(haystack) || ACTIONABLE.test(haystack)) return { classify: true };

  return { classify: false, reason: "bulk-no-signal" };
}

/**
 * Reads the standard bulk-mail markers. `List-Unsubscribe` (RFC 2369) is the
 * strongest single signal: mailing lists and marketing platforms set it
 * almost universally, while transactional senders — banks, utilities, airlines
 * — generally do not, because you can't unsubscribe from your own bill.
 */
export function detectBulk(header: (name: string) => string | null | undefined): boolean {
  if (header("list-unsubscribe")) return true;
  if (header("list-id")) return true;

  const precedence = (header("precedence") ?? "").toLowerCase();
  if (precedence === "bulk" || precedence === "list" || precedence === "junk") return true;

  // Marketing platforms' own campaign markers.
  if (header("x-campaign-id") || header("x-mailchimp-campaign-id")) return true;

  return false;
}
