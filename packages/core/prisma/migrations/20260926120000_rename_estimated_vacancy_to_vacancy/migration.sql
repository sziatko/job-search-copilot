-- Phase 3.1 step 2: EstimatedVacancy -> Vacancy, Application.estimatedVacancyId -> vacancyId.
-- Hand-written: `migrate dev` reads a model rename as drop + create. A RENAME keeps the
-- rows; the constraint / index / sequence names follow, so Prisma sees no drift.
-- A bare RENAME, not the expand/contract the prisma README asks for: the only reader
-- is core's client, regenerated and restarted with this migration (api / mcp restart).

ALTER TABLE "EstimatedVacancy" RENAME TO "Vacancy";
ALTER SEQUENCE "EstimatedVacancy_id_seq" RENAME TO "Vacancy_id_seq";
ALTER TABLE "Vacancy" RENAME CONSTRAINT "EstimatedVacancy_pkey" TO "Vacancy_pkey";
ALTER TABLE "Vacancy" RENAME CONSTRAINT "EstimatedVacancy_matchScore_range" TO "Vacancy_matchScore_range";
ALTER INDEX "EstimatedVacancy_applyUrl_key" RENAME TO "Vacancy_applyUrl_key";
ALTER INDEX "EstimatedVacancy_recommendation_idx" RENAME TO "Vacancy_recommendation_idx";
ALTER INDEX "EstimatedVacancy_userAction_idx" RENAME TO "Vacancy_userAction_idx";
ALTER INDEX "EstimatedVacancy_company_idx" RENAME TO "Vacancy_company_idx";
ALTER INDEX "EstimatedVacancy_title_idx" RENAME TO "Vacancy_title_idx";

ALTER TABLE "Application" RENAME COLUMN "estimatedVacancyId" TO "vacancyId";
ALTER INDEX "Application_estimatedVacancyId_key" RENAME TO "Application_vacancyId_key";
ALTER TABLE "Application" RENAME CONSTRAINT "Application_estimatedVacancyId_fkey" TO "Application_vacancyId_fkey";
