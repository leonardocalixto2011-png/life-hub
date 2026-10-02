/**
 * The version of the privacy policy / terms currently in force. Stamped on
 * every row of the consent ledger (`Consent.policyVersion`), so it is possible
 * to say later exactly which text a person agreed to.
 *
 * Bump it whenever the published text changes in a way that affects what
 * people consented to. A plain module: imported by server code and by the
 * legal pages alike.
 */
export const POLICY_VERSION = "2026-10-01-draft";

/** "Last updated" date for the legal pages (ISO, date only). */
export const POLICY_UPDATED = "2026-10-01";

/** True once the owner has pasted the final text and set LEGAL_PUBLISHED=1. */
export function legalPublished(): boolean {
  return process.env.LEGAL_PUBLISHED === "1";
}
