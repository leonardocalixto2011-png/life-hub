"use server";

import { format } from "date-fns";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { ai, aiEnabled, AI_MODEL } from "@/lib/ai";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { getLang, getT } from "@/lib/i18n-server";
import { rateLimit } from "@/lib/rate-limit";
import { overAiBudget, recordAiSpend, AI_BUDGET_MESSAGE } from "@/lib/ai-budget";
import { dashboard, listMembers, listVentures } from "@/lib/data";
import { notifyAssignment } from "@/lib/notify";
import { dueLabel, fromDateInput, fromDateTimeInput, money } from "@/lib/format";
import { revalidateContent } from "@/lib/revalidate";
import { friendlyAiError } from "@/lib/parse";
import { reportError } from "@/lib/observability";

const MAX_ITEMS = 20;

const ParsedSchema = z.object({
  tasks: z.array(
    z.object({
      title: z.string(),
      dueDate: z.string().nullable(), // YYYY-MM-DD
      ventureName: z.string().nullable(),
      assigneeName: z.string().nullable(),
      priority: z.enum(["LOW", "MED", "HIGH"]).nullable(),
    }),
  ),
  events: z.array(
    z.object({
      title: z.string(),
      startAt: z.string(), // YYYY-MM-DDTHH:MM
      endAt: z.string().nullable(),
      location: z.string().nullable(),
      ventureName: z.string().nullable(),
    }),
  ),
});

export async function parseAndAdd(
  text: string,
): Promise<{ ok: boolean; message: string }> {
  // Messages go straight onto the screen, so they're translated here where
  // the signed-in person (and so their language) is known.
  const t = await getT();
  const { user, hub } = await requireHub();
  if (!aiEnabled()) {
    return { ok: false, message: t("Assistant isn’t configured (no ANTHROPIC_API_KEY).") };
  }
  // Same `ai:<user>` bucket as parseQuickAdd, deliberately: the limit is meant
  // to cap what one account can spend, and a per-entry-point bucket would let
  // the same person spend the cap once here and again from the quick-add box.
  // This path had no limit at all, so /assistant was an unmetered door to a
  // paid API for anyone with an account.
  if (!(await rateLimit(`ai:${user.id}`, 60, 3600)).ok) {
    return { ok: false, message: t("You have hit the hourly AI limit. Try again shortly.") };
  }
  // The hourly limit caps how often; this caps how much. See ai-budget.ts.
  if (await overAiBudget(user.id)) return { ok: false, message: t(AI_BUDGET_MESSAGE) };
  const clean = text.trim();
  if (!clean) return { ok: false, message: t("Type something first.") };
  if (clean.length > 4000) {
    return { ok: false, message: t("Too long — keep it under 4000 characters.") };
  }

  const [ventures, members] = await withHub(user.id, (tx) =>
    Promise.all([listVentures(tx, hub.id), listMembers(user.id, hub.id)]),
  );
  const today = new Date();

  const system = [
    "Turn a person's freeform notes into structured tasks and calendar events for a shared life/business admin app.",
    `Today is ${format(today, "EEEE, yyyy-MM-dd")}. Resolve relative dates ("Friday", "next week", "tomorrow") against it.`,
    `Ventures (use the exact name, or null): ${ventures.map((v) => v.name).join(", ") || "none"}.`,
    // Names only: members' email addresses are never sent to the model.
    `People (use the exact name, or null): ${members.map((m) => m.name).filter(Boolean).join(", ") || "none"}.`,
    'A line with a specific time (e.g. "call at 3pm", "meeting Tuesday 10:00") is an event; everything else is a task.',
    "task.dueDate is YYYY-MM-DD or null. event.startAt is YYYY-MM-DDTHH:MM (24h). Never invent items not present in the text; return empty arrays if nothing is actionable.",
  ].join("\n");

  let parsed: z.infer<typeof ParsedSchema> | null = null;
  try {
    const res = await ai().messages.parse({
      model: AI_MODEL,
      max_tokens: 2048,
      output_config: { effort: "low", format: zodOutputFormat(ParsedSchema) },
      system,
      messages: [{ role: "user", content: clean }],
    });
    await recordAiSpend(user.id, res.usage);
    parsed = res.parsed_output;
  } catch (err) {
    // Never show the upstream message: it can carry billing state and request ids.
    await reportError("assistant.parse_failed", err, { userId: user.id });
    return { ok: false, message: t(friendlyAiError(err)) };
  }
  if (!parsed) return { ok: false, message: t("Couldn’t parse that — try rephrasing.") };

  const vByName = new Map(ventures.map((v) => [v.name.toLowerCase(), v.id]));
  const mByName = new Map<string, string>();
  for (const m of members) {
    if (m.name) mByName.set(m.name.toLowerCase(), m.id);
  }

  const tasks = parsed.tasks.slice(0, MAX_ITEMS);
  const events = parsed.events.slice(0, MAX_ITEMS);
  const assigned: { taskId: string; title: string; assigneeId: string }[] = [];

  await withHub(user.id, async (tx) => {
    for (const t of tasks) {
      const assignedToId = t.assigneeName
        ? (mByName.get(t.assigneeName.toLowerCase()) ?? null)
        : null;
      const created = await tx.task.create({
        data: {
          title: t.title.slice(0, 200),
          hubId: hub.id,
          dueDate: fromDateInput(t.dueDate),
          ventureId: t.ventureName ? (vByName.get(t.ventureName.toLowerCase()) ?? null) : null,
          assignedToId,
          priority: t.priority ?? "MED",
          createdById: user.id,
        },
      });
      if (assignedToId && assignedToId !== user.id) {
        assigned.push({ taskId: created.id, title: created.title, assigneeId: assignedToId });
      }
    }

    for (const e of events) {
      const startAt = fromDateTimeInput(e.startAt);
      if (!startAt) continue;
      let endAt = fromDateTimeInput(e.endAt) ?? new Date(startAt.getTime() + 3_600_000);
      if (endAt <= startAt) endAt = new Date(startAt.getTime() + 3_600_000);
      await tx.event.create({
        data: {
          title: e.title.slice(0, 200),
          hubId: hub.id,
          startAt,
          endAt,
          location: e.location,
          ventureId: e.ventureName ? (vByName.get(e.ventureName.toLowerCase()) ?? null) : null,
          createdById: user.id,
        },
      });
    }
  });

  for (const a of assigned) {
    await notifyAssignment(a.taskId, a.title, a.assigneeId, user.name);
  }

  revalidateContent();

  const total = tasks.length + events.length;
  if (total === 0) return { ok: true, message: t("Nothing actionable in that.") };
  const titles = [...tasks.map((x) => x.title), ...events.map((e) => e.title)].join("; ");
  return {
    ok: true,
    message: t(
      events.length === 0
        ? "Added {tasks} task(s) — {titles}"
        : tasks.length === 0
          ? "Added {events} event(s) — {titles}"
          : "Added {tasks} task(s) and {events} event(s) — {titles}",
      { tasks: tasks.length, events: events.length, titles },
    ),
  };
}

export async function weeklyBriefing(): Promise<{ ok: boolean; text: string }> {
  const { user, hub } = await requireHub();
  const [t, lang] = await Promise.all([getT(), getLang()]);
  if (!aiEnabled()) {
    return { ok: false, text: t("Assistant isn’t configured (no ANTHROPIC_API_KEY).") };
  }
  // A briefing sends the whole dashboard as context, so it is the most
  // expensive call in the app — the last one that should have been unmetered.
  if (!(await rateLimit(`ai:${user.id}`, 60, 3600)).ok) {
    return { ok: false, text: t("You have hit the hourly AI limit. Try again shortly.") };
  }
  if (await overAiBudget(user.id)) return { ok: false, text: t(AI_BUDGET_MESSAGE) };

  const d = await withHub(user.id, (tx) => dashboard(tx, hub.id, user.id));
  const lines: string[] = [];
  if (d.overdue.length) lines.push(`Overdue tasks: ${d.overdue.map((t) => t.title).join(", ")}`);
  if (d.dueSoon.length)
    lines.push(
      `Tasks this week: ${d.dueSoon
        .map((t) => `${t.title}${t.dueDate ? ` (${dueLabel(t.dueDate)})` : ""}`)
        .join(", ")}`,
    );
  if (d.events.length)
    lines.push(
      `Events: ${d.events.map((e) => `${e.title} ${format(e.startAt, "EEE h:mma")}`).join(", ")}`,
    );
  if (d.deadlines.length)
    lines.push(`Deadlines: ${d.deadlines.map((x) => `${x.title} (${dueLabel(x.dueDate)})`).join(", ")}`);
  if (d.renewals.length) lines.push(`Subscriptions renewing: ${d.renewals.map((s) => s.name).join(", ")}`);
  if (d.cancelBys.length) lines.push(`Cancel-by soon: ${d.cancelBys.map((s) => s.name).join(", ")}`);
  lines.push(
    `Budget this month: in ${money(d.budget.income)}, out ${money(d.budget.expense)}, net ${money(d.budget.net)}`,
  );

  try {
    const res = await ai().messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      output_config: { effort: "low" },
      system:
        "Write a short plain briefing for a small crew running several small businesses plus personal life. 4–6 sentences, lead with what's most urgent, no bullet points, no preamble, no sign-off. If there's almost nothing, say it's a quiet week." +
        (lang === "fr" ? " Write it in Québec French, informal (tu)." : ""),
      messages: [
        {
          role: "user",
          content: `Today is ${format(d.now, "EEEE, MMMM d")}.\n\n${lines.join("\n")}`,
        },
      ],
    });
    await recordAiSpend(user.id, res.usage);
    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    return { ok: true, text: text || t("No briefing generated.") };
  } catch (err) {
    await reportError("assistant.briefing_failed", err, { userId: user.id });
    return { ok: false, text: t(friendlyAiError(err)) };
  }
}
