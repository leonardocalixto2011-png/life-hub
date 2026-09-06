"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { buildAuthUrl, googleOAuthConfigured } from "@/lib/mail/google";
import {
  buildAuthUrl as buildMicrosoftAuthUrl,
  microsoftOAuthConfigured,
} from "@/lib/mail/microsoft";
import { OAUTH_STATE_COOKIE } from "@/lib/mail/constants";
import { encrypt } from "@/lib/mail/crypto";
import { testImapLogin } from "@/lib/mail/imap";

/**
 * Starts the Gmail connect flow. The state value is stashed in a short-lived
 * httpOnly cookie so the callback route (a separate, unauthenticated-by-
 * design request from Google) can verify it wasn't forged — standard OAuth
 * CSRF protection since there's no session to tie the callback to otherwise.
 */
export async function startGoogleConnect() {
  await requireHub();
  if (!googleOAuthConfigured()) {
    throw new Error("Google OAuth isn't configured yet (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET).");
  }

  const state = randomBytes(24).toString("hex");
  const store = await cookies();
  store.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  redirect(buildAuthUrl(state));
}

/**
 * Same CSRF state-cookie pattern as startGoogleConnect — reused rather than
 * duplicated since only one connect flow is ever in flight per browser.
 */
export async function startMicrosoftConnect() {
  await requireHub();
  if (!microsoftOAuthConfigured()) {
    throw new Error("Microsoft OAuth isn't configured yet (MICROSOFT_CLIENT_ID/MICROSOFT_CLIENT_SECRET).");
  }

  const state = randomBytes(24).toString("hex");
  const store = await cookies();
  store.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  redirect(buildMicrosoftAuthUrl(state));
}

const ImapConnectSchema = z.object({
  provider: z.enum(["YAHOO", "GMAIL_IMAP"]),
  email: z.string().email(),
  appPassword: z.string().min(1),
});

/**
 * No OAuth redirect here — an app password is a static credential the user
 * pastes in directly. Yahoo has no self-serve OAuth2+IMAP access at all; for
 * Gmail this is the deliberate escape from OAuth "Testing" mode, whose refresh
 * tokens expire every 7 days and break the background poller (going to
 * Production instead would need Google verification plus a CASA assessment,
 * since gmail.readonly is a restricted scope).
 *
 * Verifies the credentials actually work before saving, so a typo surfaces
 * immediately instead of as a silent poll failure later.
 */
export async function connectImapAccount(formData: FormData) {
  const { user, hub } = await requireHub();

  const parsed = ImapConnectSchema.safeParse({
    provider: formData.get("provider"),
    email: formData.get("email"),
    appPassword: formData.get("appPassword"),
  });
  if (!parsed.success) {
    redirect("/mail?error=" + encodeURIComponent("Enter a valid email and app password."));
  }
  const { provider, email, appPassword } = parsed.data;

  try {
    await testImapLogin(provider, email, appPassword);
  } catch (err) {
    // Never pass the underlying IMAP error text through — unlike an OAuth
    // error, it can echo something close to the credential itself. The error
    // *code* is safe though, and worth branching on: reporting "check your
    // password" when the real problem was a network timeout sends someone
    // hunting a bug that isn't there.
    const code = (err as { code?: string })?.code ?? "";
    const timedOut = code === "ETIMEOUT" || code === "ETIMEDOUT" || code === "ECONNREFUSED";
    redirect(
      "/mail?error=" +
        encodeURIComponent(
          timedOut
            ? "Couldn't reach the mail server — that's a connection problem, not your password. Try again in a moment."
            : "Couldn't verify that email/app password. Make sure it's an app password (not your normal one) and that two-step verification is on.",
        ),
    );
  }

  await withHub(user.id, (tx) =>
    tx.mailAccount.upsert({
      where: { provider_emailAddress: { provider, emailAddress: email } },
      update: {
        userId: user.id,
        hubId: hub.id,
        appPasswordEnc: encrypt(appPassword),
        status: "ACTIVE",
        lastError: null,
      },
      create: {
        userId: user.id,
        hubId: hub.id,
        provider,
        emailAddress: email,
        appPasswordEnc: encrypt(appPassword),
      },
    }),
  );

  revalidatePath("/mail");
  redirect("/mail?connected=" + encodeURIComponent(email));
}

export async function disconnectMailAccount(id: string) {
  const { user } = await requireHub();
  const parsedId = z.string().cuid().parse(id);
  await withHub(user.id, (tx) => tx.mailAccount.delete({ where: { id: parsedId } }));
  revalidatePath("/mail");
}

export async function removeTrustedSender(id: string) {
  const { user } = await requireHub();
  const parsedId = z.string().cuid().parse(id);
  await withHub(user.id, (tx) => tx.trustedSender.delete({ where: { id: parsedId } }));
  revalidatePath("/mail");
}
