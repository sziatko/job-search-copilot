# Deployment

JSC runs on one VPS, shared with other projects. Why it is shaped this way:
[ADR-0041](decisions/0041-one-origin-images-from-ghcr.md). Running it locally:
[`development.md`](development.md).

## Layout

```
Caddy ── jsc.<domain>      /api/*, /.well-known/*  → jsc-api:3000
      │                    everything else         → jsc-web:80 (nginx)
      └─ jsc-mcp.<domain>                          → jsc-mcp-http:3001
Postgres ← database `jsc`: owner `jsc` (migrations), runtime role `jsc_app`
```

- **The shared layer** — Caddy (HTTPS, a block per subdomain), one Postgres and the
  `web` network — lives in a separate private repo on the server, with the nightly
  backup. Its README says how a project joins it.
- **JSC** is `/srv/jsc`: a clone of this repo for `compose.prod.yml`, and its `.env`
  (from [`.env.prod.example`](../.env.prod.example), `chmod 600`). The images come from
  GHCR, `ghcr.io/<owner>/jsc-{api,mcp,web}:sha-<commit>`, built by
  `.github/workflows/images.yml`; they are public, so the server pulls with no login.
- **The subdomains carry the project prefix** (`jsc.`, `jsc-mcp.`), so another
  project's MCP server can sit beside this one. A hyphen, not `mcp.jsc.`: a `*.<domain>`
  certificate or DNS record covers one level.

## First start

1. The database: role and database `jsc`, by the shared layer's README, then the
   runtime role (§ The database roles). The first migration creates `pg_trgm`, a
   trusted extension, so the owner may.
2. `git clone https://github.com/<owner>/job-search-copilot /srv/jsc`, then `.env` from
   `.env.prod.example` with the real values.
3. The two Caddy blocks, then a Caddy reload:

       jsc.<domain> {
           @api path /api/* /.well-known/*
           reverse_proxy @api jsc-api:3000
           reverse_proxy jsc-web:80
       }
       jsc-mcp.<domain> {
           reverse_proxy jsc-mcp-http:3001
       }

4. `docker compose up -d` in `/srv/jsc`: `jsc-migrate` applies the migrations and
   exits, then the api, the MCP server and the web start.

The OAuth apps (Google, LinkedIn) need the redirect URI
`https://jsc.<domain>/api/auth/callback/{google,linkedin}`. A passkey is bound to
`PASSKEY_RP_ID`: one registered on another domain does not work here.

## The database roles

`jsc` owns the database, and only `jsc-migrate` connects as it (`.env.migrate`). The api
and the MCP server connect as `jsc_app` (`.env`'s `DATABASE_URL`): rows only, no DDL —
an injection or a bug can delete data, not drop a table. As `postgres`, in `/srv/infra`:

    docker compose exec postgres psql -U postgres -d jsc <<'SQL'
    CREATE ROLE jsc_app LOGIN PASSWORD '<password>';
    GRANT CONNECT ON DATABASE jsc TO jsc_app;
    GRANT USAGE ON SCHEMA public TO jsc_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO jsc_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO jsc_app;
    -- Tables and sequences later migrations create, as `jsc`:
    ALTER DEFAULT PRIVILEGES FOR ROLE jsc IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO jsc_app;
    ALTER DEFAULT PRIVILEGES FOR ROLE jsc IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO jsc_app;
    SQL

Then in `/srv/jsc`: `.env.migrate` (`chmod 600`) gets the owner's URL as
`DATABASE_URL`, `.env`'s `DATABASE_URL` becomes `jsc_app`'s, and `docker compose up -d`.
After a restore (`--no-acl` drops the grants a dump carries), run the `GRANT` and
`ALTER DEFAULT PRIVILEGES` lines again: they are idempotent, `CREATE ROLE` is not.

## Deploy a version

    cd /srv/jsc
    git pull                         # compose.prod.yml may have changed
    # JSC_TAG=sha-<commit> in .env
    docker compose pull && docker compose up -d

A version with a migration: run the backup first (`sudo systemctl start
backup.service`). Prisma migrations are not transactional — one that fails halfway
stays half applied.

## Roll back

The same, with the previous `JSC_TAG`. Prisma has no down migrations: rolling back
past a migration means restoring the backup taken before it (the shared layer's README,
"Restore one database").

## Pull the production database

    npm run db:pull                  # into the dev DB (POSTGRES_DB)
    npm run db:pull -- <database>    # into another local database; it must exist

`scripts/db-pull.mjs` streams `pg_dump` from the server over ssh (`PROD_SSH` in the
local `.env`) into the dev stack's Postgres: `pg_restore --clean` in one transaction,
so a failed pull changes nothing. Before it, the target is dumped to the temp folder
(the path is printed) — the way back from a pull into the wrong database. It refuses
`*_test` and `*_e2e`. After it, the `Jwks` rows are deleted: the jwt plugin's private key
is encrypted with the `BETTER_AUTH_SECRET` of the side that made it, so a moved key turns
every signed-in `get-session` into a 500. Better Auth makes a new one on demand.

The local data is a copy: the server is the one that counts. Never point local code at
the production database (an SSH tunnel, a copied `DATABASE_URL`): `migrate:dev` would
run on it. A new migration runs first on a fresh pull, then deploys.

## Cut-over: the local stack's data moves to the server

Once, when the server takes over from the local stack as the live one. Nothing may
write to either database meanwhile.

1. Stop every local writer: the local n8n, Claude Desktop's scheduled tasks.
2. The last local dump, onto the server:

       docker compose exec -T postgres pg_dump -U postgres -Fc job_search_copilot > jsc.dump
       scp jsc.dump <ssh-host>:~

3. On the server, the dump replaces the database, then the stack starts again —
   `jsc-migrate` brings the schema up, the api seeds `MCP_PUBLIC_URL`'s resource:

       cd /srv/jsc && docker compose stop jsc-api jsc-mcp-http
       cd /srv/infra && docker compose exec -T postgres pg_restore -U postgres -d jsc \
         --clean --if-exists --no-owner --no-acl --role jsc --single-transaction < ~/jsc.dump
       docker compose exec -T postgres psql -U postgres -d jsc -c 'DELETE FROM "Jwks"'
       cd /srv/jsc && docker compose up -d && rm ~/jsc.dump

   The `DELETE`: the local signing key is encrypted with the local secret (§ Pull).

4. n8n moves with its volume (the shared layer's README); its workflows' API URL becomes
   `https://jsc.<domain>/api/v1`. The API keys came with the database.
5. MCP clients move to `https://jsc-mcp.<domain>/mcp`: the claude.ai connector is added
   again (its OAuth client was in the replaced database), and Claude's skills that name
   a local URL are updated and uploaded again.
6. Passkeys are registered again: the restored ones are bound to `localhost`.
7. The scheduled tasks back on, the local n8n stays off — two would bring every vacancy
   twice. A server snapshot.

Check: a new vacancy goes n8n → the server, its analysis lands through MCP, the web
shows it; the next night's backup reports in.

## Logs and state

    docker compose ps
    docker compose logs -f jsc-api
    docker compose logs jsc-migrate      # the last migration run
