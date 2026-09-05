/** Short-lived cookie carrying the OAuth CSRF state between startGoogleConnect
 * and the callback route — shared here since server-action files can only
 * export async functions. */
export const OAUTH_STATE_COOKIE = "mail_oauth_state";
