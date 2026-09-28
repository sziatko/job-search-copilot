-- Phase 3.1 step 4: one status on the vacancy, a StatusChange journal beside it, and
-- Application merged into Vacancy. Hand-ordered (add -> backfill -> drop); `migrate dev`
-- would drop Application first. One transaction: Prisma does not wrap a script, and a
-- failure half-way would leave the live DB between two schemas.

BEGIN;

-- 1. The enum, the new columns, and the journal.
CREATE TYPE "VacancyStatus" AS ENUM ('NOT_REVIEWED', 'SAVED_FOR_LATER', 'DECLINED', 'APPLIED', 'RECRUITER_SCREEN', 'REPLIED', 'INTERVIEW', 'OFFER', 'REJECTED');

ALTER TABLE "Vacancy" ADD COLUMN "status" "VacancyStatus" NOT NULL DEFAULT 'NOT_REVIEWED',
ADD COLUMN "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "salaryInListing" TEXT,
ADD COLUMN "usedTailoredResume" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "StatusChange" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "VacancyStatus" NOT NULL,
    "vacancyId" INTEGER NOT NULL,

    CONSTRAINT "StatusChange_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StatusChange_vacancyId_createdAt_idx" ON "StatusChange"("vacancyId", "createdAt");

ALTER TABLE "StatusChange" ADD CONSTRAINT "StatusChange_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. The journal, oldest first: the insert order is the tie-break (`id`) for rows that
--    share a date.
-- 2a. Every vacancy starts NOT_REVIEWED. A placeholder the importer created can be newer
--     than the application it was created for — it must not outrank that APPLIED.
INSERT INTO "StatusChange" ("createdAt", "status", "vacancyId")
SELECT LEAST(v."createdAt", a."appliedAt"), 'NOT_REVIEWED', v."id"
FROM "Vacancy" v
LEFT JOIN "Application" a ON a."vacancyId" = v."id"
ORDER BY v."id";

-- 2b. The triage decision, where no application covers the vacancy.
INSERT INTO "StatusChange" ("createdAt", "status", "vacancyId")
SELECT coalesce(v."userActionUpdatedAt", v."updatedAt"),
       (CASE v."userAction" WHEN 'READY_TO_APPLY' THEN 'SAVED_FOR_LATER' ELSE v."userAction"::text END)::"VacancyStatus",
       v."id"
FROM "Vacancy" v
WHERE v."userAction" <> 'NOT_REVIEWED'
  AND NOT EXISTS (SELECT 1 FROM "Application" a WHERE a."vacancyId" = v."id")
ORDER BY v."id";

-- 2c. Applying.
INSERT INTO "StatusChange" ("createdAt", "status", "vacancyId")
SELECT a."appliedAt", 'APPLIED', a."vacancyId"
FROM "Application" a
ORDER BY a."id";

-- 2d. Where the application has moved on since.
INSERT INTO "StatusChange" ("createdAt", "status", "vacancyId")
SELECT a."statusUpdatedAt", a."status"::text::"VacancyStatus", a."vacancyId"
FROM "Application" a
WHERE a."status" <> 'APPLIED'
ORDER BY a."id";

-- 3. The cache: the latest journal row. Salary / CV move over from the application.
UPDATE "Vacancy" v
SET "status" = s."status", "statusChangedAt" = s."createdAt"
FROM (
    SELECT DISTINCT ON ("vacancyId") "vacancyId", "status", "createdAt"
    FROM "StatusChange"
    ORDER BY "vacancyId", "createdAt" DESC, "id" DESC
) s
WHERE s."vacancyId" = v."id";

UPDATE "Vacancy" v
SET "salaryInListing" = a."salaryInListing", "usedTailoredResume" = a."usedTailoredResume"
FROM "Application" a
WHERE a."vacancyId" = v."id";

-- 4. Drop what the rows replaced.
DROP TABLE "Application";

DROP INDEX "Vacancy_userAction_idx";
ALTER TABLE "Vacancy" DROP COLUMN "userAction",
DROP COLUMN "userActionUpdatedAt";

DROP TYPE "UserAction";
DROP TYPE "ApplicationStatus";

CREATE INDEX "Vacancy_status_statusChangedAt_idx" ON "Vacancy"("status", "statusChangedAt");

COMMIT;
