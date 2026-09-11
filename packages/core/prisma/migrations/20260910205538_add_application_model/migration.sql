-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('APPLIED', 'RECRUITER_SCREEN', 'REPLIED', 'INTERVIEW', 'OFFER', 'REJECTED', 'NO_RESPONSE');

-- CreateTable
CREATE TABLE "Application" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estimatedVacancyId" INTEGER NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'APPLIED',
    "statusUpdatedAt" TIMESTAMP(3),
    "salaryInListing" TEXT,
    "usedTailoredResume" BOOLEAN NOT NULL DEFAULT false,
    "userComment" TEXT,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Application_estimatedVacancyId_key" ON "Application"("estimatedVacancyId");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE INDEX "Application_appliedAt_idx" ON "Application"("appliedAt");

-- CreateIndex
CREATE INDEX "EstimatedVacancy_title_idx" ON "EstimatedVacancy" USING GIN ("title" gin_trgm_ops);

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_estimatedVacancyId_fkey" FOREIGN KEY ("estimatedVacancyId") REFERENCES "EstimatedVacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
