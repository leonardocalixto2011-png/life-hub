import Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@prisma/client";
import { format } from "date-fns";

import { ai, AI_MODEL } from "@/lib/ai";
import { aiGate, meterAi } from "@/lib/ai-gate";
import { withHub } from "@/lib/hub-context";
import { translate } from "@/lib/i18n";
import { reportError } from "@/lib/observability";
import { friendlyAiError } from "@/lib/parse";
import { revalidateContent } from "@/lib/revalidate";
import { apiTools, hubContext, TOOL_BY_NAME, type ToolCtx } from "@/lib/assistant/tools";

/**
 * The assistant: Claude with the app's own actions as tools (lib/assistant/
 * tools.ts), in a conversation stored in ChatMessage.
 *
 * A turn is a manual tool loop rather than the SDK's beta tool runner, because
 * every step has to be persisted as it happens (so a timeout mid-turn leaves a
 * valid, replayable history), metered against the person's credit, and
 * streamed to the screen.
 *
 * History is append-only and replayed verbatim — each ChatMessage keeps the
 * exact content blocks Claude returned, thinking included — because current
 * models reject a replayed thinking block whose earlier history was edited.
 * For the same reason nothing is ever trimmed from the front; a conversation
 * that grows too long asks the person to start a new one instead.
 */

/** Hobby functions stop at 60s; leave room to persist and close the stream. */
const TURN_BUDGET_MS = 48_000;
const MAX_STEPS = 10;
/** Turns the person can take in one conversation before starting a fresh one. */
export const MAX_TURNS = 40;

/** Low by default: this is a chat, people wait for it, and they pay for it. */
function effort(): "low" | "medium" | "high" {
  const e = process.env.ASSISTANT_EFFORT;
  return e === "medium" || e === "high" ? e : "low";
}

/** Server-side fallback on refusal exists only for these models (first-party API). */
function supportsFallback(model: string): boolean {
  return /^claude-(opus-5|fable-5|sonnet-5-5)/.test(model);
}

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "step"; label: string; ok: boolean }
  | { type: "pending"; pending: Pending }
  | { type: "message"; id: string }
  | { type: "notice"; text: string }
  | { type: "error"; text: string }
  | { type: "done"; costMillicents: number };

export type Pending = {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  summary: string;
  status: "waiting" | "done" | "cancelled" | "failed";
};

export type AssistantMeta = { steps?: { label: string; ok: boolean }[]; pending?: Pending[]; system?: boolean };

const STABLE_SYSTEM = [
  "You are the assistant inside Life Hub, a shared app a household or a small team uses to run day-to-day life and business admin: tasks, calendar events, deadlines, subscriptions, a budget, personal debts, trips, work schedules, special dates, an inbox of items detected from email, and chats between members.",
  "The person talks to you instead of tapping through screens. Do the work with your tools: look things up before answering, and when they ask for something to be added, changed, ticked off or logged, do it right away rather than describing how they could do it. Several independent actions can go in one step.",
  "You act as this person, in the hub currently open, with exactly their permissions. A tool error means the app refused (missing consent, not their item, invalid date…): say plainly what happened and what they can do; never claim something was done when a tool failed.",
  "Deleting anything and messaging another person are never done directly: those tools only prepare the action and the person confirms it with a tap. After calling one, say what is waiting for their tap, in one short sentence.",
  "Use the ids from the context block and from tool results; never invent one. When a person or a venture they name isn't in the context, ask. Resolve relative dates ('Friday', 'next week', 'tomorrow 3pm') against today's date in the context; times are local.",
  "Debts are sensitive. Only discuss or change them when the person brings them up. Things marked private are theirs alone: when adding something personal (health, money worries, a gift for someone in the hub), make it private.",
  "Amounts are in the hub's currency. Write short, warm, plain replies — a sentence or two after an action, a short list only when listing things. No headings, no preamble, no sign-off. Reply in the person's language (the context says which); Québec French uses 'tu'.",
].join("\n\n");

async function systemBlocks(ctx: ToolCtx): Promise<Anthropic.Beta.BetaTextBlockParam[]> {
  const c = await hubContext(ctx);
  const now = new Date();
  const volatile = [
    `Today: ${format(now, "EEEE yyyy-MM-dd HH:mm")} (America/Toronto).`,
    `Language: ${ctx.lang === "fr" ? "Québec French" : "English"}.`,
    `The person: ${ctx.user.name ?? "(no name)"} — id ${ctx.user.id}.`,
    `Open hub: ${ctx.hub.name} (currency ${ctx.hub.currency}).`,
    c.otherHubs.length
      ? `Their other hubs: ${c.otherHubs.join(", ")}. You can only act in the open hub; for another one, tell them to switch with the hub menu at the top.`
      : "",
    `People in this hub: ${c.people.map((p) => `${p.name ?? p.username ?? "?"} (id ${p.id})`).join("; ")}.`,
    `Ventures: ${c.ventures.map((v) => `${v.name} (id ${v.id})`).join("; ") || "none"}.`,
  ]
    .filter(Boolean)
    .join("\n");
  return [
    // Stable first, so tools + this block cache across every person and day.
    { type: "text", text: STABLE_SYSTEM, cache_control: { type: "ephemeral" } },
    { type: "text", text: volatile },
  ];
}

type Row = { role: "USER" | "ASSISTANT"; content: Prisma.JsonValue };

function toParams(rows: Row[]): Anthropic.Beta.BetaMessageParam[] {
  return rows
    .filter((r) => r.content != null)
    .map((r) => ({
      role: r.role === "ASSISTANT" ? "assistant" : "user",
      content: r.content as unknown as Anthropic.Beta.BetaContentBlockParam[],
    }));
}

function textOf(blocks: Anthropic.Beta.BetaContentBlock[]): string {
  return blocks
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
}

/**
 * One turn: the person's message in, as many tool steps as it takes, the reply
 * out. Emits events as it goes; persists every step.
 */
export async function runAssistantTurn(
  ctx: ToolCtx,
  conversationId: string,
  text: string,
  emit: (e: AgentEvent) => void,
): Promise<void> {
  const t = (k: string, v?: Record<string, string | number>) => translate(ctx.lang, k, v);
  const started = Date.now();
  let spent = 0;

  const blocked = await aiGate(ctx.user.id);
  if (blocked) {
    emit({ type: "error", text: t(blocked) });
    return;
  }

  // Load the conversation (RLS: only the person's own AI chat is visible).
  const history = await withHub(ctx.user.id, async (tx) => {
    const conv = await tx.conversation.findFirst({
      where: { id: conversationId, kind: "AI", createdById: ctx.user.id },
      select: { id: true },
    });
    if (!conv) return null;
    return tx.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true, meta: true },
    });
  });
  if (!history) {
    emit({ type: "error", text: t("Not found.") });
    return;
  }
  const turns = history.filter((r) => r.role === "USER" && !(r.meta as AssistantMeta | null)?.system && r.content).length;
  if (turns >= MAX_TURNS * 2) {
    emit({ type: "error", text: t("This conversation is getting long. Start a new one to keep going.") });
    return;
  }

  // A turn that died between Claude asking for tools and the results being
  // saved leaves a tool call with no answer, which the API rejects on every
  // later turn. Answer it now — appended, like everything else.
  const tail = history[history.length - 1];
  if (tail?.role === "ASSISTANT" && Array.isArray(tail.content)) {
    const dangling = (tail.content as { type?: string; id?: string }[]).filter((b) => b.type === "tool_use" && b.id);
    if (dangling.length) {
      const content = dangling.map((b) => ({
        type: "tool_result" as const,
        tool_use_id: b.id!,
        is_error: true,
        content: "Interrupted before it ran.",
      }));
      await save(ctx.user.id, conversationId, { role: "USER", authorId: ctx.user.id, body: "", content, hidden: true });
      history.push({ role: "USER", content: content as unknown as Prisma.JsonValue, meta: null });
    }
  }

  const messages = toParams(history);
  const userContent: Anthropic.Beta.BetaContentBlockParam[] = [{ type: "text", text }];
  messages.push({ role: "user", content: userContent });
  await save(ctx.user.id, conversationId, {
    role: "USER",
    authorId: ctx.user.id,
    body: text,
    content: userContent,
  });

  const system = await systemBlocks(ctx);
  const tools = apiTools();
  const steps: { label: string; ok: boolean }[] = [];
  const pending: Pending[] = [];
  let lastAssistantId: string | null = null;
  let changed = false;

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      if (Date.now() - started > TURN_BUDGET_MS) {
        emit({ type: "notice", text: t("That took a while — say “continue” and I'll pick it up.") });
        break;
      }
      if (step > 0) {
        // Credit can run out mid-turn; stop between steps rather than run on.
        const b = await aiGate(ctx.user.id, { countRequest: false });
        if (b) {
          emit({ type: "error", text: t(b) });
          break;
        }
      }

      const params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming = {
        model: AI_MODEL,
        max_tokens: 16000,
        system,
        tools,
        messages,
        // Haiku rejects the effort parameter (see fastEffort in lib/ai).
        ...(AI_MODEL.includes("haiku") ? {} : { output_config: { effort: effort() } }),
        cache_control: { type: "ephemeral" },
        ...(supportsFallback(AI_MODEL) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {}),
      };
      const stream = ai().beta.messages.stream(params, { timeout: 45_000 });
      stream.on("text", (delta) => emit({ type: "text", delta }));
      const final = await stream.finalMessage();
      spent += await meterAi(ctx.user.id, final.model, final.usage, "assistant", ctx.hub.id);

      messages.push({ role: "assistant", content: final.content as unknown as Anthropic.Beta.BetaContentBlockParam[] });
      const said = textOf(final.content);
      lastAssistantId = await save(ctx.user.id, conversationId, {
        role: "ASSISTANT",
        authorId: null,
        body: said,
        content: final.content,
        hidden: !said,
      });
      emit({ type: "message", id: lastAssistantId });

      if (final.stop_reason === "refusal") {
        emit({ type: "notice", text: t("I can't help with that one.") });
        break;
      }
      if (final.stop_reason === "pause_turn") continue;
      if (final.stop_reason !== "tool_use") {
        if (final.stop_reason === "max_tokens") emit({ type: "notice", text: t("That reply was cut short.") });
        break;
      }

      const uses = final.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = await Promise.all(
        uses.map(async (u) => {
          const tool = TOOL_BY_NAME.get(u.name);
          const input = (u.input ?? {}) as Record<string, unknown>;
          if (!tool) return { type: "tool_result" as const, tool_use_id: u.id, is_error: true, content: "Unknown tool." };
          try {
            if (tool.confirm) {
              const summary = await tool.confirm(ctx, input);
              const p: Pending = { id: u.id, tool: tool.name, input, summary, status: "waiting" };
              pending.push(p);
              emit({ type: "pending", pending: p });
              return {
                type: "tool_result" as const,
                tool_use_id: u.id,
                content: `Not done yet: waiting for the person to tap Confirm on "${summary}". Tell them it's ready to confirm.`,
              };
            }
            const out = await tool.run(ctx, input);
            const failed = Boolean(out && typeof out === "object" && "error" in (out as object));
            steps.push({ label: tool.label, ok: !failed });
            emit({ type: "step", label: t(tool.label), ok: !failed });
            if (!failed && !tool.name.startsWith("get_") && !tool.name.startsWith("list_") && tool.name !== "search" && tool.name !== "read_chat") {
              changed = true;
            }
            return {
              type: "tool_result" as const,
              tool_use_id: u.id,
              is_error: failed || undefined,
              content: JSON.stringify(out ?? { ok: true }).slice(0, 20_000),
            };
          } catch (e) {
            steps.push({ label: tool.label, ok: false });
            emit({ type: "step", label: t(tool.label), ok: false });
            // Plain Errors are this app's user-facing messages; anything else
            // (Prisma, Zod) carries internals and is reported, not shown.
            const msg = e instanceof Error && e.constructor === Error ? e.message : "The app refused that input.";
            if (!(e instanceof Error && e.constructor === Error)) {
              await reportError("assistant.tool_failed", e, { tool: u.name });
            }
            return { type: "tool_result" as const, tool_use_id: u.id, is_error: true, content: msg };
          }
        }),
      );
      messages.push({ role: "user", content: results });
      await save(ctx.user.id, conversationId, { role: "USER", authorId: ctx.user.id, body: "", content: results, hidden: true });
    }
  } catch (err) {
    await reportError("assistant.turn_failed", err, { userId: ctx.user.id });
    emit({ type: "error", text: t(friendlyAiError(err)) });
  }

  if (lastAssistantId && (steps.length || pending.length)) {
    await withHub(ctx.user.id, (tx) =>
      tx.chatMessage.update({
        where: { id: lastAssistantId! },
        // Shown even when the closing step said nothing: the steps and any
        // confirm card live on it.
        data: { meta: { steps, pending } as unknown as Prisma.InputJsonValue, hidden: false },
      }),
    );
  }
  if (changed) revalidateContent();
  emit({ type: "done", costMillicents: spent });
}

async function save(
  userId: string,
  conversationId: string,
  m: { role: "USER" | "ASSISTANT"; authorId: string | null; body: string; content: unknown; hidden?: boolean; meta?: AssistantMeta },
): Promise<string> {
  return withHub(userId, async (tx) => {
    const row = await tx.chatMessage.create({
      data: {
        conversationId,
        role: m.role,
        authorId: m.authorId,
        body: m.body.slice(0, 20_000),
        content: m.content as Prisma.InputJsonValue,
        hidden: m.hidden ?? false,
        meta: (m.meta ?? undefined) as Prisma.InputJsonValue | undefined,
      },
      select: { id: true },
    });
    await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
    return row.id;
  });
}

/**
 * The person tapped Confirm (or Cancel) on something the assistant prepared.
 * Runs the tool for real, marks the card, and appends a note to the
 * conversation so the assistant knows on its next turn — appended, never an
 * edit of an earlier message.
 */
export async function resolvePending(
  ctx: ToolCtx,
  messageId: string,
  pendingId: string,
  approve: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const t = (k: string) => translate(ctx.lang, k);
  const msg = await withHub(ctx.user.id, (tx) =>
    tx.chatMessage.findFirst({
      where: { id: messageId, role: "ASSISTANT", conversation: { kind: "AI", createdById: ctx.user.id } },
      select: { id: true, conversationId: true, meta: true },
    }),
  );
  const meta = (msg?.meta ?? null) as AssistantMeta | null;
  const p = meta?.pending?.find((x) => x.id === pendingId);
  if (!msg || !meta || !p) return { ok: false, error: t("Not found.") };
  if (p.status !== "waiting") return { ok: false, error: t("Already handled.") };

  let status: Pending["status"] = "cancelled";
  let error: string | undefined;
  if (approve) {
    const tool = TOOL_BY_NAME.get(p.tool);
    try {
      if (!tool) throw new Error("Unknown tool.");
      const out = await tool.run(ctx, p.input);
      if (out && typeof out === "object" && "error" in out) throw new Error(String((out as { error: unknown }).error));
      status = "done";
      revalidateContent();
    } catch (e) {
      status = "failed";
      error = e instanceof Error && e.constructor === Error ? e.message : "Something went wrong.";
      if (!(e instanceof Error && e.constructor === Error)) await reportError("assistant.confirm_failed", e, { tool: p.tool });
    }
  }
  p.status = status;
  const note =
    status === "done"
      ? `[The person confirmed and it was done: ${p.summary}]`
      : status === "failed"
        ? `[The person confirmed but the app refused: ${p.summary} — ${error}]`
        : `[The person cancelled: ${p.summary}]`;
  await withHub(ctx.user.id, async (tx) => {
    await tx.chatMessage.update({ where: { id: msg.id }, data: { meta: meta as unknown as Prisma.InputJsonValue } });
  });
  await save(ctx.user.id, msg.conversationId, {
    role: "USER",
    authorId: ctx.user.id,
    body: `${status === "done" ? "✓" : status === "failed" ? "⚠" : "✕"} ${p.summary}`,
    content: [{ type: "text", text: note }],
    meta: { system: true },
  });
  return status === "failed" ? { ok: false, error } : { ok: true };
}
