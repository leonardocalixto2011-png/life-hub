import { rlsEnforced } from "@/lib/prisma";

/**
 * Error reporting and structured logging, with no SDK and no account required.
 *
 * Deliberately dependency-free. Adding @sentry/nextjs means a vendor account,
 * a DSN, a build-time plugin and a sizeable client bundle — worth it later,
 * pointless while nothing is being watched at all. What matters first is that
 * failures stop being invisible.
 *
 * Two sinks:
 *   1. stdout as single-line JSON. Vercel captures this, and it's greppable
 *      and queryable in the log drain without any integration.
 *   2. ALERT_WEBHOOK_URL, if set — any Slack/Discord/generic webhook. This is
 *      what turns "visible in a log nobody reads" into "someone gets pinged".
 *
 * **Never pass user content to these.** Context is for scalars that identify
 * *where* something broke — route, provider, counts, user id. Not task titles,
 * not email bodies, not balances. An error log that quietly accumulates
 * personal data is its own breach, and this app parses people's mail.
 */

export type LogContext = Record<string, string | number | boolean | null | undefined>;

type Level = "error" | "warn" | "info";

function emit(level: Level, event: string, context: LogContext, error?: unknown): void {
  const line = {
    level,
    event,
    at: new Date().toISOString(),
    ...context,
    ...(error instanceof Error
      ? { errorName: error.name, errorMessage: error.message, stack: error.stack?.slice(0, 2000) }
      : error !== undefined
        ? { errorMessage: String(error).slice(0, 500) }
        : {}),
  };

  const serialized = JSON.stringify(line);
  if (level === "error") console.error(serialized);
  else if (level === "warn") console.warn(serialized);
  else console.log(serialized);
}

async function notify(event: string, context: LogContext, error?: unknown): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;

  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error ?? "");
  const summary = `🔴 Life Hub — ${event}${detail ? `\n${detail}` : ""}\n${JSON.stringify(context)}`;

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `text` covers Slack and Discord; a generic endpoint gets the same body.
      body: JSON.stringify({ text: summary.slice(0, 1500) }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // An alerting failure must never take down the thing it was watching.
  }
}

/** Something broke. Logs, and pings the webhook if one is configured. */
export async function reportError(
  event: string,
  error: unknown,
  context: LogContext = {},
): Promise<void> {
  emit("error", event, context, error);
  await notify(event, context, error);
}

/** Worth knowing about, not worth waking anyone. */
export function logWarn(event: string, context: LogContext = {}): void {
  emit("warn", event, context);
}

export function logInfo(event: string, context: LogContext = {}): void {
  emit("info", event, context);
}

/**
 * Wraps a background job so a thrown error is reported rather than vanishing
 * into a 500. Re-throws: the caller still decides the HTTP response.
 */
export async function monitored<T>(
  event: string,
  context: LogContext,
  fn: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  try {
    const result = await fn();
    logInfo(`${event}.ok`, { ...context, ms: Date.now() - started });
    return result;
  } catch (err) {
    await reportError(`${event}.failed`, err, { ...context, ms: Date.now() - started });
    throw err;
  }
}

/**
 * Called once per cold start. Surfaces config that is dangerous rather than
 * merely missing — the kind of thing that otherwise stays wrong for months
 * because the app keeps working.
 */
export function reportStartupPosture(): void {
  const missing = [
    !rlsEnforced && "APP_DATABASE_URL (RLS is BYPASSED)",
    !process.env.MAIL_TOKEN_ENCRYPTION_KEY && "MAIL_TOKEN_ENCRYPTION_KEY",
    !process.env.CRON_SECRET && "CRON_SECRET",
    !process.env.ALERT_WEBHOOK_URL && "ALERT_WEBHOOK_URL (no alerting)",
  ].filter(Boolean) as string[];

  if (missing.length > 0) {
    logWarn("startup.config_gaps", { missing: missing.join(", ") });
  }
}
