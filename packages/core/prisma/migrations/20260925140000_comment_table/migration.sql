-- ADR-0028: statusComment becomes rows in an append-only Comment table.
-- Hand-ordered (create -> copy -> drop); `migrate dev` would drop the column first.

-- 1. Create the table.
CREATE TABLE "Comment" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "body" TEXT NOT NULL,
    "applicationId" INTEGER NOT NULL,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Comment_applicationId_createdAt_idx" ON "Comment"("applicationId", "createdAt");

ALTER TABLE "Comment" ADD CONSTRAINT "Comment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Split each accumulated "a / b / c" into one row per note, stamped with the only
--    date there is (the last status move). ORDER BY keeps the serial ids in note order,
--    which is the tie-break for the shared timestamp.
INSERT INTO "Comment" ("createdAt", "body", "applicationId")
SELECT a."statusUpdatedAt", btrim(t.part), a."id"
FROM "Application" a
CROSS JOIN LATERAL regexp_split_to_table(a."statusComment", ' / ') WITH ORDINALITY AS t(part, n)
WHERE a."statusComment" IS NOT NULL AND btrim(t.part) <> ''
ORDER BY a."id", t.n;

-- 3. Drop the column.
ALTER TABLE "Application" DROP COLUMN "statusComment";
