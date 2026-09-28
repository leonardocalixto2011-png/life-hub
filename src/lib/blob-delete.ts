import { del } from "@vercel/blob";

import { prisma } from "@/lib/prisma";

/**
 * Deletes a blob only if nothing in the database still points at it.
 *
 * A stored URL is whatever the client sent (validated as *our* Blob host, not
 * as *this person's* file), so a member could set their background to the hub
 * cover's URL — or someone else's background — and then press "remove", and a
 * blind `del()` would delete a file they never owned. Callers therefore write
 * the new value to their own row FIRST and pass the old URL here afterwards:
 * if anyone else (or any other column) still references it, it stays.
 *
 * Trusted client, because the question is "does *any* row reference this",
 * which by definition spans users and hubs the caller can't see.
 */
export async function deleteBlobIfUnreferenced(url: string | null | undefined): Promise<void> {
  if (!url) return;
  const [users, hubs] = await Promise.all([
    prisma.user.count({ where: { backgroundImageUrl: url } }),
    prisma.hub.count({ where: { coverImageUrl: url } }),
  ]);
  if (users + hubs > 0) return;
  try {
    await del(url);
  } catch {
    // Already gone or unreachable — not worth failing the request over.
  }
}
