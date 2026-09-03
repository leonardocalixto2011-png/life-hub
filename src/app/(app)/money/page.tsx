import Link from "next/link";
import { addMonths, format, isValid, parse as parseDate, subMonths } from "date-fns";

import { budgetMonth, listVentures, type BudgetEntryWithRefs } from "@/lib/data";
import { money } from "@/lib/format";
import { VentureChip } from "@/components/VentureChip";
import { EntryForm } from "./EntryForm";
import { deleteEntry } from "./actions";

export const dynamic = "force-dynamic";

type SP = { m?: string; venture?: string };

function monthFromParam(m?: string): Date {
  if (m) {
    const d = parseDate(m, "yyyy-MM", new Date());
    if (isValid(d)) return d;
  }
  return new Date();
}

function href(month: Date, venture?: string): string {
  const p = new URLSearchParams({ m: format(month, "yyyy-MM") });
  if (venture) p.set("venture", venture);
  return `/money?${p.toString()}`;
}

function Row({ e }: { e: BudgetEntryWithRefs }) {
  const income = e.type === "INCOME";
  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{e.category}</span>
          {e.venture && <VentureChip name={e.venture.name} color={e.venture.color} />}
        </div>
        <div className="mt-0.5 text-xs text-[var(--color-text-dim)]">
          {format(e.date, "MMM d")}
          {e.description ? ` · ${e.description}` : ""}
        </div>
      </div>
      <div className="text-right">
        <div
          className="font-semibold tabular-nums"
          style={{ color: income ? "var(--color-ok)" : "var(--color-text)" }}
        >
          {income ? "+" : "−"}
          {money(e.amountCents, e.currency)}
        </div>
        <form action={deleteEntry}>
          <input type="hidden" name="id" value={e.id} />
          <button className="text-[0.62rem] font-semibold text-[var(--color-text-dim)] underline">
            delete
          </button>
        </form>
      </div>
    </div>
  );
}

export default async function MoneyPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const month = monthFromParam(sp.m);
  const [ventures, data] = await Promise.all([
    listVentures(),
    budgetMonth(month, sp.venture),
  ]);
  const currency = data.entries[0]?.currency ?? "CAD";
  const maxCat = data.categories[0]?.cents ?? 1;

  return (
    <div className="space-y-4 p-3">
      <h1 className="text-lg font-bold">Budget</h1>

      <div className="flex items-center justify-between">
        <Link href={href(subMonths(month, 1), sp.venture)} className="btn btn-ghost px-2">
          ‹
        </Link>
        <span className="text-sm font-semibold">{format(month, "MMMM yyyy")}</span>
        <Link href={href(addMonths(month, 1), sp.venture)} className="btn btn-ghost px-2">
          ›
        </Link>
      </div>

      <div className="card grid grid-cols-3 divide-x divide-[var(--color-border)] p-0 text-center">
        <div className="p-3">
          <div className="text-sm font-bold tabular-nums text-[var(--color-ok)]">
            {money(data.income, currency)}
          </div>
          <div className="text-[0.6rem] uppercase tracking-wide text-[var(--color-text-dim)]">
            in
          </div>
        </div>
        <div className="p-3">
          <div className="text-sm font-bold tabular-nums">{money(data.expense, currency)}</div>
          <div className="text-[0.6rem] uppercase tracking-wide text-[var(--color-text-dim)]">
            out
          </div>
        </div>
        <div className="p-3">
          <div
            className="text-sm font-bold tabular-nums"
            style={{ color: data.net < 0 ? "var(--color-danger)" : "var(--color-ok)" }}
          >
            {money(data.net, currency)}
          </div>
          <div className="text-[0.6rem] uppercase tracking-wide text-[var(--color-text-dim)]">
            net
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Link
          href={href(month)}
          className="chip"
          style={
            !sp.venture
              ? { background: "var(--color-primary)", borderColor: "var(--color-primary)", color: "#fff" }
              : undefined
          }
        >
          All ventures
        </Link>
        {ventures.map((v) => (
          <Link
            key={v.id}
            href={href(month, sp.venture === v.slug ? undefined : v.slug)}
            className="chip"
            style={
              sp.venture === v.slug
                ? { background: "var(--color-primary)", borderColor: "var(--color-primary)", color: "#fff" }
                : undefined
            }
          >
            {v.name}
          </Link>
        ))}
      </div>

      <EntryForm ventures={ventures.map((v) => ({ id: v.id, name: v.name }))} />

      {data.categories.length > 0 && (
        <section>
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
            Where it went
          </h2>
          <div className="card space-y-2 p-3">
            {data.categories.map((c) => (
              <div key={c.category}>
                <div className="flex justify-between text-xs">
                  <span>{c.category}</span>
                  <span className="tabular-nums text-[var(--color-text-dim)]">
                    {money(c.cents, currency)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-[var(--color-surface-2)]">
                  <div
                    className="h-full rounded-full bg-[var(--color-primary)]"
                    style={{ width: `${Math.max(4, (c.cents / maxCat) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
          Entries · {data.entries.length}
        </h2>
        {data.entries.length === 0 ? (
          <p className="card p-6 text-center text-sm text-[var(--color-text-dim)]">
            Nothing logged for {format(month, "MMMM")}.
          </p>
        ) : (
          <div className="card divide-y divide-[var(--color-border)]">
            {data.entries.map((e) => (
              <Row key={e.id} e={e} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
