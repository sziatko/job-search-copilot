-- Tag colours are named by colour, not by quality. RENAME VALUE keeps every row and the
-- default on their value: the type is not rebuilt. Rule 3 of prisma/README.md is broken on
-- purpose, one migration and one deploy for a one-user app: between this migration and the
-- new api starting, the old client answers 500 on a row with tags.
BEGIN;

ALTER TYPE "TagTone" RENAME VALUE 'NEUTRAL' TO 'GREY';
ALTER TYPE "TagTone" RENAME VALUE 'GOOD' TO 'GREEN';
ALTER TYPE "TagTone" RENAME VALUE 'WARN' TO 'AMBER';
ALTER TYPE "TagTone" RENAME VALUE 'BAD' TO 'RED';
ALTER TYPE "TagTone" RENAME VALUE 'ACCENT' TO 'BLUE';

ALTER TYPE "TagTone" ADD VALUE 'TEAL';
ALTER TYPE "TagTone" ADD VALUE 'VIOLET';
ALTER TYPE "TagTone" ADD VALUE 'PINK';
ALTER TYPE "TagTone" ADD VALUE 'ORANGE';
ALTER TYPE "TagTone" ADD VALUE 'LIME';

COMMIT;
