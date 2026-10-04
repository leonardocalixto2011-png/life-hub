"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { rateLimit } from "@/lib/rate-limit";
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
import { ensureInboundAddress, rotateInboundAddress } from "@/lib/inbound-address";
import { unmuteSender } from "@/lib/mail/trust";
import { grantConsentIn, hasConsent, hasConsentIn, revokeConsent } from "@/lib/consent";

/**
 * AI analysis of email is OFF by default (Law 25). Nothing below connects a
 * mailbox or hands out a forwarding address until the person has switched it
 * on for this hub — a separate, express consent, recorded as MAIL_AI in the
 * ledger. The poller and /api/inbound check the same consent before any
 * message is sent to the model, so turning it off stops analysis at once
 * while leaving the mailbox connected.
 */
const NEEDS_MAIL_AI = "Turn on AI analysis for this hub first.";

/**
 * Switches AI analysis on for the current hub. The two boxes on /mail start
 * unchecked and are validated again here, so a crafted request records
 * nothing.
 */
export async function enableMailAi(formData: FormData) {
  const { user, hub } = await requireHub();
  const ticked = (name: string) => formData.get(name) === "on";

  const ok = await withHub(user.id, async (tx) => {
    const adult = (await hasConsentIn(tx, user.id, "AGE_18")) || ticked("age18");
    if (!ticked("consent") || !adult) return false;
    await grantConsentIn(tx, user.id, "AGE_18");
    await grantConsentIn(tx, user.id, "MAIL_AI", hub.id);
    return true;
  });
  if (!ok) redirect("/mail?error=" + encodeURIComponent("Tick both boxes to continue."));

  revalidatePath("/mail");
}

/** Withdraws the consent: analysis stops, connected mailboxes stay connected. */
export async function disableMailAi() {
  const { user, hub } = await requireHub();
  await revokeConsent(user.id, "MAIL_AI", hub.id);
  revalidatePath("/mail");
}

/**
 * Starts the Gmail connect flow. The state value is stashed in a short-lived
 * httpOnly cookie so the callback route (a separate, unauthenticated-by-
 * design request from Google) can verify it wasn't forged — standard OAuth
 * CSRF protection since there's no session to tie the callback to otherwise.
 */
export async function startGoogleConnect() {
  const { user, hub } = await requireHub();
  if (!(await hasConsent(user.id, "MAIL_AI", hub.id))) {
    redirect("/mail?error=" + encodeURIComponent(NEEDS_MAIL_AI));
  }
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
  const { user, hub } = await requireHub();
  if (!(await hasConsent(user.id, "MAIL_AI", hub.id))) {
    redirect("/mail?error=" + encodeURIComponent(NEEDS_MAIL_AI));
  }
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
  if (!(await hasConsent(user.id, "MAIL_AI", hub.id))) {
    redirect("/mail?error=" + encodeURIComponent(NEEDS_MAIL_AI));
  }

  const parsed = ImapConnectSchema.safeParse({
    provider: formData.get("provider"),
    email: formData.get("email"),
    appPassword: formData.get("appPassword"),
  });
  if (!parsed.success) {
    redirect("/mail?error=" + encodeURIComponent("Enter a valid email and app password."));
  }
  const { provider, email, appPassword } = parsed.data;

  // Each attempt is a real login against Gmail/Yahoo from our server's IP.
  // Unlimited, this form would let anyone test stolen credentials through us
  // and get the server's IP blocked, which would stop everyone's mail polling.
  if (!(await rateLimit(`imap-connect:${user.id}`, 5, 3600)).ok) {
    redirect("/mail?error=" + encodeURIComponent("Too many attempts. Try again in an hour."));
  }

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
  const { user, hub } = await requireHub();
  const parsedId = z.string().cuid().parse(id);
  // Pinned to the current hub in app code as well as by RLS.
  await withHub(user.id, async (tx) => {
    const { count } = await tx.mailAccount.deleteMany({ where: { id: parsedId, hubId: hub.id } });
    if (count === 0) throw new Error("Not found.");
  });
  revalidatePath("/mail");
}

export async function removeTrustedSender(id: string) {
  const { user, hub } = await requireHub();
  const parsedId = z.string().cuid().parse(id);
  await withHub(user.id, async (tx) => {
    const { count } = await tx.trustedSender.deleteMany({ where: { id: parsedId, hubId: hub.id } });
    if (count === 0) throw new Error("Not found.");
  });
  revalidatePath("/mail");
}

/**
 * Reveals (minting on first use) this hub's forwarding address. Any active
 * member can see it — the address is a shared property of the hub, and
 * anyone who can read the hub's review inbox can already see what arrives.
 */
export async function revealInboundAddress(): Promise<string | null> {
  const { user, hub } = await requireHub();
  // Mail sent to this address is analysed by AI, so the address is only handed
  // to someone who has agreed to that for this hub.
  if (!(await hasConsent(user.id, "MAIL_AI", hub.id))) throw new Error(NEEDS_MAIL_AI);
  return ensureInboundAddress(hub.id);
}

/**
 * Issues a new address, invalidating the old one. The point of rotation:
 * anyone holding the address can post into this hub's review inbox, so a
 * leaked address needs a way to be cut off.
 */
export async function rotateInbound(): Promise<string | null> {
  const { user, hub } = await requireHub();
  if (!(await hasConsent(user.id, "MAIL_AI", hub.id))) throw new Error(NEEDS_MAIL_AI);
  const next = await rotateInboundAddress(hub.id);
  revalidatePath("/mail");
  return next;
}

/** Start classifying this sender again. */
export async function unmuteThisSender(fromAddress: string) {
  const { user, hub } = await requireHub();
  const address = z.string().min(1).max(320).parse(fromAddress).toLowerCase();
  await withHub(user.id, (tx) => unmuteSender(tx, hub.id, address));
  revalidatePath("/mail");
}
