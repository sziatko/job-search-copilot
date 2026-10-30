# Database & migrations

Prisma 7 + PostgreSQL. Schema: [`schema.prisma`](./schema.prisma).

## Everyday commands

Run from the repo root (they proxy into `@job-search-copilot/core`):

| Command | What it does |
| --- | --- |
| `npm run migrate:dev -w @job-search-copilot/core -- --name <name>` | Diff the schema, create a migration under `migrations/`, apply it to the **dev** DB, regenerate the client. Use this `-w` form: the root `npm run migrate:dev` drops `--name`, and Prisma then hangs on its prompt holding the advisory lock. |
| `npm run migrate:dev -w @job-search-copilot/core -- --name <name> --create-only` | Same, but don't apply — for hand-written SQL (CHECK constraints, extensions, data backfills). Edit the file, then run `migrate:dev` again to apply. |
| `npm run generate -w @job-search-copilot/core` | Regenerate Prisma Client only. |
| `npm run test:db:migrate` | Apply committed migrations to the **test** DB (`job_search_copilot_test`, see `.env.test`). Run after every new migration or the test suite breaks. |
| `npm run studio -w @job-search-copilot/core` | Open Prisma Studio against the dev DB. |

## Rules for a migration in review

1. **Read the generated SQL before committing it.** `migrate dev` writes what it inferred from the schema diff — it is not always what you meant.
2. **Never `ADD COLUMN ... NOT NULL` without a default on a populated table.** Prisma prints a warning and the deploy fails on real data. Use the expand/contract steps below.
3. **Destructive changes (`DROP COLUMN`, `DROP TABLE`, renames, enum value removal) need an expand → migrate → contract split**, one migration each:
   - **expand** — add the new column/table/enum value, nullable or with a default; deploy.
   - **backfill** — a `--create-only` migration with the `UPDATE ... ` / `INSERT ... SELECT` that copies old data across; deploy.
   - **contract** — drop the old column/table once nothing reads it; deploy.
   A rename is the same shape: add new, backfill, drop old — not a bare `RENAME`, which breaks any reader that still expects the old name. Prisma's own diff for a renamed field is `DROP` + `ADD`, which loses the data: write the SQL by hand.
   The split exists for the deployed database, which old code still reads while a release rolls out (`jsc-migrate` runs before the new api starts). The dev, test, e2e and CI databases are migrated together with their code, or built from scratch.
4. **One logical change per migration.** Don't fold an index tweak into a column rename — it makes a partial rollback impossible.
5. **Migrations are append-only once merged.** To undo a shipped migration, write a new one that reverses it.
6. **A hand-written migration of several steps is `BEGIN; … COMMIT;`.** Prisma does not wrap a migration in a transaction: one that fails part way stays half applied, recorded as failed. Run it through Prisma on a scratch copy, the failure path too. Editing a migration a database has already applied changes its checksum, and `migrate dev` then asks to reset that database. The test DB can be rebuilt from scratch: `npx dotenv -e ../../.env.test -- prisma migrate reset --force` in `packages/core`.
7. **`migrate dev` refuses to drop a populated column** when it runs non-interactively. Write that migration by hand, then apply it with `migrate:deploy`.

## Things the schema DSL can't express (added by hand in `--create-only` migrations)

- `CHECK ("matchScore" >= 0 AND "matchScore" <= 100)` — `20260909224918_add_match_score_check`.
- `CHECK (("matchScore" IS NULL) = ("recommendation" IS NULL))` and `CHECK ("status" <> 'NEW' OR "recommendation" IS NULL)` — `20261003130100_vacancy_log_into_vacancy` (ADR-0033).
- `pg_trgm` extension + GIN indexes for `company` / `title` ILIKE search — `20260909225003_company_trigram_index`, `20260910205538_add_application_model` (the extension itself is declared in `datasource.extensions`).

Postgres cannot use a new enum value in the transaction that added it: add the value in a migration of its own, before the one that uses it.
