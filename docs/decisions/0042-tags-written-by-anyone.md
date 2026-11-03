# 0042 — Tags are written by anyone, the analyzer included

- Status: Accepted · Date: 2026-11

## Context
A vacancy needs marks a table can show at a glance: where it came from, the country, the
work format, whatever the user wants to note. The analyzer knows most of these when it
scores a posting; the user adds their own. `status` is the user's and `recommendation` the
analyzer's (invariant 3), so neither can carry this, and a column per mark would need a
migration for every new one.

## Decision
A `Tag` belongs to a user (`name`, a `tone` of five, a unique `nameKey`). `VacancyTag` links
it to a vacancy. Anyone acting for the user writes both: the web UI, an MCP client, REST with
an API key, and the analyzer, which sends `tags` with its analysis in the analysis's
transaction.

The server holds no rule about any particular tag. Which tags a posting gets (source by URL,
country, one work format) is a rule of the skill that drives the analyzer.

Names are the interface for writing: `normalizeTagKey` makes one tag of `" Remote "` and
`"remote"`, the first spelling is kept, and a new name creates the tag. A bad name, or a
vacancy over `TAGS_PER_VACANCY_MAX`, rejects the whole write, an analysis included: the
skill sees why and retries.

`VacancyTag.userId` is shared by both composite foreign keys, so a link between one user's
tag and another user's vacancy cannot exist at the database level.

## Why this and not the alternatives
- **Only the user writes tags, the analyzer adds a free-text source** — the analyzer's marks
  would have no way to reach the row's chips, and each machine's would be a new field.
- **Tags as a `String[]` on `Vacancy`** — no tone, no rename, and no count per tag without a
  scan.
- **Rules in the server (a tag per source)** — every new rule is a deploy; a skill's is a
  commit.
- **A rejected tag does not reject the analysis** — a tag the skill got wrong would vanish
  without a trace, and the skill would never learn to fix it.

## Consequences
- Invariant 3 is not touched: a tag is neither `status` nor `recommendation`, and writing one
  moves neither, nor the status log.
- Existing vacancies are not tagged by anything; `Vacancy.source` and intake do not change.
- A new machine name is `NEUTRAL`, and a tag the user renamed comes back under its old name
  if a machine repeats it. The way round is the skill's rule: take names from `list_tags`.
- Rename, tone and delete are not in MCP: an LLM does not rebuild the user's tags.

## What this constrains — breaks if you change it
- `attachTags` (`domain/tags.ts`) never lets a P2002 reach an interactive transaction, which
  would abort it: it goes through `createMany({ skipDuplicates: true })`.
- Every write of tags locks its vacancies first and its tags after: `lockVacancies` or
  `writeAnalysis`'s UPDATE, then `createTags`, sorted, with all of a batch's names. Another
  order deadlocks two overlapping writes, a 500 (a red test for each), and without the
  vacancy's lock parallel writes pass `TAGS_PER_VACANCY_MAX`.
- `normalizeTagKey`'s output is stored as `nameKey`: changing it leaves every stored key in
  the old shape and needs a backfill.
- A read that lists a vacancy shows `tags` through `VACANCY_TAGS`; a `select` without it drops
  the chips, the status-change response included (the row is replaced by the answer).
- `forUser`'s `OWNED` table is what scopes `Tag` and `VacancyTag`: a new operation on them
  goes there first.

## Related
[ADR-0009](0009-domain-errors-and-configure-app.md), [ADR-0033](0033-unscored-vacancies-in-one-table.md),
[ADR-0038](0038-multi-user-shared-schema.md), [ADR-0039](0039-api-keys-per-user.md);
`core/src/tags/tag.service.ts`, `core/src/domain/tags.ts`, `core/src/db/for-user.ts`.
