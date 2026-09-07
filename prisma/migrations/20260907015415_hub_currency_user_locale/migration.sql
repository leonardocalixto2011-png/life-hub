-- One currency per hub, and a per-user locale for formatting.
--
-- BudgetEntry.currency and Subscription.currency already existed, but the
-- pages summed every row regardless of currency and then labelled the total
-- with whichever row sorted first — arithmetic that is silently wrong the
-- moment two currencies coexist. Totals across currencies need FX rates to
-- mean anything; a household has one currency, so the hub carries it and the
-- sums become valid by construction.
--
-- Existing rows keep their own currency column as a record of what was
-- entered; display and aggregation now use the hub's.
ALTER TABLE "Hub" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'CAD';

-- Null means fall back to en-CA. Only affects number/date formatting, not
-- the language of the interface, which is still English throughout.
ALTER TABLE "User" ADD COLUMN     "locale" TEXT;
