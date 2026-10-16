# syntax=docker/dockerfile:1.7

# The visual tests' machine (ADR-0037): the Playwright image, its tag the version of
# @playwright/test in package-lock.json. CI's e2e job runs in the same image, so a
# baseline taken here matches there. Source comes from the bind-mount in docker-compose.yml.
FROM mcr.microsoft.com/playwright:v1.64.0-noble
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/mcp/package.json apps/mcp/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY packages/core/prisma packages/core/prisma
COPY packages/core/prisma.config.ts packages/core/prisma.config.ts
RUN npm run generate --workspace=@job-search-copilot/core
