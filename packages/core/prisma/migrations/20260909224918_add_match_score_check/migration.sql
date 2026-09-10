-- matchScore is an app-level 0..100 percentage. Prisma's schema DSL can't express a
-- CHECK constraint, so it's added here by hand: the DB stops trusting the app to
-- always send a sane value.
ALTER TABLE "EstimatedVacancy"
  ADD CONSTRAINT "EstimatedVacancy_matchScore_range"
  CHECK ("matchScore" >= 0 AND "matchScore" <= 100);
