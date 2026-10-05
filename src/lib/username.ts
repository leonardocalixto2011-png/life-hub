/**
 * Usernames — a person's handle (@marie). Plain module, used on the server to
 * validate and in the browser to give feedback while typing.
 *
 * Stored lowercase, so "Marie" and "marie" are the same handle and the unique
 * index on User.username is case-insensitive in practice. Letters, digits, dot
 * and underscore; 3 to 24 characters; starts and ends with a letter or digit.
 * No accents: a handle is typed by other people on other keyboards.
 *
 * A handle is semi-public by design — it is how an owner invites someone to a
 * hub without knowing their address. It is never a sign-in identifier: the
 * email address stays the only thing that receives a link.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 24;

const PATTERN = /^[a-z0-9](?:[a-z0-9._]*[a-z0-9])?$/;

/**
 * Handles nobody may take: they would read as the app speaking, or as a role.
 * Compared after normalising, so dots and underscores don't get around it.
 */
const RESERVED = new Set([
  "admin", "administrator", "root", "system", "support", "help", "aide", "info",
  "lifehub", "life_hub", "life.hub", "hub", "hubs", "staff", "team", "equipe",
  "moderator", "mod", "security", "securite", "privacy", "confidentialite",
  "noreply", "no_reply", "postmaster", "abuse", "billing", "facturation",
  "claude", "anthropic", "null", "undefined", "me", "moi", "you", "toi",
  "everyone", "tous", "owner", "proprietaire", "member", "membre",
]);

/** Lowercase, trimmed, leading "@" dropped. Does not validate. */
export function normalizeUsername(input: string): string {
  return input.trim().replace(/^@+/, "").toLowerCase();
}

export type UsernameProblem = "length" | "chars" | "reserved";

/** Null when `name` (already normalised) is acceptable. */
export function usernameProblem(name: string): UsernameProblem | null {
  if (name.length < USERNAME_MIN || name.length > USERNAME_MAX) return "length";
  if (!PATTERN.test(name) || /[._]{2}/.test(name)) return "chars";
  if (RESERVED.has(name) || RESERVED.has(name.replace(/[._]/g, ""))) return "reserved";
  return null;
}

/** The English message for a problem; the text is also the i18n key. */
export function usernameMessage(problem: UsernameProblem): string {
  switch (problem) {
    case "length":
      return "A username is 3 to 24 characters.";
    case "chars":
      return "Use letters, digits, dots or underscores — starting and ending with a letter or digit.";
    case "reserved":
      return "That username is reserved. Pick another one.";
  }
}

/**
 * A starting suggestion from a display name: "Chantelle Côté" → "chantelle.cote".
 * Only a suggestion — availability is checked when it is saved.
 */
export function suggestUsername(name: string | null | undefined, email?: string | null): string {
  const base = (name?.trim() || email?.split("@")[0] || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^[._]+|[._]+$/g, "")
    .replace(/[._]{2,}/g, ".")
    .slice(0, USERNAME_MAX)
    .replace(/[._]+$/, "");
  return usernameProblem(base) === null ? base : "";
}
