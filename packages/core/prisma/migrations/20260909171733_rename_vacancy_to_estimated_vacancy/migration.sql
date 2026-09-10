/*
  Warnings:

  - You are about to drop the `Vacancy` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "MyReaction" AS ENUM ('NOT_REVIEWED', 'READY_TO_APPLY', 'APPLIED', 'DECLINED');

-- DropTable
DROP TABLE "Vacancy";

-- DropEnum
DROP TYPE "MyAction";

-- CreateTable
CREATE TABLE "EstimatedVacancy" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "company" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "applyUrl" TEXT NOT NULL,
    "fullText" TEXT NOT NULL,
    "matchScore" INTEGER NOT NULL,
    "recommendation" "Recommendation" NOT NULL,
    "myReaction" "MyReaction" NOT NULL DEFAULT 'NOT_REVIEWED',
    "reactionUpdatedAt" TIMESTAMP(3),

    CONSTRAINT "EstimatedVacancy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EstimatedVacancy_applyUrl_key" ON "EstimatedVacancy"("applyUrl");

-- CreateIndex
CREATE INDEX "EstimatedVacancy_recommendation_idx" ON "EstimatedVacancy"("recommendation");

-- CreateIndex
CREATE INDEX "EstimatedVacancy_myReaction_idx" ON "EstimatedVacancy"("myReaction");

-- CreateIndex
CREATE INDEX "EstimatedVacancy_company_idx" ON "EstimatedVacancy"("company");
