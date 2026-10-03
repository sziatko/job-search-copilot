-- Phase 5 step 2 (ADR-0033): the vacancy log merges into "Vacancy". The analysis
-- becomes nullable (null = not analysed yet), every log url becomes a vacancy, every
-- journal starts with NEW, and the log goes. One transaction: Prisma does not wrap a
-- script, and a failure half-way would leave the live DB between two schemas.
--
-- The match keys are copied from the log where a row has one. The rest are computed in
-- TypeScript (normalizeCompanyKey / normalizeTitleKey), not here: run
-- `npm run backfill:match-keys -w @job-search-copilot/core -- --commit` after deploying.

BEGIN;

-- 1. Expand.
ALTER TABLE "Vacancy"
    ALTER COLUMN "fullText" DROP NOT NULL,
    ALTER COLUMN "matchScore" DROP NOT NULL,
    ALTER COLUMN "recommendation" DROP NOT NULL,
    ALTER COLUMN "status" SET DEFAULT 'NEW',
    ADD COLUMN "companyKey" TEXT,
    ADD COLUMN "titleKey" TEXT,
    ADD COLUMN "source" TEXT;

-- 2. Placeholders (record_application's rows, fullText 'N/A'). Without an ANALYZER
--    comment their 0 / APPLY was never an analysis; 'N/A' was never posting text.
UPDATE "Vacancy" v
SET "matchScore" = NULL, "recommendation" = NULL
WHERE v."fullText" = 'N/A'
  AND NOT EXISTS (
    SELECT 1 FROM "Comment" c WHERE c."vacancyId" = v."id" AND c."source" = 'ANALYZER'
  );

UPDATE "Vacancy" SET "fullText" = NULL WHERE "fullText" = 'N/A';

-- 3. Every existing journal starts with NEW, the date the vacancy came in: the log's
--    when it has one, and strictly before its first row and its createdAt either way
--    (the id breaks a tie the wrong way: this row is inserted last).
INSERT INTO "StatusChange" ("createdAt", "status", "vacancyId")
SELECT LEAST(
         l."createdAt",
         v."createdAt" - interval '1 millisecond',
         s."first" - interval '1 millisecond'
       ),
       'NEW',
       v."id"
FROM "Vacancy" v
LEFT JOIN (
    SELECT "vacancyId", MIN("createdAt") AS "first" FROM "StatusChange" GROUP BY "vacancyId"
) s ON s."vacancyId" = v."id"
LEFT JOIN "VacancyLogEntry" l ON l."url" = v."applyUrl"
ORDER BY v."id";

-- 4. A log row with a vacancy: the earlier date wins, and the log's keys move over.
UPDATE "Vacancy" v
SET "createdAt" = LEAST(v."createdAt", l."createdAt"),
    "companyKey" = l."companyKey",
    "titleKey" = l."titleKey"
FROM "VacancyLogEntry" l
WHERE l."url" = v."applyUrl";

-- 5. A log row without one: screened out by the agent once, kept so a posting n8n lets
--    through is not analysed again. No analysis, no text; a missing name is '—'.
INSERT INTO "Vacancy" (
    "createdAt", "updatedAt", "company", "title", "applyUrl",
    "companyKey", "titleKey", "status", "statusChangedAt"
)
SELECT l."createdAt", l."createdAt", COALESCE(l."company", '—'), COALESCE(l."title", '—'),
       l."url", l."companyKey", l."titleKey", 'FILTERED_OUT', l."createdAt"
FROM "VacancyLogEntry" l
WHERE NOT EXISTS (SELECT 1 FROM "Vacancy" v WHERE v."applyUrl" = l."url")
ORDER BY l."createdAt", l."id";

-- Their journal: NEW, then FILTERED_OUT, both dated the log's; the id orders them.
INSERT INTO "StatusChange" ("createdAt", "status", "vacancyId")
SELECT v."createdAt", s."status"::"VacancyStatus", v."id"
FROM "Vacancy" v
CROSS JOIN (VALUES (1, 'NEW'), (2, 'FILTERED_OUT')) AS s ("n", "status")
WHERE NOT EXISTS (SELECT 1 FROM "StatusChange" sc WHERE sc."vacancyId" = v."id")
ORDER BY v."id", s."n";

-- 6. The rules the schema DSL cannot say: the analysis is both fields or neither, and
--    an analysed row is never NEW (the queue).
ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_analysis_both_or_neither"
    CHECK (("matchScore" IS NULL) = ("recommendation" IS NULL));

ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_new_is_unanalysed"
    CHECK ("status" <> 'NEW' OR "recommendation" IS NULL);

CREATE INDEX "Vacancy_companyKey_titleKey_idx" ON "Vacancy"("companyKey", "titleKey");

-- 7. Contract.
DROP TABLE "VacancyLogEntry";

COMMIT;
