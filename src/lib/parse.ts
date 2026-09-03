import { format } from "date-fns";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { ai, aiEnabled, AI_MODEL } from "@/lib/ai";
import { listVentures } from "@/lib/data";

export type DraftKind = "task" | "event" | "deadline" | "subscription" | "budget";

export type Draft = {
  kind: DraftKind;
  title: string;
  date: string | null; // YYYY-MM-DD
  time: string | null; // YYYY-MM-DDTHH:MM
  amount: string | null; // dollars as a string
  entryType: "INCOME" | "EXPENSE";
  billingCycle: "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY" | "CUSTOM";
  priority: "LOW" | "MED" | "HIGH";
  ventureId: string | null;
  note: string | null;
};

const AiSchema = z.object({
  items: z.array(
    z.object({
      kind: z.enum(["task", "event", "deadline", "subscription", "budget"]),
      title: z.string(),
      date: z.string().nullable(),
      time: z.string().nullable(),
      amount: z.number().nullable(),
      entryType: z.enum(["INCOME", "EXPENSE"]).nullable(),
      billingCycle: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"]).nullable(),
      priority: z.enum(["LOW", "MED", "HIGH"]).nullable(),
      ventureName: z.string().nullable(),
      note: z.string().nullable(),
    }),
  ),
});

export type ParseOutcome =
  | { ok: true; drafts: Draft[] }
  | { ok: false; error: string };

/**
 * Turn freeform text (quick-add line, forwarded email, SMS) into reviewable
 * drafts. No auth — callers gate. Returns an error string when AI is off or the
 * text yields nothing actionable.
 */
export async function parseText(text: string, maxItems = 10): Promise<ParseOutcome> {
  const clean = text.trim();
  if (!clean) return { ok: false, error: "Nothing to parse." };
  if (!aiEnabled()) {
    return { ok: false, error: "Parsing needs ANTHROPIC_API_KEY set on the server." };
  }

  const ventures = await listVentures();
  const today = new Date();

  const system = [
    "Convert freeform notes (or a forwarded email) into structured items for a shared life/business admin app.",
    `Today is ${format(today, "EEEE, yyyy-MM-dd")}. Resolve relative dates against it.`,
    "Pick kind per item:",
    "- event: has a specific clock time.",
    "- subscription: a recurring paid service; set billingCycle, and put the next renewal in date if known.",
    "- budget: a concrete payment or income with an amount; set entryType and amount (dollars).",
    "- deadline: a hard dated milestone, no clock time, no money.",
    "- task: everything else.",
    "date = YYYY-MM-DD or null. time = YYYY-MM-DDTHH:MM or null. amount = dollars number or null.",
    `Ventures (exact name or null): ${ventures.map((v) => v.name).join(", ") || "none"}.`,
    "Only include items clearly present in the text. Empty items array if nothing is actionable.",
  ].join("\n");

  let parsed: z.infer<typeof AiSchema> | null = null;
  try {
    const res = await ai().messages.parse({
      model: AI_MODEL,
      max_tokens: 1536,
      output_config: { effort: "low", format: zodOutputFormat(AiSchema) },
      system,
      messages: [{ role: "user", content: clean.slice(0, 6000) }],
    });
    parsed = res.parsed_output;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Assistant error." };
  }
  if (!parsed || parsed.items.length === 0) {
    return { ok: false, error: "Nothing actionable found." };
  }

  const vByName = new Map(ventures.map((v) => [v.name.toLowerCase(), v.id]));

  const drafts: Draft[] = parsed.items.slice(0, maxItems).map((it) => ({
    kind: it.kind,
    title: it.title.slice(0, 200),
    date: it.date,
    time: it.time,
    amount: it.amount != null ? it.amount.toFixed(2) : null,
    entryType: it.entryType ?? "EXPENSE",
    billingCycle: it.billingCycle ?? "MONTHLY",
    priority: it.priority ?? "MED",
    ventureId: it.ventureName ? (vByName.get(it.ventureName.toLowerCase()) ?? null) : null,
    note: it.note,
  }));

  return { ok: true, drafts };
}
