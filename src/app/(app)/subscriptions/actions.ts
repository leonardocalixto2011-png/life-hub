"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { fromDateInput } from "@/lib/format";
import { dollarsToCents } from "@/lib/money";
import { sameDay } from "@/lib/recur";
import { revalidateContent } from "@/lib/revalidate";
import { assertActiveMember, assertVentureInHub } from "@/lib/membership";

const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

const fields = {
  name: z.string().trim().min(1, "Name is required").max(200),
  cost: z.string().min(1, "Cost is required"),
  currency: z.preprocess(
    (v) => (typeof v === "string" && v ? v.toUpperCase() : "CAD"),
    z.string().length(3),
  ),
  billingCycle: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"]),
  renewalDate: z.string().min(1, "Renewal date is required"),
  cancelByDate: z.preprocess(emptyToNull, z.string().nullable()),
  ventureId: z.preprocess(emptyToNull, z.string().cuid().nullable()),
  ownerId: z.preprocess(emptyToNull, z.string().cuid().nullable()),
  notes: z.preprocess(emptyToNull, z.string().trim().max(2000).nullable()),
};

const createSchema = z.object(fields);
const updateSchema = z.object({ ...fields, id: z.string().cuid() });

function parse<T extends z.ZodTypeAny>(schema: T, fd: FormData): z.infer<T> {
  const res = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!res.success) throw new Error(res.error.issues[0]?.message ?? "Invalid input");
  return res.data;
}

/**
 * The owner is a plain user id from the form; RLS checks the row's hub, not
 * who it names, so it's verified against this hub's active members here.
 */
async function checkOwner(hubId: string, ownerId: string | null) {
  if (ownerId) await assertActiveMember(hubId, ownerId);
}

function data(d: z.infer<typeof createSchema>) {
  const costCents = dollarsToCents(d.cost);
  if (costCents == null || costCents < 0) throw new Error("Cost must be a positive number");
  return {
    name: d.name,
    costCents,
    currency: d.currency,
    billingCycle: d.billingCycle,
    renewalDate: fromDateInput(d.renewalDate)!,
    // An edited date is the new anchor; re-derived from it on the next roll.
    renewalDay: null,
    cancelByDate: fromDateInput(d.cancelByDate),
    ventureId: d.ventureId,
    ownerId: d.ownerId,
    notes: d.notes,
  };
}

export async function createSubscription(fd: FormData) {
  const { user, hub } = await requireHub();
  const d = data(parse(createSchema, fd));
  await checkOwner(hub.id, d.ownerId);
  await assertVentureInHub(hub.id, d.ventureId);
  await withHub(user.id, (tx) => tx.subscription.create({ data: { ...d, hubId: hub.id } }));
  revalidateContent();
}

export async function updateSubscription(fd: FormData) {
  const { user, hub } = await requireHub();
  const d = parse(updateSchema, fd);
  const values = data(d);
  await checkOwner(hub.id, values.ownerId);
  await assertVentureInHub(hub.id, values.ventureId);
  // Pinned to this hub in app code as well as by RLS.
  await withHub(user.id, async (tx) => {
    const current = await tx.subscription.findFirst({
      where: { id: d.id, hubId: hub.id },
      select: { renewalDate: true },
    });
    if (!current) throw new Error("Not found.");
    // The form re-submits the stored date on every save; only a changed day
    // resets the anchor, or a rolled Feb 28 would forget it was the 31st.
    const { renewalDay, ...rest } = values;
    const write = sameDay(current.renewalDate, values.renewalDate) ? rest : { ...rest, renewalDay };
    const { count } = await tx.subscription.updateMany({ where: { id: d.id, hubId: hub.id }, data: write });
    if (count === 0) throw new Error("Not found.");
  });
  revalidateContent(`/subscriptions/${d.id}`);
  redirect("/subscriptions");
}

export async function setSubscriptionStatus(fd: FormData) {
  const { user, hub } = await requireHub();
  const schema = z.object({
    id: z.string().cuid(),
    status: z.enum(["ACTIVE", "CANCELLED"]),
  });
  const { id, status } = schema.parse({ id: fd.get("id"), status: fd.get("status") });
  await withHub(user.id, async (tx) => {
    const { count } = await tx.subscription.updateMany({ where: { id, hubId: hub.id }, data: { status } });
    if (count === 0) throw new Error("Not found.");
  });
  revalidateContent(`/subscriptions/${id}`);
}

export async function deleteSubscription(fd: FormData) {
  const { user, hub } = await requireHub();
  const id = z.string().cuid().parse(fd.get("id"));
  await withHub(user.id, async (tx) => {
    const { count } = await tx.subscription.deleteMany({ where: { id, hubId: hub.id } });
    if (count === 0) throw new Error("Not found.");
  });
  revalidateContent();
  redirect("/subscriptions");
}
