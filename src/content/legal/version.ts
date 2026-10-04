import { PRIVACY } from "./privacy";
import { TERMS } from "./terms";

/**
 * The version of the privacy policy / terms currently in force. Stamped on
 * every row of the consent ledger (`Consent.policyVersion`), so it is possible
 * to say later exactly which text a person agreed to.
 *
 * Bump it whenever the published text changes in a way that affects what
 * people consented to. A plain module: imported by server code and by the
 * legal pages alike.
 */
export const POLICY_VERSION = "2026-10-04-draft";

/** "Last updated" date for the legal pages (ISO, date only). */
export const POLICY_UPDATED = "2026-10-04";

/**
 * True once the owner has set LEGAL_PUBLISHED=1 AND the text can actually
 * stand as published: no section still marked `placeholder`, and the
 * business and privacy-officer details the pages display (Law 25 s. 3.2)
 * are set. Signup is gated on this (src/lib/signup.ts), so one variable
 * flipped early in Vercel must not be enough to open the doors.
 */
export function legalPublished(): boolean {
  if (process.env.LEGAL_PUBLISHED !== "1") return false;
  const draft = [...PRIVACY.sections, ...TERMS.sections].some((s) => s.placeholder);
  const officer = ["LEGAL_ENTITY_NAME", "LEGAL_ADDRESS", "PRIVACY_OFFICER_TITLE", "PRIVACY_OFFICER_EMAIL"].every(
    (name) => Boolean(process.env[name]?.trim()),
  );
  return !draft && officer;
}
