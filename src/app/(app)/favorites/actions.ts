"use server";

import { revalidatePath } from "next/cache";
import { addHours } from "date-fns";
import { z } from "zod";

import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { assertVentureInHub } from "@/lib/membership";
import { revalidateContent } from "@/lib/revalidate";
import { dollarsToCents } from "@/lib/money";
import { formResult, type ActionResult } from "@/lib/action-result";
import { FAVORITE_CAP, ownFavorites, sameFavorite } from "@/lib/favorites";

/**
 * Favourites are personal and live in one hub. Every query below carries
 * `ownFavorites(hub, user)` — the app-level mirror of the `quick_favorite_own`
 * RLS policy — so a bare id from the browser can never reach someone else's.
 */

const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

const fieldsSchema = z.object({
  label: z.string().trim().min(1, "Give it a name").max(60),
  kind: z.enum(["TASK", "BUDGET", "EVENT"]).default("BUDGET"),
  amount: z.preprocess(emptyToNull, z.string().max(20).nullable()),
  entryType: z.enum(["INCOME", "EXPENSE"]).default("EXPENSE"),
  category: z.preprocess(emptyToNull, z.string().trim().max(60).nullable()),
  ventureId: z.preprocess(emptyToNull, z.string().cuid().nullable()),
});

function amountCentsOf(kind: string, raw: string | null): number | null {
  if (raw == null) {
    if (kind === "BUDGET") throw new Error("A budget favourite needs an amount");
    return null;
  }
  // "4,50" is how half of this app writes money; dollarsToCents would read 450.
  const cents = dollarsToCents(raw.trim().replace(/,(\d{1,2})$/, ".$1"));
  if (cents == null || cents <= 0) throw new Error("Amount must be a positive number");
  return cents;
}

/** Chips render in the app layout, so every page must drop its cached copy. */
function revalidateFavorites() {
  revalidatePath("/", "layout");
  revalidatePath("/favorites");
}

// ---- one tap ---------------------------------------------------------------

export type Created = { kind: "TASK" | "BUDGET" | "EVENT"; id: string };

/** Creates the favourite's entry for today. Returns what to delete on Undo. */
export async function applyFavorite(
  id: string,
): Promise<{ ok: true; created: Created } | { ok: false; error: string }> {
  const { user, hub } = await requireHub();
  const favId = z.string().cuid().safeParse(id);
  if (!favId.success) return { ok: false, error: "Not found." };

  const created = await withHub(user.id, async (tx): Promise<Created | null> => {
    const fav = await tx.quickFavorite.findFirst({
      where: { id: favId.data, ...ownFavorites(hub.id, user.id) },
    });
    if (!fav) return null;
    const now = new Date();

    if (fav.kind === "BUDGET") {
      if (!fav.amountCents) return null;
      const row = await tx.budgetEntry.create({
        data: {
          hubId: hub.id,
          type: fav.entryType,
          amountCents: fav.amountCents,
          currency: hub.currency,
          category: fav.category ?? fav.label,
          ventureId: fav.ventureId,
          date: now,
          createdById: user.id,
        },
        select: { id: true },
      });
      return { kind: "BUDGET", id: row.id };
    }
    if (fav.kind === "EVENT") {
      const row = await tx.event.create({
        data: {
          hubId: hub.id,
          title: fav.label,
          startAt: now,
          endAt: addHours(now, 1),
          ventureId: fav.ventureId,
          createdById: user.id,
        },
        select: { id: true },
      });
      return { kind: "EVENT", id: row.id };
    }
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    const row = await tx.task.create({
      data: {
        hubId: hub.id,
        title: fav.label,
        amountCents: fav.amountCents,
        ventureId: fav.ventureId,
        dueDate: today,
        createdById: user.id,
      },
      select: { id: true },
    });
    return { kind: "TASK", id: row.id };
  });

  if (!created) return { ok: false, error: "Not found." };
  revalidateContent();
  return { ok: true, created };
}

const undoSchema = z.object({ kind: z.enum(["TASK", "BUDGET", "EVENT"]), id: z.string().cuid() });

/** How long the toast's Undo stays honoured. The toast is gone long before this. */
const UNDO_WINDOW_MS = 5 * 60 * 1000;

/**
 * Undo for the toast: deletes only a row this person created, in this hub,
 * in the last few minutes. The id arrives from the client, so without the
 * time bound this would be a general "delete any of my rows" endpoint.
 */
export async function undoFavorite(input: Created): Promise<{ ok: boolean }> {
  const { user, hub } = await requireHub();
  const p = undoSchema.safeParse(input);
  if (!p.success) return { ok: false };
  const where = {
    id: p.data.id,
    hubId: hub.id,
    createdById: user.id,
    createdAt: { gte: new Date(Date.now() - UNDO_WINDOW_MS) },
  };
  const { count } = await withHub(user.id, (tx) => {
    // A favourite writes a plain entry: never a settle-up, never a
    // description (logDebtPayment's entries carry "Debt payment"). Anything
    // else was not made by a favourite tap, so it isn't this undo's to delete.
    if (p.data.kind === "BUDGET") {
      return tx.budgetEntry.deleteMany({ where: { ...where, isSettlement: false, description: null } });
    }
    if (p.data.kind === "EVENT") return tx.event.deleteMany({ where });
    return tx.task.deleteMany({ where });
  });
  if (count > 0) revalidateContent();
  return { ok: count > 0 };
}

// ---- after a quick-add save -------------------------------------------------

const fromDraftSchema = z.object({
  kind: z.enum(["task", "budget"]),
  title: z.string().trim().min(1).max(60),
  amount: z.string().max(20).nullable(),
  entryType: z.enum(["INCOME", "EXPENSE"]),
  ventureId: z.string().cuid().nullable(),
});

/** "⭐ Save as favourite" under a quick-add success message. */
export async function saveDraftAsFavorite(
  input: z.infer<typeof fromDraftSchema>,
): Promise<{ status: "saved" | "exists" | "full" | "invalid" }> {
  const { user, hub } = await requireHub();
  const p = fromDraftSchema.safeParse(input);
  if (!p.success) return { status: "invalid" };
  const kind = p.data.kind === "budget" ? "BUDGET" : "TASK";
  const amountCents = dollarsToCents(p.data.amount);
  if (kind === "BUDGET" && (amountCents == null || amountCents <= 0)) return { status: "invalid" };
  await assertVentureInHub(hub.id, p.data.ventureId);

  const candidate = { label: p.data.title, kind, amountCents, entryType: p.data.entryType };
  const status = await withHub(user.id, async (tx) => {
    const mine = await tx.quickFavorite.findMany({
      where: ownFavorites(hub.id, user.id),
      select: { label: true, kind: true, amountCents: true, entryType: true, sortOrder: true },
    });
    if (mine.some((f) => sameFavorite(f, candidate))) return "exists" as const;
    if (mine.length >= FAVORITE_CAP) return "full" as const;
    await tx.quickFavorite.create({
      data: {
        hubId: hub.id,
        createdById: user.id,
        label: p.data.title,
        kind,
        amountCents,
        entryType: p.data.entryType,
        ventureId: p.data.ventureId,
        sortOrder: mine.reduce((m, f) => Math.max(m, f.sortOrder), -1) + 1,
      },
    });
    return "saved" as const;
  });
  if (status === "saved") revalidateFavorites();
  return { status };
}

// ---- management page ------------------------------------------------------

export async function createFavorite(fd: FormData): Promise<ActionResult> {
  return formResult(async () => {
    const { user, hub } = await requireHub();
    const res = fieldsSchema.safeParse(Object.fromEntries(fd.entries()));
    if (!res.success) throw new Error(res.error.issues[0]?.message ?? "Invalid input");
    const d = res.data;
    const amountCents = amountCentsOf(d.kind, d.amount);
    await assertVentureInHub(hub.id, d.ventureId);

    await withHub(user.id, async (tx) => {
      const mine = await tx.quickFavorite.findMany({
        where: ownFavorites(hub.id, user.id),
        select: { label: true, kind: true, amountCents: true, entryType: true, sortOrder: true },
      });
      if (mine.length >= FAVORITE_CAP) {
        throw new Error("You can keep up to 12 favourites per hub. Delete one first.");
      }
      if (mine.some((f) => sameFavorite(f, { label: d.label, kind: d.kind, amountCents, entryType: d.entryType }))) {
        throw new Error("You already have that favourite.");
      }
      await tx.quickFavorite.create({
        data: {
          hubId: hub.id,
          createdById: user.id,
          label: d.label,
          kind: d.kind,
          amountCents,
          entryType: d.entryType,
          category: d.kind === "BUDGET" ? d.category : null,
          ventureId: d.ventureId,
          sortOrder: mine.reduce((m, f) => Math.max(m, f.sortOrder), -1) + 1,
        },
      });
    });
    revalidateFavorites();
  });
}

const updateSchema = z.object({
  id: z.string().cuid(),
  label: z.string().trim().min(1, "Give it a name").max(60),
  amount: z.preprocess(emptyToNull, z.string().max(20).nullable()),
});

/** Rename / change the amount. Kind and venture stay; delete and re-add to change those. */
export async function updateFavorite(fd: FormData): Promise<ActionResult> {
  return formResult(async () => {
    const { user, hub } = await requireHub();
    const res = updateSchema.safeParse(Object.fromEntries(fd.entries()));
    if (!res.success) throw new Error(res.error.issues[0]?.message ?? "Invalid input");
    const d = res.data;
    await withHub(user.id, async (tx) => {
      const fav = await tx.quickFavorite.findFirst({
        where: { id: d.id, ...ownFavorites(hub.id, user.id) },
        select: { kind: true },
      });
      if (!fav) throw new Error("Not found.");
      await tx.quickFavorite.updateMany({
        where: { id: d.id, ...ownFavorites(hub.id, user.id) },
        data: { label: d.label, amountCents: amountCentsOf(fav.kind, d.amount) },
      });
    });
    revalidateFavorites();
  });
}

export async function deleteFavorite(fd: FormData): Promise<void> {
  const { user, hub } = await requireHub();
  const id = z.string().cuid().parse(fd.get("id"));
  await withHub(user.id, (tx) =>
    tx.quickFavorite.deleteMany({ where: { id, ...ownFavorites(hub.id, user.id) } }),
  );
  revalidateFavorites();
}

/** Swap with the neighbour above or below, then renumber 0..n-1. */
export async function moveFavorite(fd: FormData): Promise<void> {
  const { user, hub } = await requireHub();
  const id = z.string().cuid().parse(fd.get("id"));
  const dir = z.enum(["up", "down"]).parse(fd.get("dir"));
  await withHub(user.id, async (tx) => {
    const list = await tx.quickFavorite.findMany({
      where: ownFavorites(hub.id, user.id),
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    const i = list.findIndex((f) => f.id === id);
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    for (let k = 0; k < list.length; k++) {
      await tx.quickFavorite.updateMany({
        where: { id: list[k].id, ...ownFavorites(hub.id, user.id) },
        data: { sortOrder: k },
      });
    }
  });
  revalidateFavorites();
}
