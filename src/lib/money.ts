import type { BillingCycle } from "@prisma/client";

/** Cost normalised to a monthly figure, in cents. CUSTOM is treated as already-monthly. */
export function monthlyCents(costCents: number, cycle: BillingCycle): number {
  switch (cycle) {
    case "WEEKLY":
      return Math.round((costCents * 52) / 12);
    case "QUARTERLY":
      return Math.round(costCents / 3);
    case "YEARLY":
      return Math.round(costCents / 12);
    case "MONTHLY":
    case "CUSTOM":
    default:
      return costCents;
  }
}

export function yearlyCents(costCents: number, cycle: BillingCycle): number {
  return monthlyCents(costCents, cycle) * 12;
}

export const BILLING_LABEL: Record<BillingCycle, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
  CUSTOM: "Custom",
};

/** "12.50" -> 1250. Returns null on unparseable input. */
export function dollarsToCents(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** 1250 -> "12.50" for a number input's default value. */
export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}
