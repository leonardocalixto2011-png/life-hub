import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { ai, aiEnabled, AI_MODEL } from "@/lib/ai";
import type { Draft } from "@/lib/parse";

export const ACTIONABLE_CATEGORIES = [
  "BILL_PAYMENT",
  "SUBSCRIPTION_RENEWAL",
  "APPOINTMENT_EVENT",
  "NEEDS_REPLY",
] as const;

const ClassifySchema = z.object({
  category: z.enum([...ACTIONABLE_CATEGORIES, "INFORMATIONAL", "PROMOTIONAL"]),
  confidence: z.number().min(0).max(1),
  title: z.string().nullable(), // a short human label, e.g. "Hydro-Québec bill"
  amount: z.number().nullable(), // dollars, bill/subscription only
  date: z.string().nullable(), // YYYY-MM-DD — due/renewal/event date
  time: z.string().nullable(), // YYYY-MM-DDTHH:MM — event start, if it has a clock time
  suggestedReply: z.string().nullable(), // needs_reply only, 2-4 sentences, never sent automatically
});

export type ActionableCategory = (typeof ACTIONABLE_CATEGORIES)[number];
export type EmailCategory = ActionableCategory | "INFORMATIONAL" | "PROMOTIONAL";

export type ClassifyInput = {
  subject: string;
  from: string;
  snippet: string;
  body: string;
};

export type ClassifyResult = {
  category: EmailCategory;
  confidence: number;
  /** null for INFORMATIONAL/PROMOTIONAL — those are logged and discarded, never stored. */
  draft: Draft | null;
};

function toDraft(
  parsed: z.infer<typeof ClassifySchema>,
  category: ActionableCategory,
  input: ClassifyInput,
): Draft {
  const amountNote = parsed.amount != null ? `$${parsed.amount.toFixed(2)} — ` : "";
  const base: Draft = {
    kind: "task",
    title: parsed.title || input.subject || "(no subject)",
    date: parsed.date,
    time: parsed.time,
    amount: parsed.amount != null ? parsed.amount.toFixed(2) : null,
    entryType: "EXPENSE",
    billingCycle: "MONTHLY",
    priority: "MED",
    ventureId: null,
    note: `${amountNote}${input.snippet}`.slice(0, 500),
    visibility: "SHARED",
    suggestedReply: null,
  };

  switch (category) {
    case "BILL_PAYMENT":
      return { ...base, kind: "task" };
    case "SUBSCRIPTION_RENEWAL":
      return { ...base, kind: "subscription" };
    case "APPOINTMENT_EVENT":
      return { ...base, kind: "event" };
    case "NEEDS_REPLY":
      return {
        ...base,
        kind: "needs_reply",
        note: input.snippet.slice(0, 500),
        suggestedReply: parsed.suggestedReply,
      };
  }
}

/**
 * Classifies one email into the six categories from the mail-connector
 * prompt. Returns null when the assistant is unconfigured or the call fails
 * — callers should fall back to creating a plain review item rather than
 * silently dropping the email (see lib/mail/poll.ts).
 */
export async function classifyEmail(input: ClassifyInput): Promise<ClassifyResult | null> {
  if (!aiEnabled()) return null;

  const system = [
    "Classify one email for a shared life/business admin app into exactly one category:",
    "- BILL_PAYMENT: a bill or payment with a due date/amount, not yet paid.",
    "- SUBSCRIPTION_RENEWAL: a recurring paid service renewing or about to renew.",
    "- APPOINTMENT_EVENT: a calendar-worthy appointment, meeting, or booking with a date (and usually a time).",
    "- NEEDS_REPLY: the sender is expecting a personal response from the recipient.",
    "- INFORMATIONAL: worth knowing, nothing to file or act on (a receipt for something already paid, a shipping notice, a newsletter with real content).",
    "- PROMOTIONAL: marketing/advertising — ignore.",
    "confidence: 0-1, how sure you are of the category.",
    "title: a short human label (e.g. \"Hydro-Québec bill\"), not the raw subject line, or null.",
    "amount: dollar amount if a bill or subscription cost is stated, else null.",
    "date: YYYY-MM-DD for the due/renewal/event date if stated, else null.",
    "time: YYYY-MM-DDTHH:MM if the event has a specific clock time, else null.",
    "suggestedReply: for NEEDS_REPLY only, a short 2-4 sentence draft reply in a plain, direct tone — this is only ever shown to a human to edit and send themselves, never sent automatically. Null for every other category.",
  ].join("\n");

  const message = [`From: ${input.from}`, `Subject: ${input.subject}`, "", input.body || input.snippet]
    .join("\n")
    .slice(0, 6000);

  try {
    const res = await ai().messages.parse({
      model: AI_MODEL,
      max_tokens: 1024,
      output_config: { effort: "low", format: zodOutputFormat(ClassifySchema) },
      system,
      messages: [{ role: "user", content: message }],
    });
    const parsed = res.parsed_output;
    if (!parsed) return null;

    if (parsed.category === "INFORMATIONAL" || parsed.category === "PROMOTIONAL") {
      return { category: parsed.category, confidence: parsed.confidence, draft: null };
    }
    return {
      category: parsed.category,
      confidence: parsed.confidence,
      draft: toDraft(parsed, parsed.category, input),
    };
  } catch {
    return null;
  }
}
