import Link from "next/link";
import { Figure } from "@/components/Figure";
import { addMonths, endOfMonth, format, isValid, parse as parseDate, startOfMonth, subMonths } from "date-fns";

import { budgetMonth, hubChrome, upcomingSummary } from "@/lib/data";
import { BUDGET_CATEGORIES, sharedBalances } from "@/lib/couple";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { money } from "@/lib/format";
import { centsToInput } from "@/lib/money";
import { EntryForm } from "./EntryForm";
import { EntryRow } from "./EntryRow";
import { deleteBudgetTarget, setBudgetTarget, settleUp } from "./actions";

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
  return `/budget?${p.toString()}`;
}

const firstName = (m: { name: string | null; email: string | null }) =>
  (m.name ?? m.email ?? "Someone").split(/[\s@]/)[0];

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const month = monthFromParam(sp.m);
  const isUpcomingMonth = endOfMonth(month) >= startOfMonth(new Date());
  const { user, hub } = await requireHub();
  const { ventures, members } = await hubChrome(user.id, hub.id);
  const memberIds = members.map((m) => m.id);

  const [data, upcoming, balances, targets] = await withHub(user.id, (tx) =>
    Promise.all([
      budgetMonth(tx, hub.id, month, sp.venture),
      isUpcomingMonth ? upcomingSummary(tx, hub.id, user.id) : null,
      members.length > 1 ? sharedBalances(tx, hub.id, memberIds) : [],
      tx.budgetTarget.findMany({ where: { hubId: hub.id }, orderBy: { category: "asc" } }),
    ]),
  );

  // Hub currency, not the first row's: the totals above sum every entry, so
  // labelling them with one row's currency is only correct by luck.
  const currency = hub.currency;
  const locale = user.locale ?? "en-CA";
  const maxCat = data.categories[0]?.cents ?? 1;
  const upcomingTotal = upcoming
    ? upcoming.subscriptionsCents + upcoming.debtsCents + upcoming.billsCents
    : 0;
  const vOpts = ventures.map((v) => ({ id: v.id, name: v.name }));

  // Two-person hubs get a plain sentence and a settle-up button. With more
  // people a single "X owes Y" isn't well defined, so each balance is listed.
  const byId = new Map(members.map((m) => [m.id, m]));
  const creditor = balances.find((b) => b.netCents > 0);
  const debtor = balances.find((b) => b.netCents < 0);

  const spentBy = new Map(data.categories.map((c) => [c.category.toLowerCase(), c.cents]));

  return (
    <div className="space-y-4 p-3">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-bold">Budget</h1>
        <div className="flex gap-3 text-[0.7rem] font-semibold">
          <Link href="/trips" className="text-[var(--color-primary)]">
            Trips →
          </Link>
          <Link href="/debts" className="text-[var(--color-primary)]">
            Debts →
          </Link>
        </div>
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

      {/* Net is the answer to the question this page exists to ask, so it is
          the one figure at `lg`; in and out are its working. */}
      <div className="card grid grid-cols-3 divide-x divide-[var(--color-border)] p-0">
        <div className="p-3">
          <Figure cents={data.income} currency={currency} locale={locale} label="in" tone="ok" />
        </div>
        <div className="p-3">
          <Figure cents={data.expense} currency={currency} locale={locale} label="out" />
        </div>
        <div className="p-3">
          <Figure
            cents={data.net}
            currency={currency}
            locale={locale}
            label="net"
            tone={data.net < 0 ? "danger" : "ok"}
          />
        </div>
      </div>

      {members.length > 1 && (
        <section>
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
            Shared expenses
          </h2>
          <div className="card space-y-2 p-3 text-sm">
            {balances.every((b) => b.netCents === 0) ? (
              <p className="text-[var(--color-text-dim)]">
                All square. Log an expense as &quot;shared&quot; and this keeps track of who owes whom.
              </p>
            ) : members.length === 2 && creditor && debtor ? (
              <>
                <p>
                  <span className="font-semibold">{firstName(byId.get(debtor.userId)!)}</span> owes{" "}
                  <span className="font-semibold">{firstName(byId.get(creditor.userId)!)}</span>{" "}
                  <span className="font-semibold tabular-nums">
                    {money(creditor.netCents, currency, locale)}
                  </span>
                </p>
                <form action={settleUp} className="flex items-center gap-2">
                  <input type="hidden" name="fromId" value={debtor.userId} />
                  <input type="hidden" name="toName" value={firstName(byId.get(creditor.userId)!)} />
                  <input
                    name="amount"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    defaultValue={centsToInput(creditor.netCents)}
                    className="field w-28"
                    aria-label="Amount paid back"
                  />
                  <button type="submit" className="btn btn-primary flex-1 text-xs">
                    Mark as paid back
                  </button>
                </form>
              </>
            ) : (
              balances.map((b) => (
                <div key={b.userId} className="flex justify-between">
                  <span>{firstName(byId.get(b.userId)!)}</span>
                  <span
                    className="font-semibold tabular-nums"
                    style={{ color: b.netCents < 0 ? "var(--color-danger)" : "var(--color-ok)" }}
                  >
                    {b.netCents < 0 ? "owes " : "is owed "}
                    {money(Math.abs(b.netCents), currency, locale)}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {upcoming && (upcomingTotal > 0 || upcoming.pendingBills > 0) && (
        <div className="card space-y-1 p-3 text-xs">
          {upcomingTotal > 0 && (
            <>
              <div className="font-semibold">
                {money(upcomingTotal, currency, locale)}/mo in recurring commitments
              </div>
              <div className="text-[var(--color-text-dim)]">
                {money(upcoming.subscriptionsCents, currency, locale)} subscriptions
                {" + "}
                {money(upcoming.debtsCents, currency, locale)} debt payments
                {upcoming.billsCents > 0 && (
                  <> {" + "}{money(upcoming.billsCents, currency, locale)} bills</>
                )}
                {" "}— separate from what&apos;s logged above
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

      <EntryForm ventures={vOpts} members={members} currentUserId={user.id} />

      <section>
        <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
          Monthly budget
        </h2>
        <div className="card space-y-2.5 p-3">
          {targets.length === 0 && (
            <p className="text-xs text-[var(--color-text-dim)]">
              Set a monthly limit per category — groceries, outings, gifts — and see how the month
              is tracking.
            </p>
          )}
          {targets.map((t) => {
            const spent = spentBy.get(t.category.toLowerCase()) ?? 0;
            const pct = t.monthlyCents > 0 ? spent / t.monthlyCents : 0;
            const over = spent > t.monthlyCents;
            return (
              <div key={t.id}>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span>{t.category}</span>
                  <span className="flex items-center gap-2 tabular-nums">
                    <span style={{ color: over ? "var(--color-danger)" : "var(--color-text-dim)" }}>
                      {money(spent, currency, locale)} / {money(t.monthlyCents, currency, locale)}
                    </span>
                    <form action={deleteBudgetTarget}>
                      <input type="hidden" name="id" value={t.id} />
                      <button aria-label={`Remove ${t.category} budget`} className="text-[var(--color-text-dim)]">
                        ✕
                      </button>
                    </form>
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-[var(--color-surface-2)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(3, Math.min(100, pct * 100))}%`,
                      background: over ? "var(--color-danger)" : pct > 0.85 ? "#d97706" : "var(--color-ok)",
                    }}
                  />
                </div>
              </div>
            );
          })}
          <form action={setBudgetTarget} className="grid grid-cols-[1fr_6rem_auto] gap-2 pt-1">
            <input
              name="category"
              required
              list="budget-target-categories"
              placeholder="Category"
              className="field"
            />
            <datalist id="budget-target-categories">
              {BUDGET_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              required
              placeholder="/month"
              className="field"
            />
            <button type="submit" className="btn">
              Set
            </button>
          </form>
        </div>
      </section>

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
                    {money(c.cents, currency, locale)}
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
              <EntryRow key={e.id} e={e} ventures={vOpts} members={members} currentUserId={user.id} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
