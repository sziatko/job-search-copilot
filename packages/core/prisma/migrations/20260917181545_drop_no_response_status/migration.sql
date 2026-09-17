-- NO_RESPONSE is gone: "no answer" is a date-derived view on /tracker now (see
-- ADR-0022), not something the DB stores. The status was never used, but a database
-- somewhere may still hold rows at it, so move them to APPLIED first — that is exactly
-- what the importer maps a blank/"без відповіді" status cell to.
UPDATE "Application" SET "status" = 'APPLIED' WHERE "status" = 'NO_RESPONSE';

-- Postgres has no "drop enum value", so the type is rebuilt. Safe while nothing is
-- using the old value, and the USING cast cannot fail for the same reason.
ALTER TYPE "ApplicationStatus" RENAME TO "ApplicationStatus_old";

CREATE TYPE "ApplicationStatus" AS ENUM ('APPLIED', 'RECRUITER_SCREEN', 'REPLIED', 'INTERVIEW', 'OFFER', 'REJECTED');

ALTER TABLE "Application"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "ApplicationStatus" USING ("status"::text::"ApplicationStatus"),
  ALTER COLUMN "status" SET DEFAULT 'APPLIED';

DROP TYPE "ApplicationStatus_old";
