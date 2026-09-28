-- Day-of-month anchors so monthly dates stop sliding back after short months.
-- Additive and nullable; no RLS change (scalar columns on existing tables).
ALTER TABLE "Task" ADD COLUMN "dueDay" INTEGER;
ALTER TABLE "Subscription" ADD COLUMN "renewalDay" INTEGER;
ALTER TABLE "Debt" ADD COLUMN "dueDay" INTEGER;
