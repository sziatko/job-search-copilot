-- Phase 7 step 3a (ADR-0038): every vacancy belongs to a user.
--
-- The existing rows are the owner's, so they go to the one user there is. With
-- vacancies and not exactly one user (two happen when the Google and LinkedIn emails
-- differ) the migration refuses before it writes anything: the whole file runs as one
-- transaction, and Prisma records it as failed.
DO $$
DECLARE
  user_count integer;
  emails text;
BEGIN
  IF EXISTS (SELECT 1 FROM "Vacancy") THEN
    SELECT count(*), string_agg(email, ', ' ORDER BY email) INTO user_count, emails FROM "User";
    IF user_count <> 1 THEN
      -- One message, no HINT: Prisma's error output may show the message alone.
      RAISE EXCEPTION 'Vacancy rows need exactly one user to own them; found %: %. Leave one user '
        '(delete the others: their sessions and keys go with them; or sign in once if there is '
        'none), then, in packages/core: npx dotenv -e ../../.env -- npx prisma migrate resolve '
        '--rolled-back 20261011130000_vacancy_owner, and migrate again.',
        user_count, coalesce(emails, '(none)');
    END IF;
  END IF;
END $$;

-- Nullable, backfilled, then required.
ALTER TABLE "Vacancy" ADD COLUMN "userId" TEXT;
UPDATE "Vacancy" SET "userId" = (SELECT "id" FROM "User");
ALTER TABLE "Vacancy" ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "Vacancy" ADD CONSTRAINT "Vacancy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- applyUrl is unique per user, and userId leads the list indexes.
DROP INDEX "Vacancy_applyUrl_key";
CREATE UNIQUE INDEX "Vacancy_userId_applyUrl_key" ON "Vacancy"("userId", "applyUrl");

DROP INDEX "Vacancy_recommendation_idx";
CREATE INDEX "Vacancy_userId_recommendation_idx" ON "Vacancy"("userId", "recommendation");

DROP INDEX "Vacancy_status_statusChangedAt_idx";
CREATE INDEX "Vacancy_userId_status_statusChangedAt_idx" ON "Vacancy"("userId", "status", "statusChangedAt");

DROP INDEX "Vacancy_companyKey_titleKey_idx";
CREATE INDEX "Vacancy_userId_companyKey_titleKey_idx" ON "Vacancy"("userId", "companyKey", "titleKey");
