import { z } from "zod";

import { blobUrlSchema } from "@/lib/blob-url";

/**
 * Validates a client-supplied `Draft` before it is committed. Lives in a plain
 * module because a `"use server"` file may only export async functions, and
 * both `commitDrafts` (quick-add) and `acceptReview` (the inbox) need it — the
 * inbox used to hand whatever the browser sent straight to `commitDraftsCore`.
 */
export const CommitSchema = z.object({
  kind: z.enum(["task", "event", "deadline", "subscription", "budget", "needs_reply"]),
  title: z.string().trim().min(1).max(200),
  date: z.string().nullable(),
  time: z.string().nullable(),
  amount: z.string().nullable(),
  entryType: z.enum(["INCOME", "EXPENSE"]),
  billingCycle: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"]),
  priority: z.enum(["LOW", "MED", "HIGH"]),
  ventureId: z.string().nullable(),
  note: z.string().nullable(),
  visibility: z.enum(["PRIVATE", "SHARED"]).default("SHARED"),
  suggestedReply: z.string().nullable().default(null),
  // The uploaded photo a draft came from. Only our own Blob host in
  // production — a task photo loads in every hub member's browser.
  imageUrl: blobUrlSchema.nullable().optional(),
  // Budget expenses only: who paid, and the part they keep (see lib/couple.ts).
  // Membership of `paidById` is checked in commitDraftsCore, not here.
  paidById: z.string().cuid().nullable().optional(),
  payerSharePct: z.number().int().min(0).max(100).nullable().optional(),
});
