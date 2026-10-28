# syntax=docker/dockerfile:1.7

FROM node:26-alpine AS base
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/mcp/package.json apps/mcp/package.json

# Dev: only installs deps. Source comes from the bind-mount in docker-compose.yml.
FROM base AS dev
RUN npm ci
COPY packages/core/prisma packages/core/prisma
COPY packages/core/prisma.config.ts packages/core/prisma.config.ts
RUN npm run generate --workspace=@job-search-copilot/core
WORKDIR /repo/apps/mcp
CMD ["npm", "run", "dev"]

# Build: compiles core + mcp to plain JS for the production image below.
FROM base AS build
RUN npm ci
COPY packages/core packages/core
COPY apps/mcp apps/mcp
RUN npm run generate --workspace=@job-search-copilot/core
RUN npm run build --workspace=@job-search-copilot/core
RUN npm run build --workspace=@job-search-copilot/mcp

# Production: only prod deps + compiled output. Talks over stdio, so it's meant to be
# run per-session (e.g. `docker run --rm -i`), not left running like the api service.
FROM node:26-alpine AS production
WORKDIR /repo
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY apps/mcp/package.json apps/mcp/package.json
RUN npm ci --omit=dev --workspace=@job-search-copilot/core --workspace=@job-search-copilot/mcp
COPY --from=build /repo/packages/core/dist packages/core/dist
COPY --from=build /repo/packages/core/prisma packages/core/prisma
COPY --from=build /repo/packages/core/prisma.config.ts packages/core/prisma.config.ts
COPY --from=build /repo/apps/mcp/dist apps/mcp/dist
RUN npm run generate --workspace=@job-search-copilot/core
# Built as root, run as the image's `node` user: nothing at runtime writes to /repo.
USER node
CMD ["node", "apps/mcp/dist/index.js"]
