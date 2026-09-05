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
