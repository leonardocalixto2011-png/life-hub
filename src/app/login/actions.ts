"use server";

import { AuthError } from "next-auth";
import { z } from "zod";

import { signIn, signOut } from "@/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getUser } from "@/lib/session";
import { SIGNED_OUT_LANG_COOKIE } from "@/lib/i18n-server";

const schema = z.object({ email: z.string().email() });

/**
 * Where to land after the link is clicked: the page that sent them to log in
 * (a hub's join link, an address confirmation), when it is one of ours.
 * Only a same-site path is accepted — never another origin, never "//host",
 * which browsers read as one — so this can't become an open redirect.
 */
function safeNext(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !value) return "/today";
  let path = value;
  try {
    const url = new URL(value, "http://local.invalid");
    const app = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");
    if (url.host !== "local.invalid" && url.host !== app.host) return "/today";
    path = url.pathname + url.search;
  } catch {
    return "/today";
  }
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/login") || path.startsWith("/api/")) {
    return "/today";
  }
  return path;
}

export type LoginState = { sent: boolean; error?: string; email?: string; resent?: boolean };

/**
 * The login form's two buttons share one form: "Se connecter" (email +
 * password) and "M'envoyer un lien". Which one was pressed arrives as
 * `intent`.
 */
export async function login(prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = String(formData.get("password") ?? "");
  // No password typed means a link, whichever button (or Enter) sent it:
  // most accounts have no password, and that must keep working as before.
  if (formData.get("intent") === "link" || !password) return requestMagicLink(prev, formData);

  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { sent: false, error: "Enter a valid email address." };
  const email = parsed.data.email.toLowerCase();

  try {
    await signIn("password", { email, password, redirect: false });
  } catch (err) {
    if (err instanceof AuthError) {
      // One message for every failure (no account, no password set, wrong
      // password, too many tries): src/auth.ts keeps them indistinguishable.
      return {
        sent: false,
        email,
        error: "Wrong email or password. No password yet? Get a link by email, then add one under Your account.",
      };
    }
    throw err;
  }
  redirect(safeNext(formData.get("next")));
}

export async function requestMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { sent: false, error: "Enter a valid email address." };
  }

  const email = parsed.data.email.toLowerCase();

  // Rate limits, the account check and the signups switch all live in the
  // provider's sendVerificationRequest (src/auth.ts), so this form and a
  // direct POST to /api/auth/signin/resend are held to the same rules. The
  // response is identical whatever happens there.
  try {
    await signIn("resend", { email, redirect: false, redirectTo: safeNext(formData.get("next")) });
  } catch (err) {
    if (err instanceof AuthError && err.type !== "AccessDenied") {
      return { sent: false, error: "Something went wrong. Try again." };
    }
  }

  return { sent: true, email, resent: formData.get("resend") === "1" };
}

/**
 * Drops a session cookie that no longer maps to an account (the user was
 * deleted, or the database was reseeded under a still-valid JWT). The proxy
 * only checks that a JWT exists while every page needs the database row, so
 * such a cookie used to bounce /today → /login → /today forever.
 *
 * Does nothing for a session that *does* resolve to a user: this action is
 * callable by anyone, and must never be a way to sign a real person out.
 */
export async function clearStaleSession(): Promise<void> {
  if (await getUser()) return;
  await signOut({ redirect: false });
}

/** The login screen's "English / Français" link, for people with no account
 *  yet. A signed-in person's language lives on their profile instead. */
export async function setSignedOutLang(formData: FormData): Promise<void> {
  const lang = formData.get("lang") === "en" ? "en" : "fr";
  const jar = await cookies();
  jar.set(SIGNED_OUT_LANG_COOKIE, lang, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}
