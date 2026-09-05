import type { MailAccount } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "./crypto";

/**
 * Gmail (Google Cloud OAuth client) — raw `fetch` against Google's endpoints,
 * no `googleapis` SDK (matches this project's existing lightweight style,
 * see lib/email.ts's plain-fetch Resend integration). Read-only
 * (`gmail.readonly`) — this app never sends, deletes, or modifies mail.
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "openid", "email"].join(" ");

function redirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/api/mail/oauth/google/callback`;
}

function clientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error("GOOGLE_CLIENT_ID is not set.");
  return id;
}

function clientSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error("GOOGLE_CLIENT_SECRET is not set.");
  return secret;
}

export function googleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** `state` should be a short-lived signed/random token the callback verifies — see mail/actions.ts. */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent", // forces a refresh_token even on a repeat connect
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  if (!res.ok) {
    throw new Error(`Google token endpoint ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export function exchangeCode(code: string): Promise<TokenResponse> {
  return tokenRequest({
    code,
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: redirectUri(),
    grant_type: "authorization_code",
  });
}

function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  return tokenRequest({
    refresh_token: refreshToken,
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: "refresh_token",
  });
}

export async function getUserEmail(accessToken: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Google userinfo ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { email?: string };
  if (!data.email) throw new Error("Google userinfo returned no email.");
  return data.email;
}

/**
 * Returns a valid access token for this account, transparently refreshing
 * (and persisting the refresh) if the stored one is expired or close to it.
 * Uses the owner-role `prisma` client directly — this runs from the
 * background poller (lib/mail/poll.ts), which has no per-user session to
 * scope a withHub() transaction to; it's the same pattern the digest cron
 * already uses for its own cross-user aggregate work.
 */
export async function getValidAccessToken(account: MailAccount): Promise<string> {
  const bufferMs = 60_000;
  if (account.tokenExpiresAt.getTime() - Date.now() > bufferMs) {
    return decrypt(account.accessTokenEnc);
  }

  const refreshToken = decrypt(account.refreshTokenEnc);
  const refreshed = await refreshAccessToken(refreshToken);
  await prisma.mailAccount.update({
    where: { id: account.id },
    data: {
      accessTokenEnc: encrypt(refreshed.access_token),
      tokenExpiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
    },
  });
  return refreshed.access_token;
}

// ---------------------------------------------------------------------------
// Gmail message fetching
// ---------------------------------------------------------------------------

export async function listRecentMessageIds(accessToken: string, after: Date): Promise<string[]> {
  const q = `after:${Math.floor(after.getTime() / 1000)}`;
  const url = `${GMAIL_API_BASE}/messages?${new URLSearchParams({ q, maxResults: "25" })}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Gmail messages.list ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { messages?: { id: string }[] };
  return (data.messages ?? []).map((m) => m.id);
}

export type ParsedMessage = {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  bodyText: string;
  internalDate: Date;
};

function decodeBase64Url(s: string): string {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

type GmailPart = {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
};

function extractPlainText(payload: GmailPart | undefined): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractPlainText(part);
      if (text) return text;
    }
  }
  if (payload.mimeType === "text/html" && payload.body?.data) {
    return decodeBase64Url(payload.body.data)
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return "";
}

export async function getMessage(accessToken: string, id: string): Promise<ParsedMessage> {
  const url = `${GMAIL_API_BASE}/messages/${id}?format=full`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Gmail messages.get ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as {
    id: string;
    snippet?: string;
    internalDate?: string;
    payload?: GmailPart & { headers?: { name: string; value: string }[] };
  };
  const headers = data.payload?.headers ?? [];
  const header = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

  return {
    id: data.id,
    from: header("From"),
    subject: header("Subject"),
    snippet: data.snippet ?? "",
    bodyText: extractPlainText(data.payload).slice(0, 4000),
    internalDate: new Date(Number(data.internalDate ?? Date.now())),
  };
}
