import { NextResponse } from "next/server";

import { prisma, appPrisma, rlsEnforced } from "@/lib/prisma";
import { reportStartupPosture, reportError } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness plus the one config fact that silently decides whether row-level
 * security is active at all. `rls: "BYPASSED"` means APP_DATABASE_URL is unset
 * and the app is connecting as the table owner — every policy is inert and
 * only the app-level filters are protecting anything. Deliberately exposed
 * (it's a boolean about the server's own config, not user data) so uptime
 * monitoring can alert on it instead of it going unnoticed for months.
 *
 * The two clients are probed *separately* because they use different
 * connection strings and can fail independently — which is exactly what
 * happened: `db: "down"` with no further detail, for a fault that turned out
 * to be on one URL only. A monitor that can't tell "the whole database is
 * gone" from "one role's URL is wrong" isn't worth paging on.
 */
let posturedReported = false;

/** Bound each probe so a hung connection can't hold the response open. */
const PROBE_TIMEOUT_MS = 4_000;

type Probe = { ok: true; ms: number } | { ok: false; ms: number; error: string };

/**
 * Returns a short, non-sensitive reason. Prisma's error *message* embeds the
 * connection string (host, user, database) — never return it. The error code
 * and class name carry all the diagnostic value with none of the secret:
 * P1001 unreachable, P1002 timed out, P1000 auth failed, P1017 closed.
 */
async function probe(client: typeof prisma, label: string): Promise<Probe> {
  const started = Date.now();
  try {
    await Promise.race([
      client.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("probe timeout")), PROBE_TIMEOUT_MS),
      ),
    ]);
    return { ok: true, ms: Date.now() - started };
  } catch (err) {
    const ms = Date.now() - started;
    const code = (err as { code?: string })?.code;
    const name = (err as { name?: string })?.name;
    // Full error (message included) goes to the log, where it is not public.
    await reportError("health.db_probe_failed", err, { client: label, ms });
    return { ok: false, ms, error: code ?? name ?? "unknown" };
  }
}

export async function GET() {
  if (!posturedReported) {
    posturedReported = true;
    reportStartupPosture();
  }

  const [owner, app] = await Promise.all([
    probe(prisma, "owner"),
    probe(appPrisma, "app"),
  ]);

  // The app client is the one every request actually uses, so it decides
  // liveness. A broken owner URL is a real problem worth surfacing, but it
  // does not by itself mean the app is down.
  const ok = app.ok;

  return NextResponse.json(
    {
      ok,
      db: ok ? "up" : "down",
      rls: rlsEnforced ? "enforced" : "BYPASSED",
      probes: { owner, app },
    },
    { status: ok ? 200 : 503 },
  );
}
