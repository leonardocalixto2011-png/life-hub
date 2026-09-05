import Link from "next/link";

import { listDebts, listMembers, listVentures, type DebtWithRefs } from "@/lib/data";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { countdownLabel, money } from "@/lib/format";
import { VentureChip } from "@/components/VentureChip";
import { Avatar } from "@/components/Avatar";
import { DebtForm } from "./DebtForm";

export const dynamic = "force-dynamic";

function Row({ d }: { d: DebtWithRefs }) {
  const paidOff = d.status === "PAID_OFF";
  const payment = d.actualPaymentCents ?? d.minimumPaymentCents;

  return (
    <div className="flex items-start gap-3 px-3 py-3">
      <div className="min-w-0 flex-1">
        <Link
          href={`/debts/${d.id}`}
          className="block truncate font-medium"
          style={{
            textDecoration: paidOff ? "line-through" : "none",
            color: paidOff ? "var(--color-text-dim)" : "var(--color-text)",
          }}
        >
          {d.name}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {d.venture && <VentureChip name={d.venture.name} color={d.venture.color} />}
          {d.owner && <Avatar name={d.owner.name} email={d.owner.email} size={18} />}
          {d.status === "DEFAULT" && (
            <span
              className="chip"
              style={{ background: "var(--color-danger)", borderColor: "var(--color-danger)", color: "#fff" }}
            >
              in default
            </span>
          )}
          {!paidOff && d.dueDate && (
            <span className="text-[0.68rem] text-[var(--color-text-dim)]">
              due {countdownLabel(d.dueDate)}
            </span>
          )}
        </div>
      </div>

      <div className="text-right">
        <div className="font-semibold tabular-nums">{money(d.balanceCents, "CAD")}</div>
        <div className="text-[0.62rem] uppercase tracking-wide text-[var(--color-text-dim)]">
          {payment != null ? `${money(payment, "CAD")}/mo` : "balance"}
          {d.aprBasisPoints != null ? ` · ${(d.aprBasisPoints / 100).toFixed(2)}%` : ""}
        </div>
      </div>
    </div>
  );
}

export default async function DebtsPage() {
  const { user, hub } = await requireHub();
  const [debts, ventures, members] = await withHub(user.id, (tx) =>
    Promise.all([
      listDebts(tx, hub.id, { includeOther: true }),
      listVentures(tx, hub.id),
      listMembers(tx, hub.id),
    ]),
  );

  const current = debts.filter((d) => d.status !== "PAID_OFF");
  const paidOff = debts.filter((d) => d.status === "PAID_OFF");
  const totalBalance = current.reduce((n, d) => n + d.balanceCents, 0);
  const totalMonthly = current.reduce(
    (n, d) => n + (d.actualPaymentCents ?? d.minimumPaymentCents ?? 0),
    0,
  );

  return (
    <div className="space-y-4 p-3">
      <h1 className="text-lg font-bold">Debts</h1>

      <div className="card grid grid-cols-2 divide-x divide-[var(--color-border)] p-0">
        <div className="p-3 text-center">
          <div className="text-lg font-bold tabular-nums">{money(totalBalance, "CAD")}</div>
          <div className="text-[0.62rem] uppercase tracking-wide text-[var(--color-text-dim)]">
            total balance
          </div>
        </div>
        <div className="p-3 text-center">
          <div className="text-lg font-bold tabular-nums">{money(totalMonthly, "CAD")}</div>
          <div className="text-[0.62rem] uppercase tracking-wide text-[var(--color-text-dim)]">
            per month · {current.length} current
          </div>
        </div>
      </div>

      <DebtForm
        ventures={ventures.map((v) => ({ id: v.id, name: v.name }))}
        members={members}
      />

      {debts.length === 0 && (
        <p className="card p-6 text-center text-sm text-[var(--color-text-dim)]">
          No debts tracked yet.
        </p>
      )}

      {current.length > 0 && (
        <section>
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
            Current · {current.length}
          </h2>
          <div className="card divide-y divide-[var(--color-border)]">
            {current.map((d) => (
              <Row key={d.id} d={d} />
            ))}
          </div>
        </section>
      )}

      {paidOff.length > 0 && (
        <section>
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
            Paid off · {paidOff.length}
          </h2>
          <div className="card divide-y divide-[var(--color-border)]">
            {paidOff.map((d) => (
              <Row key={d.id} d={d} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
