-- CreateEnum
CREATE TYPE "Recommendation" AS ENUM ('APPLY', 'SKIP');

-- CreateEnum
CREATE TYPE "MyAction" AS ENUM ('NOT_REVIEWED', 'READY_TO_APPLY', 'APPLIED', 'DECLINED');

-- CreateTable
CREATE TABLE "Vacancy" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "company" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "applyUrl" TEXT NOT NULL,
    "fullText" TEXT NOT NULL,
    "matchScore" INTEGER NOT NULL,
    "recommendation" "Recommendation" NOT NULL,
    "myAction" "MyAction" NOT NULL DEFAULT 'NOT_REVIEWED',
    "actionUpdatedAt" TIMESTAMP(3),

    CONSTRAINT "Vacancy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vacancy_applyUrl_key" ON "Vacancy"("applyUrl");

-- CreateIndex
CREATE INDEX "Vacancy_recommendation_idx" ON "Vacancy"("recommendation");

-- CreateIndex
CREATE INDEX "Vacancy_myAction_idx" ON "Vacancy"("myAction");

-- CreateIndex
CREATE INDEX "Vacancy_company_idx" ON "Vacancy"("company");
