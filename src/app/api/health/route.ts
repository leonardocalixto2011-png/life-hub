import { NextResponse } from "next/server";

import { prisma, rlsEnforced } from "@/lib/prisma";
import { reportStartupPosture } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness plus the one config fact that silently decides whether row-level
 * security is active at all. `rls: "BYPASSED"` means APP_DATABASE_URL is unset
 * and the app is connecting as the table owner — every policy is inert and
 * only the app-level filters are protecting anything. Deliberately exposed
 * (it's a boolean about the server's own config, not user data) so uptime
 * monitoring can alert on it instead of it going unnoticed for months.
 */
let posturedReported = false;

export async function GET() {
  if (!posturedReported) {
    posturedReported = true;
    reportStartupPosture();
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      db: "up",
      rls: rlsEnforced ? "enforced" : "BYPASSED",
    });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
