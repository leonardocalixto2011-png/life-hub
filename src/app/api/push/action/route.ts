import { NextResponse } from "next/server";
import { addDays, format } from "date-fns";
import { z } from "zod";

import { withHub } from "@/lib/hub-context";
import { fromDateInput } from "@/lib/format";
import { rateLimit } from "@/lib/rate-limit";
import { revalidateContent } from "@/lib/revalidate";
import { getUser, listMyHubs } from "@/lib/session";
import { completeTask, dueFields } from "@/lib/task-ops";
import { visibleTo } from "@/lib/visibility";
import { reportError } from "@/lib/observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The buttons on a notification ("Done" / "Tomorrow"), pressed from the lock
 * screen. public/sw.js posts here with the task id the push carried.
 *
 * Auth is the ordinary session cookie — the service worker's fetch is
 * same-origin, so the cookie rides along; there is no token in the push
 * payload to steal or replay. A signed-out device gets 401 and the worker
 * falls back to opening the task instead.
 *
 * Scope is the same rule as tasks/actions.ts, with one difference: those go
 * by the *current* hub (a cookie), and a push can be about any hub the person
 * belongs to. So the task is looked up across their ACTIVE hubs, with the
 * visibility clause mirrored in app code exactly as the actions do, on the
 * low-privilege client so RLS applies as well.
 *
 * CSRF: state-changing, cookie-authenticated, so it only accepts JSON (a
 * cross-site form cannot send that without a preflight) and rejects a
 * foreign Origin outright.
 */
const bodySchema = z.object({
  taskId: z.string().cuid(),
  action: z.enum(["done", "tomorrow"]),
});

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  // Same-origin fetches from a service worker always carry Origin on a POST;
  // absent means a non-browser client, which has no ambient cookie to abuse.
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "unsupported" }, { status: 415 });
  }

  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // A notification has two buttons; nobody presses them 60 times an hour.
  const limit = await rateLimit(`push-action:${user.id}`, 60, 3600);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const hubIds = (await listMyHubs(user.id)).map((h) => h.id);
  if (hubIds.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const result = await withHub(user.id, async (tx) => {
      const task = await tx.task.findFirst({
        where: { id: body.taskId, hubId: { in: hubIds }, ...visibleTo(user.id) },
        select: { id: true, hubId: true, status: true, dueDate: true },
      });
      if (!task) return null;

      if (body.action === "done") {
        // Pressed twice (two devices, or an old notification): already done is
        // success, and must not spawn a second next-occurrence.
        if (task.status !== "DONE") await completeTask(tx, task.id, task.hubId, user.id);
        return "done" as const;
      }

      // Snoozing something already ticked would quietly re-date a finished task.
      if (task.status === "DONE") return "done" as const;

      // Date-only fields are stored at local noon — same helper the swipe uses.
      const tomorrow = fromDateInput(format(addDays(new Date(), 1), "yyyy-MM-dd"));
      await tx.task.update({ where: { id: task.id }, data: dueFields(task.dueDate, tomorrow) });
      return "tomorrow" as const;
    });

    if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });
    revalidateContent(`/tasks/${body.taskId}`);
    return NextResponse.json({ ok: true, action: result });
  } catch (err) {
    await reportError("push.action_failed", err, { userId: user.id });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
