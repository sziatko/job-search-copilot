-- ADR-0026 (revised): the url is the log's key and is required. Rows without one
-- were never checkable by link and are dropped rather than kept as a second kind of row.
DELETE FROM "VacancyLogEntry" WHERE "url" IS NULL;

ALTER TABLE "VacancyLogEntry" ALTER COLUMN "url" SET NOT NULL;
