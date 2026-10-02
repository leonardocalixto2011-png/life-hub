import Link from "next/link";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Figure } from "@/components/Figure";
import { addMonths, endOfMonth, format, isSameMonth, isValid, parse as parseDate, startOfMonth, subMonths } from "date-fns";

import { budgetMonth, hubChrome, upcomingSummary } from "@/lib/data";
import { BUDGET_CATEGORIES, sharedBalances } from "@/lib/couple";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { getLang, getT } from "@/lib/i18n-server";
import { fmt } from "@/lib/i18n";
import { money } from "@/lib/format";
import { centsToInput } from "@/lib/money";
import { personFirstName } from "@/lib/people";
import { BudgetTrend } from "@/components/viz/BudgetTrend";
import { EntryForm } from "./EntryForm";
import { EntryRow } from "./EntryRow";
import { deleteBudgetTarget, setBudgetTarget, settleUp } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";

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


export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const month = monthFromParam(sp.m);
  const isUpcomingMonth = endOfMonth(month) >= startOfMonth(new Date());
  const { user, hub } = await requireHub();
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const firstName = (m: { name: string | null; email: string | null }) =>
    personFirstName(m, t("Member"));
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
  const $ = (cents: number) => money(cents, currency, locale);

  // Two-person hubs get a plain sentence and a settle-up button. With more
  // people a single "X owes Y" isn't well defined, so each balance is listed.
  const byId = new Map(members.map((m) => [m.id, m]));
  const creditor = balances.find((b) => b.netCents > 0);
  const debtor = balances.find((b) => b.netCents < 0);

  // Summed, not assigned: "Food" and "food" are separate categories in the
  // data but fold to one key here, and the second must not overwrite the first.
  const spentBy = new Map<string, number>();
  for (const c of data.categories) {
    const key = c.category.toLowerCase();
    spentBy.set(key, (spentBy.get(key) ?? 0) + c.cents);
  }

  // ---- the two answers people open this page for ---------------------------
  // "What's left?" — every monthly limit, minus what was spent in those same
  // categories. Hidden under a venture filter: limits are hub-wide, and
  // subtracting one venture's spending from them would overstate what's left.
  const targetTotal = targets.reduce((n, tg) => n + tg.monthlyCents, 0);
  const targetSpent = targets.reduce((n, tg) => n + (spentBy.get(tg.category.toLowerCase()) ?? 0), 0);
  const showLeft = targets.length > 0 && targetTotal > 0 && !sp.venture;
  const leftCents = targetTotal - targetSpent;

  // "Are we square?" — from the viewer's side, since that is how anyone
  // actually asks it. Two people: a sentence with the other's name. More:
  // just the viewer's own position (who-owes-whom isn't one sentence then).
  const mine = balances.find((b) => b.userId === user.id);
  const other = members.length === 2 ? members.find((m) => m.id !== user.id) : undefined;
  const balanceLine =
    !mine || mine.netCents === 0
      ? null
      : other
        ? mine.netCents > 0
          ? t("{name} owes you {amount}", { name: firstName(other), amount: $(mine.netCents) })
          : t("You owe {name} {amount}", { name: firstName(other), amount: $(-mine.netCents) })
        : mine.netCents > 0
          ? t("You're owed {amount}", { amount: $(mine.netCents) })
          : t("You owe {amount}", { amount: $(-mine.netCents) });

  return (
    <div className="page">
      <div className="flex items-end justify-between gap-3 px-1">
        <h1 className="page-title">{t("Budget")}</h1>
        <div className="flex gap-3">
          <Link href="/trips" className="section-link">
            {t("Trips")}
            <ChevronRight size={14} strokeWidth={2.25} aria-hidden />
          </Link>
          <Link href="/debts" className="section-link">
            {t("Debts")}
            <ChevronRight size={14} strokeWidth={2.25} aria-hidden />
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-2xl bg-[var(--color-surface-2)] p-1">
        <Link
          href={href(subMonths(month, 1), sp.venture)}
          className="btn btn-ghost btn-icon"
          aria-label={t("Previous month")}
        >
          <ChevronLeft size={20} strokeWidth={2.25} aria-hidden />
        </Link>
        <span className="text-[0.9375rem] font-semibold capitalize">{fmt(month, "MMMM yyyy", lang)}</span>
        <Link
          href={href(addMonths(month, 1), sp.venture)}
          className="btn btn-ghost btn-icon"
          aria-label={t("Next month")}
        >
          <ChevronRight size={20} strokeWidth={2.25} aria-hidden />
        </Link>
      </div>

      {showLeft && (
        <div className="card flex items-end justify-between gap-3 p-4">
          <Figure
            cents={leftCents}
            currency={currency}
            locale={locale}
            size="lg"
            align="left"
            tone={leftCents < 0 ? "danger" : "neutral"}
            label={
              isSameMonth(month, new Date())
                ? t("Left this month")
                : t("Left for {month}", { month: fmt(month, "MMMM", lang) })
            }
          />
          <div className="min-w-0 flex-1 pb-0.5 text-right">
            <div className="ml-auto h-1.5 max-w-[9rem] rounded-full bg-[var(--color-surface-2)]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(3, Math.min(100, (targetSpent / targetTotal) * 100))}%`,
                  background:
                    leftCents < 0
                      ? "var(--color-danger)"
                      : targetSpent / targetTotal > 0.85
                        ? "var(--color-warn)"
                        : "var(--color-ok)",
                }}
              />
            </div>
            <div className="mt-1.5 text-[0.6875rem] tabular-nums text-[var(--color-text-dim)]">
              {t("{spent} spent of {total} budgeted", { spent: $(targetSpent), total: $(targetTotal) })}
            </div>
          </div>
        </div>
      )}

      {balanceLine && mine && (
        <div className="card flex min-h-[52px] items-center justify-between gap-3 py-2 pl-4 pr-2">
          <span
            className="min-w-0 text-sm font-semibold"
            style={{ color: mine.netCents < 0 ? "var(--color-danger)" : undefined }}
          >
            {balanceLine}
          </span>
          {/* The settle-up form already exists further down; this is the way to it. */}
          <a href="#settle" className="btn btn-secondary shrink-0 text-xs">
            {other ? t("Settle") : t("Details")}
          </a>
        </div>
      )}

      {/* Net is the answer to the question this page exists to ask, so it is
          the one figure at `lg`; in and out are its working. */}
      <div className="card grid grid-cols-3 divide-x divide-[var(--color-border)] p-0">
        <div className="px-2 py-4">
          <Figure cents={data.income} currency={currency} locale={locale} label={t("in")} tone="ok" />
        </div>
        <div className="px-2 py-4">
          <Figure cents={data.expense} currency={currency} locale={locale} label={t("out")} />
        </div>
        <div className="px-2 py-4">
          <Figure cents={data.net} currency={currency} locale={locale} label={t("net")} tone={data.net < 0 ? "danger" : "ok"} />
        </div>
      </div>

      <BudgetTrend
        userId={user.id}
        hubId={hub.id}
        month={month}
        ventureSlug={sp.venture}
        currency={currency}
        locale={locale}
        lang={lang}
      />

      {members.length > 1 && (
        <section id="settle" className="scroll-mt-20">
          <h2 className="section-title">
            {t("Shared expenses")}
          </h2>
          <div className="card space-y-2 p-4 text-sm">
            {balances.every((b) => b.netCents === 0) ? (
              <p className="text-[var(--color-text-dim)]">
                {t("All square. Log an expense as “shared” and this keeps track of who owes whom.")}
              </p>
            ) : members.length === 2 && creditor && debtor ? (
              <>
                <p>
                  {t("{debtor} owes {creditor} {amount}", {
                    debtor: firstName(byId.get(debtor.userId)!),
                    creditor: firstName(byId.get(creditor.userId)!),
                    amount: $(creditor.netCents),
                  })}
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
                    aria-label={t("Amount paid back")}
                  />
                  <SubmitButton className="btn btn-primary flex-1 text-xs">
                    {t("Mark as paid back")}
                  </SubmitButton>
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
                    {b.netCents < 0 ? t("owes {amount}", { amount: $(-b.netCents) }) : t("is owed {amount}", { amount: $(b.netCents) })}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {upcoming && (upcomingTotal > 0 || upcoming.pendingBills > 0) && (
        <div className="card space-y-1 p-4 text-xs">
          {upcomingTotal > 0 && (
            <>
              <div className="font-semibold">{t("{amount}/mo in recurring commitments", { amount: $(upcomingTotal) })}</div>
              <div className="text-[var(--color-text-dim)]">
                {t("{subs} subscriptions + {debts} debt payments", { subs: $(upcoming.subscriptionsCents), debts: $(upcoming.debtsCents) })}
                {upcoming.billsCents > 0 && <> + {$(upcoming.billsCents)} {t("bills")}</>}
                {" "}— {t("separate from what's logged above")}
              </div>
            </>
          )}
          {upcoming.pendingBills > 0 && (
            <Link href="/inbox" className="block font-semibold text-[var(--color-primary)]">
              {t("{n} bills detected from your mail, not yet reviewed →", { n: upcoming.pendingBills })}
            </Link>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Link href={href(month)} className="chip chip-filter" data-active={!sp.venture ? "" : undefined}>
          {t("All ventures")}
        </Link>
        {ventures.map((v) => (
          <Link
            key={v.id}
            href={href(month, sp.venture === v.slug ? undefined : v.slug)}
            className="chip chip-filter"
            data-active={sp.venture === v.slug ? "" : undefined}
          >
            {v.name}
          </Link>
        ))}
      </div>

      <EntryForm ventures={vOpts} members={members} currentUserId={user.id} />

      <section>
        <h2 className="section-title">
          {t("Monthly budget")}
        </h2>
        <div className="card space-y-3 p-4">
          {targets.length === 0 && (
            <p className="text-xs text-[var(--color-text-dim)]">
              {t("Set a monthly limit per category — groceries, outings, gifts — and see how the month is tracking.")}
            </p>
          )}
          {targets.map((tg) => {
            const spent = spentBy.get(tg.category.toLowerCase()) ?? 0;
            const pct = tg.monthlyCents > 0 ? spent / tg.monthlyCents : 0;
            const over = spent > tg.monthlyCents;
            return (
              <div key={tg.id}>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span>{t(tg.category)}</span>
                  <span className="flex items-center gap-2 tabular-nums">
                    <span style={{ color: over ? "var(--color-danger)" : "var(--color-text-dim)" }}>
                      {$(spent)} / {$(tg.monthlyCents)}
                    </span>
                    <form action={deleteBudgetTarget}>
                      <input type="hidden" name="id" value={tg.id} />
                      <SubmitButton
                        aria-label={t("Remove {category} budget", { category: t(tg.category) })}
                        className="-m-2 grid h-9 w-9 place-items-center rounded-full text-[var(--color-text-dim)]"
                        pendingLabel="…"
                      >
                        <X size={15} strokeWidth={2.25} aria-hidden />
                      </SubmitButton>
                    </form>
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-[var(--color-surface-2)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(3, Math.min(100, pct * 100))}%`,
                      background: over ? "var(--color-danger)" : pct > 0.85 ? "var(--color-warn)" : "var(--color-ok)",
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
              placeholder={t("Category")}
              aria-label={t("Category")}
              className="field"
            />
            <datalist id="budget-target-categories">
              {BUDGET_CATEGORIES.map((c) => (
                <option key={c} value={c} label={t(c)} />
              ))}
            </datalist>
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              required
              placeholder={t("/month")}
              aria-label={t("Monthly limit")}
              className="field"
            />
            <SubmitButton className="btn">
              {t("Set")}
            </SubmitButton>
          </form>
        </div>
      </section>

      {data.categories.length > 0 && (
        <section>
          <h2 className="section-title">
            {t("Where it went")}
          </h2>
          <div className="card space-y-3 p-4">
            {data.categories.map((c) => (
              <div key={c.category}>
                <div className="flex justify-between text-xs">
                  <span>{t(c.category)}</span>
                  <span className="tabular-nums text-[var(--color-text-dim)]">{$(c.cents)}</span>
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
        <h2 className="section-title">
          {t("Entries")} · {data.entries.length}
        </h2>
        {data.entries.length === 0 ? (
          <p className="card px-5 py-8 text-center text-sm text-[var(--color-text-dim)]">
            {t("Nothing logged for {month}.", { month: fmt(month, "MMMM", lang) })}
          </p>
        ) : (
          <div className="list">
            {data.entries.map((e) => (
              <EntryRow key={e.id} e={e} ventures={vOpts} members={members} currentUserId={user.id} locale={locale} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
