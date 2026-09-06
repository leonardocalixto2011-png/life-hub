import { NextResponse } from "next/server";

import { getUser } from "@/lib/session";
import { exportUserData } from "@/lib/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GDPR Art. 15/20 — a machine-readable copy of everything held about the
 * caller. Scoped to the session user with no id parameter at all: an
 * `?userId=` would be an obvious enumeration hole on the most sensitive
 * endpoint in the app.
 *
 * getUser() rather than requireUser(): a route handler must not `redirect()`.
 */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const data = await exportUserData(user.id);
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="life-hub-export-${stamp}.json"`,
      // Never let a proxy or the browser keep a copy of someone's whole record.
      "Cache-Control": "no-store, private",
    },
  });
}
