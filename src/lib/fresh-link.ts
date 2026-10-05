import { auth } from "@/auth";

/** How long after opening an emailed link a password can be set without the
 *  current one. That window is the "forgot my password" path: the link just
 *  proved the address, which is all the current password would prove. */
const FRESH_LINK_MS = 15 * 60 * 1000;

/** Whether this session began with an emailed link in the last 15 minutes
 *  (`via` / `authAt` are stamped on the JWT at sign-in, auth.config.ts). */
export async function signedInByFreshLink(): Promise<boolean> {
  const session = (await auth()) as { via?: string | null; authAt?: number | null } | null;
  return session?.via === "resend" && typeof session.authAt === "number" && Date.now() - session.authAt < FRESH_LINK_MS;
}
