-- Phase 9.1 step 5 (ADR-0042): tags on a vacancy, one `userId` shared by the link's two
-- foreign keys, so a link across users cannot exist. Several steps, so one transaction:
-- Prisma does not wrap a migration in one.
BEGIN;

-- CreateEnum
CREATE TYPE "TagTone" AS ENUM ('NEUTRAL', 'GOOD', 'WARN', 'BAD', 'ACCENT');

-- CreateTable
CREATE TABLE "Tag" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "tone" "TagTone" NOT NULL DEFAULT 'NEUTRAL',

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Tag_nameKey_not_empty" CHECK ("nameKey" <> '')
);

-- CreateTable
CREATE TABLE "VacancyTag" (
    "vacancyId" INTEGER NOT NULL,
    "tagId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VacancyTag_pkey" PRIMARY KEY ("vacancyId","tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_userId_nameKey_key" ON "Tag"("userId", "nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_id_userId_key" ON "Tag"("id", "userId");

-- CreateIndex
CREATE INDEX "VacancyTag_tagId_idx" ON "VacancyTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "Vacancy_id_userId_key" ON "Vacancy"("id", "userId");

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VacancyTag" ADD CONSTRAINT "VacancyTag_vacancyId_userId_fkey" FOREIGN KEY ("vacancyId", "userId") REFERENCES "Vacancy"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VacancyTag" ADD CONSTRAINT "VacancyTag_tagId_userId_fkey" FOREIGN KEY ("tagId", "userId") REFERENCES "Tag"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
