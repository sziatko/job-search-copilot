-- Every application has moved at least once — into the pipeline, on the day it was
-- applied for. Rows created before this invariant existed (and every row imported from
-- tracker.md) carry NULL; backfill them from appliedAt, then let the DB enforce it.
-- Rows already stamped by updateStatus() keep their real value.
UPDATE "Application"
   SET "statusUpdatedAt" = "appliedAt"
 WHERE "statusUpdatedAt" IS NULL;

-- AlterTable
ALTER TABLE "Application" ALTER COLUMN "statusUpdatedAt" SET NOT NULL;
