-- Phase 6.1 step 3: AWAITING, "waiting on their feedback" after a test task or an
-- interview — a pipeline status, after INTERVIEW. Nothing sorts by status, so
-- `ADD VALUE` is enough.
ALTER TYPE "VacancyStatus" ADD VALUE 'AWAITING' AFTER 'INTERVIEW';
