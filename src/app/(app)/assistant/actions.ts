"use server";

import { revalidatePath } from "next/cache";
import { format } from "date-fns";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { ai, aiEnabled, AI_MODEL } from "@/lib/ai";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { dashboard, listMembers, listVentures } from "@/lib/data";
import { dueLabel, fromDateInput, fromDateTimeInput, money } from "@/lib/format";

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
  const { user, hub } = await requireHub();
  if (!aiEnabled()) {
    return { ok: false, message: "Assistant isn’t configured (no ANTHROPIC_API_KEY)." };
  }
  const clean = text.trim();
  if (!clean) return { ok: false, message: "Type something first." };
  if (clean.length > 4000) {
    return { ok: false, message: "Too long — keep it under 4000 characters." };
  }

  const [ventures, members] = await withHub(user.id, (tx) =>
    Promise.all([listVentures(tx, hub.id), listMembers(tx, hub.id)]),
  );
  const today = new Date();

  const system = [
    "Turn a person's freeform notes into structured tasks and calendar events for a shared life/business admin app.",
    `Today is ${format(today, "EEEE, yyyy-MM-dd")}. Resolve relative dates ("Friday", "next week", "tomorrow") against it.`,
    `Ventures (use the exact name, or null): ${ventures.map((v) => v.name).join(", ") || "none"}.`,
    `People (use the exact name, or null): ${members.map((m) => m.name ?? m.email).join(", ") || "none"}.`,
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
    parsed = res.parsed_output;
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? `Assistant error: ${err.message}` : "Assistant error.",
    };
  }
  if (!parsed) return { ok: false, message: "Couldn’t parse that — try rephrasing." };

  const vByName = new Map(ventures.map((v) => [v.name.toLowerCase(), v.id]));
  const mByName = new Map<string, string>();
  for (const m of members) {
    if (m.name) mByName.set(m.name.toLowerCase(), m.id);
    if (m.email) {
      mByName.set(m.email.toLowerCase(), m.id);
      mByName.set(m.email.split("@")[0].toLowerCase(), m.id);
    }
  }

  const tasks = parsed.tasks.slice(0, MAX_ITEMS);
  const events = parsed.events.slice(0, MAX_ITEMS);

  await withHub(user.id, async (tx) => {
    for (const t of tasks) {
      await tx.task.create({
        data: {
          title: t.title.slice(0, 200),
          hubId: hub.id,
          dueDate: fromDateInput(t.dueDate),
          ventureId: t.ventureName ? (vByName.get(t.ventureName.toLowerCase()) ?? null) : null,
          assignedToId: t.assigneeName
            ? (mByName.get(t.assigneeName.toLowerCase()) ?? null)
            : null,
          priority: t.priority ?? "MED",
          createdById: user.id,
        },
      });
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

  revalidatePath("/today");
  revalidatePath("/tasks");
  revalidatePath("/calendar");

  const total = tasks.length + events.length;
  if (total === 0) return { ok: true, message: "Nothing actionable in that." };
  const bits: string[] = [];
  if (tasks.length) bits.push(`${tasks.length} task${tasks.length === 1 ? "" : "s"}`);
  if (events.length) bits.push(`${events.length} event${events.length === 1 ? "" : "s"}`);
  const titles = [...tasks.map((t) => t.title), ...events.map((e) => e.title)].join("; ");
  return { ok: true, message: `Added ${bits.join(" and ")} — ${titles}` };
}

export async function weeklyBriefing(): Promise<{ ok: boolean; text: string }> {
  const { user, hub } = await requireHub();
  if (!aiEnabled()) {
    return { ok: false, text: "Assistant isn’t configured (no ANTHROPIC_API_KEY)." };
  }

  const d = await withHub(user.id, (tx) => dashboard(tx, hub.id));
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
        "Write a short plain briefing for a small crew running several small businesses plus personal life. 4–6 sentences, lead with what's most urgent, no bullet points, no preamble, no sign-off. If there's almost nothing, say it's a quiet week.",
      messages: [
        {
          role: "user",
          content: `Today is ${format(d.now, "EEEE, MMMM d")}.\n\n${lines.join("\n")}`,
        },
      ],
    });
    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    return { ok: true, text: text || "No briefing generated." };
  } catch (err) {
    return {
      ok: false,
      text: err instanceof Error ? `Assistant error: ${err.message}` : "Assistant error.",
    };
  }
}
