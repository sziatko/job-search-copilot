-- Phase 4.2 step 8: UNAVAILABLE, "the posting no longer takes applications" — a triage
-- status, after DECLINED. Nothing sorts by status, so `ADD VALUE` is enough.
ALTER TYPE "VacancyStatus" ADD VALUE 'UNAVAILABLE' AFTER 'DECLINED';
