import { z } from "zod";

import { getUser, listMyHubs, CURRENT_HUB_COOKIE } from "@/lib/session";
import { cookies } from "next/headers";
import { aiEnabled } from "@/lib/ai";
import { langOf, translate } from "@/lib/i18n";
import { createAiChat } from "@/lib/chat";
import { runAssistantTurn, type AgentEvent } from "@/lib/assistant/agent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  conversationId: z.string().cuid().nullable().optional(),
  text: z.string().trim().min(1).max(4000),
});

/**
 * One assistant turn, streamed as newline-delimited JSON (AgentEvent per
 * line) so the reply appears as it's written and each action shows up as it
 * happens. A route handler rather than a server action because actions can't
 * stream. Auth is checked here: /api/* sits outside the proxy's sign-in gate.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const lang = langOf(user.locale);
  const hubs = await listMyHubs(user.id);
  const jar = await cookies();
  const hub = hubs.find((h) => h.id === jar.get(CURRENT_HUB_COOKIE)?.value) ?? hubs[0];
  if (!hub) return new Response("No hub", { status: 409 });
  if (!aiEnabled()) {
    return Response.json({ error: translate(lang, "Assistant isn’t configured (no ANTHROPIC_API_KEY).") }, { status: 503 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: translate(lang, "Type something first.") }, { status: 400 });

  const conversationId = parsed.data.conversationId ?? (await createAiChat(user.id, hub.id));

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AgentEvent | { type: "conversation"; id: string }) =>
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      send({ type: "conversation", id: conversationId });
      try {
        await runAssistantTurn({ user, hub, lang }, conversationId, parsed.data.text, send);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
