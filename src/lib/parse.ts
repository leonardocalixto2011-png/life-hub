import { addDays, format } from "date-fns";
import { recordAiSpend } from "@/lib/ai-budget";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { ai, aiEnabled, fastEffort, AI_MODEL_FAST } from "@/lib/ai";
import { reportError } from "@/lib/observability";

// "needs_reply" only ever comes from the mail connector's classifier
// (lib/mail/classify.ts), never from this file's own parseText() — accepting
// one doesn't create any Task/Deadline/etc row, it just marks the ReviewItem
// handled (see commitDraftsCore in lib/commit-drafts.ts).
export type DraftKind = "task" | "event" | "deadline" | "subscription" | "budget" | "needs_reply";

export type Draft = {
  kind: DraftKind;
  title: string; // the email subject, for needs_reply
  date: string | null; // YYYY-MM-DD
  time: string | null; // YYYY-MM-DDTHH:MM
  amount: string | null; // dollars as a string
  entryType: "INCOME" | "EXPENSE";
  billingCycle: "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY" | "CUSTOM";
  priority: "LOW" | "MED" | "HIGH";
  ventureId: string | null;
  note: string | null; // also doubles as the email snippet, for needs_reply
  visibility: "PRIVATE" | "SHARED";
  suggestedReply: string | null; // needs_reply only — never auto-sent, just a starting point
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

/**
 * Upstream AI failures mapped to something a person can act on. Anything the
 * operator needs to fix — no credit, bad key, model gone — reads the same to
 * the user, because none of it is theirs to resolve and the specifics leak
 * account state.
 */
function friendlyAiError(err: unknown): string {
  const status = (err as { status?: number })?.status;
  if (status === 429) return "The assistant is busy right now — try again in a moment.";
  if (status === 401 || status === 403) return "The assistant isn't set up correctly. An admin needs to check the server config.";
  if (typeof status === "number" && status >= 500) return "The assistant is having trouble. Try again shortly.";
  return "The assistant is temporarily unavailable.";
}

export type ParseOutcome =
  | { ok: true; drafts: Draft[]; truncated?: boolean }
  | { ok: false; error: string };

/**
 * Turn freeform text (quick-add line, forwarded email, SMS) into reviewable
 * drafts. No auth — callers gate. Returns an error string when AI is off or the
 * text yields nothing actionable.
 *
 * `ventures` is the hub's venture list, fetched by the caller in its own short
 * withHub *before* calling here. Never run this inside a transaction: the
 * Claude call takes seconds, and holding an open transaction (and a pooled
 * connection) across it starves the pool and can trip the transaction
 * timeout. Empty on the inbound-email path (src/app/api/inbound/route.ts), so
 * venture matching is skipped there and drafts come back with ventureId: null
 * for the user to fill in on Accept.
 */
export async function parseText(
  text: string,
  ventures: VentureRef[] = [],
  maxItems = 25,
  /**
   * Whose AI budget this call is charged to — a user id from the app, a hub
   * id from inbound mail, which has no user attached. Optional so the two
   * existing callers can adopt it independently; when absent the call still
   * runs but nothing is metered, which is the pre-existing behaviour.
   */
  subject?: string,
): Promise<ParseOutcome> {
  const clean = text.trim();
  if (!clean) return { ok: false, error: "Nothing to parse." };
  if (!aiEnabled()) {
    return { ok: false, error: "Parsing needs ANTHROPIC_API_KEY set on the server." };
  }

  const system = [
    "Convert freeform notes (or a forwarded email) into structured items for a shared life/business admin app.",
    ...itemRules(ventures),
    "Only include items clearly present in the text. Empty items array if nothing is actionable.",
  ].join("\n");

  let parsed: z.infer<typeof AiSchema> | null = null;
  let truncated = false;
  try {
    const res = await ai().messages.parse({
      model: AI_MODEL_FAST,
      // A long multi-item paste (e.g. a dozen budget lines) needs real
      // headroom — each item's structured JSON runs ~150-250 tokens, so the
      // old 1536 silently truncated anything past ~9-10 items. `stop_reason`
      // below still catches the (now much rarer) case of an even longer paste.
      max_tokens: 4096,
      output_config: { ...fastEffort(), format: zodOutputFormat(AiSchema) },
      system,
      messages: [{ role: "user", content: clean.slice(0, 6000) }],
    });
    if (subject) await recordAiSpend(subject, res.usage);
    parsed = res.parsed_output;
    truncated = res.stop_reason === "max_tokens";
  } catch (err) {
    // Never surface the upstream message. It gets written into a ReviewItem
    // note and rendered in the review inbox, and Anthropic's error bodies
    // carry operator detail — billing state, request ids — that is not the
    // user's problem and not theirs to see. The real error goes to the logs
    // and the alert webhook instead.
    await reportError("ai.parse_failed", err, { model: AI_MODEL_FAST });
    return { ok: false, error: friendlyAiError(err) };
  }
  return toOutcome(parsed, ventures, maxItems, truncated);
}

/** What `listVentures` returns, narrowed to the two fields matching needs. */
export type VentureRef ={ id: string; name: string };

/**
 * The part of the system prompt both parsers share: which kind to pick, the
 * field formats, and the venture list. Kept in one place so a photo and a
 * sentence describing the same bill come back as the same draft.
 *
 * "Today" is the server's local date — process TZ is pinned to
 * America/Toronto in src/instrumentation.ts, so this is Montréal's today, not
 * UTC's (which rolls over at 8 p.m. here).
 *
 * The next seven dates are spelled out because the fast model's weekday
 * arithmetic is unreliable: tested on a Monday, "vendredi" came back as a
 * Saturday and "dimanche" as today. A lookup it can copy from fixes both.
 */
function itemRules(ventures: VentureRef[]): string[] {
  const today = new Date();
  const week = Array.from({ length: 7 }, (_, i) => format(addDays(today, i + 1), "EEEE yyyy-MM-dd"));
  return [
    `Today is ${format(today, "EEEE, yyyy-MM-dd")}. Resolve relative dates against it.`,
    `The next seven days: ${week.join(", ")}. A bare weekday ("friday", "vendredi") means the next one in this list.`,
    "Pick kind per item:",
    "- event: has a specific clock time.",
    "- subscription: a recurring paid service; set billingCycle, and put the next renewal in date if known.",
    "- budget: a payment already made, or income, with an amount; set entryType and amount (dollars).",
    "- task: a bill or payment still to make is a task with amount and date = when it's due.",
    "- deadline: a hard dated milestone, no clock time, no money.",
    "- task: everything else.",
    "date = YYYY-MM-DD or null. time = YYYY-MM-DDTHH:MM or null. amount = dollars number or null.",
    "Write titles and notes in the language of the input (French stays French).",
    `Ventures (exact name or null): ${ventures.map((v) => v.name).join(", ") || "none"}.`,
  ];
}

/** Model output → reviewable drafts, shared by parseText and parseImage. */
function toOutcome(
  parsed: z.infer<typeof AiSchema> | null,
  ventures: VentureRef[],
  maxItems: number,
  truncated: boolean,
): ParseOutcome {
  if (!parsed || parsed.items.length === 0) {
    return { ok: false, error: "Nothing actionable found." };
  }

  const vByName = new Map(ventures.map((v) => [v.name.toLowerCase(), v.id]));

  if (parsed.items.length > maxItems) truncated = true;

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
    visibility: "SHARED",
    suggestedReply: null,
  }));

  return { ok: true, drafts, truncated: truncated || undefined };
}

/** The image types the Messages API accepts as a base64 image block. */
export const IMAGE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

/**
 * Turn a photo — a receipt, a bill, an invitation or poster, a renewal notice
 * — into the same reviewable drafts as parseText. No auth; the caller gates
 * (see parseImage in src/app/(app)/quick-actions.ts, which also enforces size
 * and type before anything reaches here).
 *
 * The image is never logged: on failure only the error and the model go to
 * reportError, exactly as on the text path. `ventures` comes from the caller,
 * fetched outside any transaction, for the same reason as parseText.
 */
export async function parseImage(
  image: { data: string; mediaType: ImageMediaType },
  ventures: VentureRef[],
  subject: string,
  maxItems = 10,
): Promise<ParseOutcome> {
  if (!aiEnabled()) {
    return { ok: false, error: "Parsing needs ANTHROPIC_API_KEY set on the server." };
  }

  const system = [
    "Read a photo (receipt, bill, invitation, poster, renewal notice, appointment card…) and turn what it asks of the reader into structured items for a shared life/business admin app.",
    ...itemRules(ventures),
    "How to read common photos:",
    "- Store or restaurant receipt (already paid): one budget item, entryType EXPENSE, amount = the final total paid including tax and tip, date = purchase date, title = short category + merchant, in the receipt's language (e.g. \"Épicerie — Metro\" on a French receipt). Never one item per line.",
    "- Bill or invoice still to pay: a task, amount = amount due, date = due date, title = \"Pay <biller>\" (\"Payer <biller>\" in French).",
    "- Invitation, poster or appointment: an event when a clock time is shown (time set), otherwise a deadline with the date. Put the place in note.",
    "- Subscription or renewal notice: a subscription with billingCycle and the next renewal date.",
    "A date with no year is the next such date for anything upcoming, the most recent past one for a receipt.",
    "Keep note short (place, invoice number) and never copy card, account or client numbers into it.",
    "Only include items clearly visible in the photo. Empty items array if it shows nothing actionable.",
  ].join("\n");

  let parsed: z.infer<typeof AiSchema> | null = null;
  let truncated = false;
  try {
    const res = await ai().messages.parse({
      model: AI_MODEL_FAST,
      // A photo usually yields one or two items; this is headroom, not a target.
      max_tokens: 2048,
      output_config: { ...fastEffort(), format: zodOutputFormat(AiSchema) },
      system,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
            { type: "text", text: "Extract the items from this photo." },
          ],
        },
      ],
    });
    await recordAiSpend(subject, res.usage);
    parsed = res.parsed_output;
    truncated = res.stop_reason === "max_tokens";
  } catch (err) {
    await reportError("ai.parse_image_failed", err, { model: AI_MODEL_FAST });
    return { ok: false, error: friendlyAiError(err) };
  }
  return toOutcome(parsed, ventures, maxItems, truncated);
}
