-- Phase 5 step 2 (ADR-0033): NEW, the analysis queue, first; FILTERED_OUT, screened out
-- before triage, after UNAVAILABLE. Alone in their migration: Postgres cannot use an
-- enum value in the transaction that added it, and 20261003130100 uses both.
ALTER TYPE "VacancyStatus" ADD VALUE 'NEW' BEFORE 'NOT_REVIEWED';
ALTER TYPE "VacancyStatus" ADD VALUE 'FILTERED_OUT' AFTER 'UNAVAILABLE';
