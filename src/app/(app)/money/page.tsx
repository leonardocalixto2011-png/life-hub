import Link from "next/link";
import { addMonths, endOfMonth, format, isValid, parse as parseDate, startOfMonth, subMonths } from "date-fns";

import { budgetMonth, listVentures, upcomingSummary } from "@/lib/data";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { money } from "@/lib/format";
import { EntryForm } from "./EntryForm";
import { EntryRow } from "./EntryRow";

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

export default async function MoneyPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const month = monthFromParam(sp.m);
  const isUpcomingMonth = endOfMonth(month) >= startOfMonth(new Date());
  const { user, hub } = await requireHub();
  const [ventures, data, upcoming] = await withHub(user.id, (tx) =>
    Promise.all([
      listVentures(tx, hub.id),
      budgetMonth(tx, hub.id, month, sp.venture),
      isUpcomingMonth ? upcomingSummary(tx, hub.id) : null,
    ]),
  );
  const currency = data.entries[0]?.currency ?? "CAD";
  const maxCat = data.categories[0]?.cents ?? 1;
  const upcomingTotal = upcoming ? upcoming.subscriptionsCents + upcoming.debtsCents : 0;

  return (
    <div className="space-y-4 p-3">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-bold">Budget</h1>
        <Link href="/debts" className="text-[0.7rem] font-semibold text-[var(--color-primary)]">
          Debts →
        </Link>
      </div>

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

      {upcoming && (upcomingTotal > 0 || upcoming.pendingBills > 0) && (
        <div className="card space-y-1 p-3 text-xs">
          {upcomingTotal > 0 && (
            <>
              <div className="font-semibold">
                {money(upcomingTotal, currency)}/mo in recurring commitments
              </div>
              <div className="text-[var(--color-text-dim)]">
                {money(upcoming.subscriptionsCents, currency)} subscriptions
                {" + "}
                {money(upcoming.debtsCents, currency)} debt payments — separate from what&apos;s
                logged above
              </div>
            </>
          )}
          {upcoming.pendingBills > 0 && (
            <Link href="/inbox" className="block font-semibold text-[var(--color-primary)]">
              {upcoming.pendingBills} bill{upcoming.pendingBills === 1 ? "" : "s"} detected from your
              mail, not yet reviewed →
            </Link>
          )}
        </div>
      )}

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
              <EntryRow key={e.id} e={e} ventures={ventures.map((v) => ({ id: v.id, name: v.name }))} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
