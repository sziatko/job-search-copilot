-- Phase 3.1 step 3: every note in one Comment table on the vacancy, with a source.
-- Hand-ordered (add nullable -> re-key -> backfill -> tighten -> drop); `migrate dev`
-- would drop the old columns first. One transaction: Prisma does not wrap a script, and
-- a failure half-way would leave the live DB between two schemas.

BEGIN;

-- 1. The enum, and the new columns, nullable until the backfill has filled them.
CREATE TYPE "CommentSource" AS ENUM ('ANALYZER', 'USER', 'AGENT');

ALTER TABLE "Comment" ADD COLUMN "vacancyId" INTEGER,
ADD COLUMN "source" "CommentSource";

-- 2. The existing rows were status notes: they move from the application to its vacancy.
UPDATE "Comment" c
SET "vacancyId" = a."vacancyId", "source" = 'AGENT'
FROM "Application" a
WHERE a."id" = c."applicationId";

-- 3. applicationId goes before the inserts: it is NOT NULL, and the new rows have none.
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_applicationId_fkey";
DROP INDEX "Comment_applicationId_createdAt_idx";
ALTER TABLE "Comment" DROP COLUMN "applicationId";

-- 4. The analyzer's reasoning. 'N/A' is the placeholder a never-analysed row carries —
--    no comment, not a comment saying "N/A".
INSERT INTO "Comment" ("createdAt", "body", "source", "vacancyId")
SELECT v."createdAt", v."estimationComment", 'ANALYZER', v."id"
FROM "Vacancy" v
WHERE v."estimationComment" <> 'N/A' AND btrim(v."estimationComment") <> ''
ORDER BY v."id";

-- 5. The user's note about the application, dated when they applied.
INSERT INTO "Comment" ("createdAt", "body", "source", "vacancyId")
SELECT a."appliedAt", a."userComment", 'USER', a."vacancyId"
FROM "Application" a
WHERE a."userComment" IS NOT NULL AND btrim(a."userComment") <> ''
ORDER BY a."id";

-- 6. Tighten, index, key, and drop what the rows replaced.
ALTER TABLE "Comment" ALTER COLUMN "vacancyId" SET NOT NULL,
ALTER COLUMN "source" SET NOT NULL;

CREATE INDEX "Comment_vacancyId_createdAt_idx" ON "Comment"("vacancyId", "createdAt");

ALTER TABLE "Comment" ADD CONSTRAINT "Comment_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Application" DROP COLUMN "userComment";
ALTER TABLE "Vacancy" DROP COLUMN "estimationComment";

COMMIT;
