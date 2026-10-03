-- Renamed: the column holds what the user entered when applying, not the
-- listing's figure. A RENAME, not the DROP + ADD Prisma's diff would write.
ALTER TABLE "Vacancy" RENAME COLUMN "salaryInListing" TO "salaryInApplication";
