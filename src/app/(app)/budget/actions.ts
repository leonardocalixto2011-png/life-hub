"use server";

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { withHub } from "@/lib/hub-context";
import { assertVentureInHub } from "@/lib/membership";
import { requireHub } from "@/lib/session";
import { fromDateInput } from "@/lib/format";
import { dollarsToCents } from "@/lib/money";
import { revalidateContent } from "@/lib/revalidate";

const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

const createSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]),
  amount: z.string().min(1, "Amount is required"),
  currency: z.preprocess(
    (v) => (typeof v === "string" && v ? v.toUpperCase() : "CAD"),
    z.string().length(3),
  ),
  category: z.string().trim().min(1, "Category is required").max(60),
  ventureId: z.preprocess(emptyToNull, z.string().cuid().nullable()),
  description: z.preprocess(emptyToNull, z.string().trim().max(500).nullable()),
  date: z.preprocess(emptyToNull, z.string().nullable()),
  paidById: z.preprocess(emptyToNull, z.string().cuid().nullable()),
  split: z.enum(["none", "50", "60", "40", "0"]).default("none"),
});

/**
 * `paidById` is a plain member id with no FK, so this is the only thing
 * stopping a crafted form from attributing an expense to someone outside the
 * hub. Membership of *another* user isn't readable through app_user (the
 * HubMembership policy is self-only), hence the trusted client.
 */
async function assertMember(hubId: string, userId: string) {
  const m = await prisma.hubMembership.findFirst({
    where: { hubId, userId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!m) throw new Error("That person isn't a member of this hub.");
}

async function sharing(hubId: string, viewerId: string, d: z.infer<typeof createSchema>) {
  const payerSharePct = d.type === "EXPENSE" && d.split !== "none" ? Number(d.split) : null;
  const paidById = d.paidById ?? (payerSharePct != null ? viewerId : null);
  if (paidById && paidById !== viewerId) await assertMember(hubId, paidById);
  return { paidById, payerSharePct };
}

function amountOf(raw: string): number {
  const cents = dollarsToCents(raw);
  if (cents == null || cents <= 0) throw new Error("Amount must be a positive number");
  return cents;
}

export async function createEntry(fd: FormData) {
  const { user, hub } = await requireHub();
  const res = createSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!res.success) throw new Error(res.error.issues[0]?.message ?? "Invalid input");
  const d = res.data;
  const amountCents = amountOf(d.amount);
  const share = await sharing(hub.id, user.id, d);
  await assertVentureInHub(hub.id, d.ventureId);

  await withHub(user.id, (tx) =>
    tx.budgetEntry.create({
      data: {
        type: d.type,
        amountCents,
        hubId: hub.id,
        currency: d.currency,
        category: d.category,
        ventureId: d.ventureId,
        description: d.description,
        date: fromDateInput(d.date) ?? new Date(),
        createdById: user.id,
        ...share,
      },
    }),
  );

  revalidateContent();
}

const updateSchema = createSchema.extend({ id: z.string().cuid() });

export async function updateEntry(fd: FormData) {
  const { user, hub } = await requireHub();
  const res = updateSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!res.success) throw new Error(res.error.issues[0]?.message ?? "Invalid input");
  const d = res.data;
  const amountCents = amountOf(d.amount);
  const share = await sharing(hub.id, user.id, d);
  await assertVentureInHub(hub.id, d.ventureId);

  // updateMany so the hub is part of the match: an id from another hub the
  // user belongs to must not be editable from this one.
  const { count } = await withHub(user.id, (tx) =>
    tx.budgetEntry.updateMany({
      where: { id: d.id, hubId: hub.id },
      data: {
        type: d.type,
        amountCents,
        currency: d.currency,
        category: d.category,
        ventureId: d.ventureId,
        description: d.description,
        date: fromDateInput(d.date) ?? new Date(),
        ...share,
      },
    }),
  );
  if (count === 0) throw new Error("Not found.");

  revalidateContent();
}

/**
 * Everything needed to put a deleted entry back, read from the database at the
 * moment it is deleted. The row's Undo hands it back to `restoreEntry`.
 */
const snapshotSchema = z.object({
  hubId: z.string().cuid(),
  type: z.enum(["INCOME", "EXPENSE"]),
  amountCents: z.number().int().positive().max(100_000_000),
  currency: z.string().length(3),
  category: z.string().trim().min(1).max(60),
  ventureId: z.string().cuid().nullable(),
  description: z.string().max(500).nullable(),
  date: z.coerce.date(),
  paidById: z.string().cuid().nullable(),
  payerSharePct: z.number().int().min(0).max(100).nullable(),
  isSettlement: z.boolean(),
});
export type EntrySnapshot = z.infer<typeof snapshotSchema>;

/**
 * Deletes an entry and returns what it held, so the toast can offer Undo
 * instead of the row asking "are you sure?" every time. The hub is part of
 * every match: an id from another hub must not be deletable from here.
 */
export async function deleteEntry(
  id: string,
): Promise<{ ok: true; snapshot: EntrySnapshot } | { ok: false; error: string }> {
  const { user, hub } = await requireHub();
  const parsed = z.string().cuid().safeParse(id);
  if (!parsed.success) return { ok: false, error: "Not found." };
  const snapshot = await withHub(user.id, async (tx) => {
    const row = await tx.budgetEntry.findFirst({
      where: { id: parsed.data, hubId: hub.id },
      select: {
        hubId: true,
        type: true,
        amountCents: true,
        currency: true,
        category: true,
        ventureId: true,
        description: true,
        date: true,
        paidById: true,
        payerSharePct: true,
        isSettlement: true,
      },
    });
    if (!row) return null;
    await tx.budgetEntry.deleteMany({ where: { id: parsed.data, hubId: hub.id } });
    return row;
  });
  if (!snapshot) return { ok: false, error: "Not found." };
  revalidateContent();
  return { ok: true, snapshot };
}

/**
 * Undo for `deleteEntry`: writes the entry back with the same fields,
 * shared-expense split included. The snapshot comes back from the browser, so
 * it is treated like any other input — validated, written into the *current*
 * hub only, with the venture and payer re-checked against that hub. The
 * restored row gets a new id and the restorer as its author.
 */
export async function restoreEntry(
  input: z.input<typeof snapshotSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, hub } = await requireHub();
  const p = snapshotSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Could not undo" };
  const d = p.data;
  // Switched hub in another tab since the delete: put it back where it was
  // or not at all, never into whichever hub is open now.
  if (d.hubId !== hub.id) return { ok: false, error: "Could not undo" };
  // A venture deleted in the meantime shouldn't block getting the entry back.
  let ventureId = d.ventureId;
  try {
    await assertVentureInHub(hub.id, ventureId);
  } catch {
    ventureId = null;
  }
  try {
    if (d.paidById && d.paidById !== user.id) await assertMember(hub.id, d.paidById);
  } catch {
    return { ok: false, error: "Could not undo" };
  }
  // A split or a settle-up only means something on an expense someone paid.
  const shared = d.type === "EXPENSE" && d.paidById != null;

  await withHub(user.id, (tx) =>
    tx.budgetEntry.create({
      data: {
        hubId: hub.id,
        type: d.type,
        amountCents: d.amountCents,
        currency: d.currency.toUpperCase(),
        category: d.category,
        ventureId,
        description: d.description,
        date: d.date,
        createdById: user.id,
        paidById: d.paidById,
        payerSharePct: shared ? d.payerSharePct : null,
        isSettlement: shared ? d.isSettlement : false,
      },
    }),
  );
  revalidateContent();
  return { ok: true };
}

/**
 * Records "X paid Y back". Stored as an expense X paid entirely for the
 * others (payer share 0) and flagged `isSettlement`, so it moves the shared
 * balance and nothing else — in/out totals skip it.
 */
export async function settleUp(fd: FormData) {
  const { user, hub } = await requireHub();
  const d = z
    .object({
      fromId: z.string().cuid(),
      toName: z.string().trim().max(80),
      amount: z.string().min(1),
    })
    .parse({ fromId: fd.get("fromId"), toName: fd.get("toName"), amount: fd.get("amount") });
  await assertMember(hub.id, d.fromId);
  const amountCents = amountOf(d.amount);

  await withHub(user.id, (tx) =>
    tx.budgetEntry.create({
      data: {
        hubId: hub.id,
        type: "EXPENSE",
        amountCents,
        currency: hub.currency,
        category: "Settle up",
        description: d.toName ? `Paid back ${d.toName}` : "Paid back",
        date: new Date(),
        createdById: user.id,
        paidById: d.fromId,
        payerSharePct: 0,
        isSettlement: true,
      },
    }),
  );
  revalidateContent();
}

export async function setBudgetTarget(fd: FormData) {
  const { user, hub } = await requireHub();
  const d = z
    .object({
      category: z.string().trim().min(1, "Category is required").max(60),
      amount: z.string().min(1, "Amount is required"),
    })
    .parse({ category: fd.get("category"), amount: fd.get("amount") });
  const monthlyCents = amountOf(d.amount);

  await withHub(user.id, (tx) =>
    tx.budgetTarget.upsert({
      where: { hubId_category: { hubId: hub.id, category: d.category } },
      update: { monthlyCents },
      create: { hubId: hub.id, category: d.category, monthlyCents },
    }),
  );
  revalidateContent();
}

export async function deleteBudgetTarget(fd: FormData) {
  const { user, hub } = await requireHub();
  const id = z.string().cuid().parse(fd.get("id"));
  await withHub(user.id, (tx) => tx.budgetTarget.deleteMany({ where: { id, hubId: hub.id } }));
  revalidateContent();
}

// ---- usual payments (/today "À confirmer") ---------------------------------

const usualSchema = z.object({
  category: z.string().trim().min(1).max(60),
  amountCents: z.number().int().positive().max(100_000_000),
  ventureId: z.string().cuid().nullable(),
});

/**
 * One tap on a usual payment: logs today's expense with the pattern's
 * category and amount. Returns the row so the toast's Undo can remove it —
 * the entry is plain (no description, not a settle-up), which is exactly
 * what `undoFavorite` is scoped to delete, so the same undo serves both.
 */
export async function confirmUsualPayment(
  input: z.input<typeof usualSchema>,
): Promise<{ ok: true; created: { kind: "BUDGET"; id: string } } | { ok: false; error: string }> {
  const { user, hub } = await requireHub();
  const p = usualSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid input" };
  // A venture carried from an old entry may since have been deleted or be
  // from elsewhere; drop it rather than refuse the payment.
  let ventureId = p.data.ventureId;
  try {
    await assertVentureInHub(hub.id, ventureId);
  } catch {
    ventureId = null;
  }

  const row = await withHub(user.id, (tx) =>
    tx.budgetEntry.create({
      data: {
        hubId: hub.id,
        type: "EXPENSE",
        amountCents: p.data.amountCents,
        currency: hub.currency,
        category: p.data.category,
        ventureId,
        date: new Date(),
        createdById: user.id,
      },
      select: { id: true },
    }),
  );
  revalidateContent();
  return { ok: true, created: { kind: "BUDGET", id: row.id } };
}
