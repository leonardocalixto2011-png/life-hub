"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { buildAuthUrl, googleOAuthConfigured } from "@/lib/mail/google";
import { OAUTH_STATE_COOKIE } from "@/lib/mail/constants";
import { encrypt } from "@/lib/mail/crypto";
import { testYahooLogin } from "@/lib/mail/yahoo";

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

const YahooConnectSchema = z.object({
  email: z.string().email(),
  appPassword: z.string().min(1),
});

/**
 * No OAuth redirect here — Yahoo app passwords are a static credential the
 * user pastes in directly (see the plan: Yahoo has no self-serve OAuth2+IMAP
 * access for third parties). Verifies the credentials actually work before
 * saving, so a typo surfaces immediately instead of on the next silent poll
 * failure.
 */
export async function connectYahooAccount(formData: FormData) {
  const { user, hub } = await requireHub();

  const parsed = YahooConnectSchema.safeParse({
    email: formData.get("email"),
    appPassword: formData.get("appPassword"),
  });
  if (!parsed.success) {
    redirect("/mail?error=" + encodeURIComponent("Enter a valid email and app password."));
  }
  const { email, appPassword } = parsed.data;

  try {
    await testYahooLogin(email, appPassword);
  } catch {
    // Never pass the underlying IMAP error through — unlike an OAuth error,
    // its message can be close to the credential itself.
    redirect(
      "/mail?error=" +
        encodeURIComponent("Couldn't verify that email/app password — check both and try again."),
    );
  }

  await withHub(user.id, (tx) =>
    tx.mailAccount.upsert({
      where: { provider_emailAddress: { provider: "YAHOO", emailAddress: email } },
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
        provider: "YAHOO",
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
