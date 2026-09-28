-- Phase 4 step 2: rebuild "Recommendation" in its declaration order. `ADD VALUE`
-- (20260909172735) appended APPLY_WITH_CAVEATS after SKIP, and Postgres sorts an enum
-- by creation order, so `ORDER BY recommendation` read APPLY, SKIP, APPLY_WITH_CAVEATS.
-- /vacancies' `sort=recommended` relies on it (ADR-0030). The column has no default;
-- its index is rebuilt by the type change. One transaction, like 20260926160000.

BEGIN;

ALTER TYPE "Recommendation" RENAME TO "Recommendation_old";

CREATE TYPE "Recommendation" AS ENUM ('APPLY', 'APPLY_WITH_CAVEATS', 'SKIP');

ALTER TABLE "Vacancy"
  ALTER COLUMN "recommendation" TYPE "Recommendation"
  USING "recommendation"::text::"Recommendation";

DROP TYPE "Recommendation_old";

COMMIT;
