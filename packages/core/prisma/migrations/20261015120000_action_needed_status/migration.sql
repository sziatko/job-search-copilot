-- Phase 7.2 step 3: pipeline statuses say whose move it is.
--   RECRUITER_SCREEN → ACTION_NEEDED: an email that needs the user to act (a question,
--     a call to book, a test task). Renamed, its rows kept.
--   REPLIED → AWAITING: it was set when the user had replied — the company's move
--     next, which is what AWAITING means now. Its rows move; the value goes.
-- Prisma does not wrap a migration in a transaction: a failure part way would leave the
-- enum half rebuilt. So the file is one, explicitly.
BEGIN;

UPDATE "StatusChange" SET "status" = 'AWAITING' WHERE "status" = 'REPLIED';
UPDATE "Vacancy" SET "status" = 'AWAITING' WHERE "status" = 'REPLIED';

-- Postgres has no "drop enum value", so the type is rebuilt. The CHECK compares the
-- column with an enum literal, so it is dropped first and added back on the new type.
ALTER TABLE "Vacancy" DROP CONSTRAINT "Vacancy_new_is_unanalysed";
ALTER TYPE "VacancyStatus" RENAME TO "VacancyStatus_old";

CREATE TYPE "VacancyStatus" AS ENUM (
  'NEW', 'NOT_REVIEWED', 'SAVED_FOR_LATER', 'DECLINED', 'UNAVAILABLE', 'FILTERED_OUT',
  'APPLIED', 'ACTION_NEEDED', 'INTERVIEW', 'AWAITING', 'OFFER', 'REJECTED'
);

ALTER TABLE "Vacancy"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "VacancyStatus" USING (
    CASE "status"::text WHEN 'RECRUITER_SCREEN' THEN 'ACTION_NEEDED' ELSE "status"::text END
  )::"VacancyStatus",
  ALTER COLUMN "status" SET DEFAULT 'NEW';

ALTER TABLE "StatusChange"
  ALTER COLUMN "status" TYPE "VacancyStatus" USING (
    CASE "status"::text WHEN 'RECRUITER_SCREEN' THEN 'ACTION_NEEDED' ELSE "status"::text END
  )::"VacancyStatus";

DROP TYPE "VacancyStatus_old";

ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_new_is_unanalysed"
  CHECK ("status" <> 'NEW' OR "recommendation" IS NULL);

COMMIT;
