# Deployment

JSC runs on one VPS, shared with other projects. Why it is shaped this way:
[ADR-0041](decisions/0041-one-origin-images-from-ghcr.md). Running it locally:
[`development.md`](development.md).

## Layout

```
Caddy ── jsc.<domain>      /api/*, /.well-known/*  → jsc-api:3000
      │                    everything else         → jsc-web:80 (nginx)
      └─ jsc-mcp.<domain>                          → jsc-mcp-http:3001
Postgres ← role and database `jsc`
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

1. The database: role and database `jsc`, by the shared layer's README. The first
   migration creates `pg_trgm`, a trusted extension, so the owner may.
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

## Logs and state

    docker compose ps
    docker compose logs -f jsc-api
    docker compose logs jsc-migrate      # the last migration run
