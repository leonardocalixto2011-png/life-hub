import Link from "next/link";

import {
  listMembers,
  listSubscriptions,
  listVentures,
  type SubscriptionWithRefs,
} from "@/lib/data";
import { countdownLabel, daysUntil, money } from "@/lib/format";
import { BILLING_LABEL, monthlyCents, yearlyCents } from "@/lib/money";
import { VentureChip } from "@/components/VentureChip";
import { Avatar } from "@/components/Avatar";
import { SubscriptionForm } from "./SubscriptionForm";
import { setSubscriptionStatus } from "./actions";

export const dynamic = "force-dynamic";

function Row({ s }: { s: SubscriptionWithRefs }) {
  const cancelled = s.status === "CANCELLED";
  const cancelDays = s.cancelByDate ? daysUntil(s.cancelByDate) : null;
  const cancelUrgent = cancelDays !== null && cancelDays <= 14;

  return (
    <div className="flex items-start gap-3 px-3 py-3">
      <div className="min-w-0 flex-1">
        <Link
          href={`/subscriptions/${s.id}`}
          className="block truncate font-medium"
          style={{
            textDecoration: cancelled ? "line-through" : "none",
            color: cancelled ? "var(--color-text-dim)" : "var(--color-text)",
          }}
        >
          {s.name}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {s.venture && <VentureChip name={s.venture.name} color={s.venture.color} />}
          {s.owner && <Avatar name={s.owner.name} email={s.owner.email} size={18} />}
          {!cancelled && (
            <span className="text-[0.68rem] text-[var(--color-text-dim)]">
              renews {countdownLabel(s.renewalDate)}
            </span>
          )}
          {s.cancelByDate && !cancelled && (
            <span
              className="chip"
              style={
                cancelUrgent
                  ? { background: "var(--color-danger)", borderColor: "var(--color-danger)", color: "#fff" }
                  : undefined
              }
            >
              cancel by {countdownLabel(s.cancelByDate)}
            </span>
          )}
        </div>
      </div>

      <div className="text-right">
        <div className="font-semibold tabular-nums">{money(s.costCents, s.currency)}</div>
        <div className="text-[0.62rem] uppercase tracking-wide text-[var(--color-text-dim)]">
          {BILLING_LABEL[s.billingCycle]}
        </div>
        <form action={setSubscriptionStatus} className="mt-1">
          <input type="hidden" name="id" value={s.id} />
          <input type="hidden" name="status" value={cancelled ? "ACTIVE" : "CANCELLED"} />
          <button type="submit" className="text-[0.62rem] font-semibold text-[var(--color-text-dim)] underline">
            {cancelled ? "reactivate" : "mark cancelled"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default async function SubscriptionsPage() {
  const [subs, ventures, members] = await Promise.all([
    listSubscriptions({ includeCancelled: true }),
    listVentures(),
    listMembers(),
  ]);

  const active = subs.filter((s) => s.status === "ACTIVE");
  const cancelled = subs.filter((s) => s.status === "CANCELLED");
  const monthTotal = active.reduce((n, s) => n + monthlyCents(s.costCents, s.billingCycle), 0);
  const yearTotal = active.reduce((n, s) => n + yearlyCents(s.costCents, s.billingCycle), 0);
  const currency = active[0]?.currency ?? "CAD";

  // Creep signal: monthly value of subs added in the last 60 days.
  const since = new Date(Date.now() - 60 * 864e5);
  const recentNew = active.filter((s) => s.createdAt >= since);
  const recentMonthly = recentNew.reduce(
    (n, s) => n + monthlyCents(s.costCents, s.billingCycle),
    0,
  );
  const creep =
    recentNew.length >= 2 && recentMonthly > 0
      ? { count: recentNew.length, monthly: recentMonthly }
      : null;

  return (
    <div className="space-y-4 p-3">
      <h1 className="text-lg font-bold">Subscriptions</h1>

      <div className="card grid grid-cols-2 divide-x divide-[var(--color-border)] p-0">
        <div className="p-3 text-center">
          <div className="text-lg font-bold tabular-nums">{money(monthTotal, currency)}</div>
          <div className="text-[0.62rem] uppercase tracking-wide text-[var(--color-text-dim)]">
            per month
          </div>
        </div>
        <div className="p-3 text-center">
          <div className="text-lg font-bold tabular-nums">{money(yearTotal, currency)}</div>
          <div className="text-[0.62rem] uppercase tracking-wide text-[var(--color-text-dim)]">
            per year · {active.length} active
          </div>
        </div>
      </div>
      {creep && (
        <div className="card border-[#b45309] p-3 text-xs">
          <span className="font-semibold" style={{ color: "#b45309" }}>
            ↑ {money(creep.monthly, currency)}/mo added in the last 60 days
          </span>{" "}
          <span className="text-[var(--color-text-dim)]">
            ({creep.count} new subscriptions) — worth a review.
          </span>
        </div>
      )}
      {active.some((s) => s.currency !== currency) && (
        <p className="text-[0.68rem] text-[var(--color-text-dim)]">
          Totals assume {currency}; mixed currencies aren’t converted.
        </p>
      )}

      <SubscriptionForm
        ventures={ventures.map((v) => ({ id: v.id, name: v.name }))}
        members={members}
      />

      {subs.length === 0 && (
        <p className="card p-6 text-center text-sm text-[var(--color-text-dim)]">
          No subscriptions tracked. Add the recurring ones so renewals don’t surprise you.
        </p>
      )}

      {active.length > 0 && (
        <section>
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
            Active · {active.length}
          </h2>
          <div className="card divide-y divide-[var(--color-border)]">
            {active.map((s) => (
              <Row key={s.id} s={s} />
            ))}
          </div>
        </section>
      )}

      {cancelled.length > 0 && (
        <section>
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
            Cancelled · {cancelled.length}
          </h2>
          <div className="card divide-y divide-[var(--color-border)]">
            {cancelled.map((s) => (
              <Row key={s.id} s={s} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
