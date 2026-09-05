import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { encrypt } from "@/lib/mail/crypto";
import { exchangeCode, getUserEmail } from "@/lib/mail/google";
import { OAUTH_STATE_COOKIE } from "@/lib/mail/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectToMail(req: Request, params: Record<string, string>): NextResponse {
  const url = new URL("/mail", req.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const store = await cookies();
  const expectedState = store.get(OAUTH_STATE_COOKIE)?.value;
  store.delete(OAUTH_STATE_COOKIE);

  if (oauthError) {
    return redirectToMail(req, { error: `Google said: ${oauthError}` });
  }
  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectToMail(req, { error: "Invalid or expired connect request — try again." });
  }

  const { user, hub } = await requireHub();

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.refresh_token) {
      // Happens if the user has connected before and Google skipped the
      // consent screen despite `prompt: "consent"` in rare edge cases —
      // without a refresh token we can't keep syncing past the first hour.
      return redirectToMail(req, {
        error: "Google didn't return a refresh token — disconnect any prior grant at myaccount.google.com/permissions and try again.",
      });
    }
    const emailAddress = await getUserEmail(tokens.access_token);

    await withHub(user.id, (tx) =>
      tx.mailAccount.upsert({
        where: { provider_emailAddress: { provider: "GOOGLE", emailAddress } },
        update: {
          userId: user.id,
          hubId: hub.id,
          accessTokenEnc: encrypt(tokens.access_token),
          refreshTokenEnc: encrypt(tokens.refresh_token!),
          tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          scope: tokens.scope,
          status: "ACTIVE",
          lastError: null,
        },
        create: {
          userId: user.id,
          hubId: hub.id,
          provider: "GOOGLE",
          emailAddress,
          accessTokenEnc: encrypt(tokens.access_token),
          refreshTokenEnc: encrypt(tokens.refresh_token!),
          tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
          scope: tokens.scope,
        },
      }),
    );

    return redirectToMail(req, { connected: emailAddress });
  } catch (err) {
    return redirectToMail(req, {
      error: err instanceof Error ? err.message : "Could not connect that mailbox.",
    });
  }
}
