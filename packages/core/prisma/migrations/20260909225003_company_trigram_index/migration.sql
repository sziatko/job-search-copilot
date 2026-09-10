-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- DropIndex
DROP INDEX "EstimatedVacancy_company_idx";

-- CreateIndex
CREATE INDEX "EstimatedVacancy_company_idx" ON "EstimatedVacancy" USING GIN ("company" gin_trgm_ops);
