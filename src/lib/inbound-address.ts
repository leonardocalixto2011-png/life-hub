import { randomBytes } from "node:crypto";

import { prisma } from "@/lib/prisma";

/**
 * Per-hub inbound email addresses: `hub-<token>@<INBOUND_DOMAIN>`.
 *
 * Replaces INBOUND_HUB_ID, which sent every forwarded message to one
 * configured hub no matter who forwarded it. That is fine for a single
 * household and wrong for anyone else — a stranger's receipt would land in
 * your inbox.
 *
 * The token is the only thing standing between a guessed address and someone
 * else's review inbox, so it is 16 random bytes, not a slug of the hub name.
 * Anyone who learns the address can inject items into that hub — which is
 * exactly the property forwarding needs, and the reason it is revocable.
 */

const PREFIX = "hub-";

export function inboundDomain(): string | null {
  return process.env.INBOUND_DOMAIN ?? null;
}

function newToken(): string {
  // 16 bytes base36-ish via hex → 32 chars. Unguessable, and safe in an
  // email local part without escaping.
  return randomBytes(16).toString("hex");
}

/** The full address for a hub, or null if inbound isn't configured. */
export function addressFor(token: string | null): string | null {
  const domain = inboundDomain();
  if (!domain || !token) return null;
  return `${PREFIX}${token}@${domain}`;
}

/**
 * Returns the hub's inbound address, minting a token on first request.
 * Caller must already have verified the user belongs to the hub.
 */
export async function ensureInboundAddress(hubId: string): Promise<string | null> {
  if (!inboundDomain()) return null;

  const hub = await prisma.hub.findUnique({
    where: { id: hubId },
    select: { inboundToken: true },
  });
  if (!hub) return null;
  if (hub.inboundToken) return addressFor(hub.inboundToken);

  const token = newToken();
  await prisma.hub.update({ where: { id: hubId }, data: { inboundToken: token } });
  return addressFor(token);
}

/** Invalidates the current address and issues a new one. */
export async function rotateInboundAddress(hubId: string): Promise<string | null> {
  if (!inboundDomain()) return null;
  const token = newToken();
  await prisma.hub.update({ where: { id: hubId }, data: { inboundToken: token } });
  return addressFor(token);
}

/**
 * Resolves a recipient address to a hub id, or null.
 *
 * `to` can be `Name <addr>`, a bare address, or a comma-separated list when a
 * message was sent to several recipients — take the first that resolves. An
 * unmatched address returns null and the caller rejects: silently falling back
 * to a default hub is how mail ends up in a stranger's inbox.
 */
export async function resolveHubFromRecipient(to: string | null | undefined): Promise<string | null> {
  if (!to) return null;
  const domain = inboundDomain();
  if (!domain) return null;

  const candidates = to
    .split(",")
    .map((part) => {
      const angled = part.match(/<([^>]+)>/);
      return (angled ? angled[1] : part).trim().toLowerCase();
    })
    .filter(Boolean);

  for (const address of candidates) {
    const [local, host] = address.split("@");
    if (!local || host !== domain.toLowerCase()) continue;
    // Gmail-style "+" suffixes are stripped so a forwarding rule that appends
    // one still resolves.
    const token = local.replace(/\+.*$/, "").slice(PREFIX.length);
    if (!local.startsWith(PREFIX) || !token) continue;

    const hub = await prisma.hub.findUnique({
      where: { inboundToken: token },
      select: { id: true },
    });
    if (hub) return hub.id;
  }

  return null;
}
