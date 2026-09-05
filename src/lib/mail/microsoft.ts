import type { MailAccount } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "./crypto";
import { MAX_MESSAGES_PER_RUN, stripHtml, type MailBatchItem, type ParsedMessage } from "./types";

/**
 * Microsoft 365 / Outlook (Microsoft Graph) — raw `fetch`, no SDK, matching
 * this project's existing style (see google.ts). Read-only (`Mail.Read`) —
 * this app never sends, deletes, or modifies mail.
 */

const MS_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const SCOPES = ["https://graph.microsoft.com/Mail.Read", "offline_access", "openid", "email"].join(" ");

function redirectUri(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/api/mail/oauth/microsoft/callback`;
}

function clientId(): string {
  const id = process.env.MICROSOFT_CLIENT_ID;
  if (!id) throw new Error("MICROSOFT_CLIENT_ID is not set.");
  return id;
}

function clientSecret(): string {
  const secret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!secret) throw new Error("MICROSOFT_CLIENT_SECRET is not set.");
  return secret;
}

export function microsoftOAuthConfigured(): boolean {
  return Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}

/** `state` should be a short-lived signed/random token the callback verifies — see mail/actions.ts. */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES,
    state,
  });
  return `${MS_AUTH_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(MS_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  if (!res.ok) {
    throw new Error(`Microsoft token endpoint ${res.status}: ${await res.text()}`);
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
    scope: SCOPES,
  });
}

function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  return tokenRequest({
    refresh_token: refreshToken,
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: "refresh_token",
    // Unlike Google's refresh call, Microsoft's own docs recommend passing
    // scope explicitly here too rather than relying on it persisting from
    // the original grant.
    scope: SCOPES,
  });
}

export async function getUserEmail(accessToken: string): Promise<string> {
  const url = `${GRAPH_BASE}/me?${new URLSearchParams({ $select: "mail,userPrincipalName" })}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Graph /me ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { mail?: string | null; userPrincipalName?: string };
  // `mail` can be null for some personal-account edge cases; work accounts always have it set.
  const email = data.mail ?? data.userPrincipalName;
  if (!email) throw new Error("Graph /me returned no usable email address.");
  return email;
}

/**
 * Returns a valid access token for this account, transparently refreshing
 * (and persisting the refresh) if the stored one is expired or close to it.
 * Only ever called with a MICROSOFT-provider account (fetchMicrosoftBatch)
 * — same shape as google.ts's getValidAccessToken.
 */
export async function getValidAccessToken(account: MailAccount): Promise<string> {
  const bufferMs = 60_000;
  if (account.tokenExpiresAt!.getTime() - Date.now() > bufferMs) {
    return decrypt(account.accessTokenEnc!);
  }

  const refreshToken = decrypt(account.refreshTokenEnc!);
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
// Mail fetching — Graph's delta query, the provider-correct incremental-sync
// primitive (closer to Gmail's history.list than a raw date filter).
// ---------------------------------------------------------------------------

type GraphMessage = {
  id: string;
  internetMessageId?: string;
  subject?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  receivedDateTime?: string;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  "@removed"?: { reason?: string };
};

type DeltaResponse = {
  value: GraphMessage[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
};

function firstDeltaUrl(): string {
  const params = new URLSearchParams({
    $select: "subject,from,receivedDateTime,bodyPreview,body,internetMessageId",
    changeType: "created",
  });
  return `${GRAPH_BASE}/me/mailFolders('Inbox')/messages/delta?${params.toString()}`;
}

function formatFrom(from: GraphMessage["from"]): string {
  const name = from?.emailAddress?.name;
  const address = from?.emailAddress?.address ?? "";
  return name ? `${name} <${address}>` : address;
}

function toParsedMessage(m: GraphMessage): ParsedMessage {
  const bodyText =
    m.body?.contentType === "html" ? stripHtml(m.body.content ?? "") : (m.body?.content ?? "");
  return {
    // Graph's own `id` changes when a message moves between folders — same
    // problem yahoo.ts already solved with Message-ID, solved the same way.
    id: m.internetMessageId ?? `microsoft:${m.id}`,
    from: formatFrom(m.from),
    subject: m.subject ?? "",
    snippet: m.bodyPreview ?? "",
    bodyText: bodyText.slice(0, 4000),
    internalDate: m.receivedDateTime ? new Date(m.receivedDateTime) : new Date(),
  };
}

/**
 * Fetches one page of delta results. `changeType=created` (only meaningful
 * on the very first request — Graph bakes it into every subsequent
 * nextLink/deltaLink automatically) keeps this from resurfacing every
 * read/flag/move as an "updated" entry on later runs.
 */
async function fetchDeltaPage(accessToken: string, url: string): Promise<DeltaResponse> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Graph messages/delta ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function fetchMicrosoftBatch(account: MailAccount): Promise<MailBatchItem[]> {
  const accessToken = await getValidAccessToken(account);

  let page: DeltaResponse;
  try {
    page = await fetchDeltaPage(accessToken, account.graphDeltaLink ?? firstDeltaUrl());
  } catch (err) {
    if (!account.graphDeltaLink) throw err;
    // Stored link is stale/invalid (Graph surfaces this as a
    // syncStateNotFound-style error, no fixed TTL is documented) — reset
    // and redo the bounded first-sync call in this same run, mirroring
    // yahoo.ts's UIDVALIDITY-mismatch reset.
    page = await fetchDeltaPage(accessToken, firstDeltaUrl());
  }

  const messages: ParsedMessage[] = page.value
    .filter((m) => !m["@removed"])
    .map(toParsedMessage)
    .sort((a, b) => a.internalDate.getTime() - b.internalDate.getTime())
    .slice(0, MAX_MESSAGES_PER_RUN);

  // Both nextLink (more results available now) and deltaLink (caught up)
  // are opaque continuation URLs called identically — store whichever is
  // on hand. A batch capped by MAX_MESSAGES_PER_RUN before exhausting the
  // page legitimately only has a nextLink, which is fine: next run just
  // continues paging from there.
  const continuationLink = page["@odata.nextLink"] ?? page["@odata.deltaLink"] ?? null;

  // Delta doesn't checkpoint per-message the way Gmail's internalDate or
  // Yahoo's UID do — every item in this batch shares the same continuation
  // link. poll.ts's per-message checkpoint advance just writes it
  // repeatedly, which stays crash-safe: whichever prefix of the batch got
  // processed before a mid-run cutoff is exactly what the stored link
  // represents for the next run.
  return messages.map((message) => ({
    message,
    checkpoint: { lastSyncedAt: message.internalDate, graphDeltaLink: continuationLink },
  }));
}
