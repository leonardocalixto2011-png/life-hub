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

/**
 * Two address shapes, both accepted on the way in:
 *
 *   hub-<token>@domain   "dash" — needs a catch-all rule at the provider.
 *   hub+<token>@domain   "plus" — needs ONE custom-address rule plus
 *                        subaddressing support.
 *
 * The distinction is operational, not cosmetic. Cloudflare Email Routing only
 * offers catch-all at the zone apex, so the dash style on a real business
 * domain would swallow every message that doesn't match another rule. The plus
 * style routes through a single explicit address and leaves the rest of the
 * domain's mail alone, which is the safer default on a domain already in use.
 *
 * INBOUND_ADDRESS_STYLE picks what we hand out; resolution accepts either, so
 * switching styles doesn't strand addresses already given out.
 */
const localPart = () => process.env.INBOUND_LOCAL_PART ?? "hub";
const usePlusStyle = () => process.env.INBOUND_ADDRESS_STYLE === "plus";

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
  const sep = usePlusStyle() ? "+" : "-";
  return `${localPart()}${sep}${token}@${domain}`;
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

  const base = localPart().toLowerCase();

  for (const address of candidates) {
    const [local, host] = address.split("@");
    if (!local || host !== domain.toLowerCase()) continue;

    // Collect every plausible token from this local part rather than assuming
    // a style — a hub handed out a dash address must keep working after a
    // switch to plus. A token is 32 hex chars, so a wrong guess just fails the
    // lookup; there is no ambiguity to resolve.
    const [beforePlus, ...plusParts] = local.split("+");
    const tokens = [
      plusParts.length > 0 ? plusParts.join("+") : null,
      beforePlus.startsWith(`${base}-`) ? beforePlus.slice(base.length + 1) : null,
    ].filter((t): t is string => Boolean(t));

    for (const token of tokens) {
      const hub = await prisma.hub.findUnique({
        where: { inboundToken: token },
        select: { id: true },
      });
      if (hub) return hub.id;
    }
  }

  return null;
}
