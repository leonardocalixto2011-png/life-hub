-- A photo pinned to a task ("buy this"). Additive, nullable. A column on Task,
-- so Task's existing RLS policy covers it with no change.
ALTER TABLE "Task" ADD COLUMN "imageUrl" TEXT;
