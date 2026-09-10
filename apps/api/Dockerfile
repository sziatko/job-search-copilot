# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS base
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/mcp/package.json apps/mcp/package.json

# Dev: only installs deps. Source comes from the bind-mount in docker-compose.yml,
# so there is no point baking it into the image here — it would just be shadowed at runtime.
FROM base AS dev
RUN npm ci
COPY packages/core/prisma packages/core/prisma
COPY packages/core/prisma.config.ts packages/core/prisma.config.ts
RUN npm run generate --workspace=@job-search-copilot/core
WORKDIR /repo/apps/api
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

# Build: compiles core + api to plain JS for the production image below.
FROM base AS build
RUN npm ci
COPY packages/core packages/core
COPY apps/api apps/api
RUN npm run generate --workspace=@job-search-copilot/core
RUN npm run build --workspace=@job-search-copilot/core
RUN npm run build --workspace=@job-search-copilot/api

# Production: only prod deps + compiled output, ready to deploy anywhere Docker runs.
FROM node:24-alpine AS production
WORKDIR /repo
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci --omit=dev --workspace=@job-search-copilot/core --workspace=@job-search-copilot/api
COPY --from=build /repo/packages/core/dist packages/core/dist
COPY --from=build /repo/packages/core/prisma packages/core/prisma
COPY --from=build /repo/packages/core/prisma.config.ts packages/core/prisma.config.ts
COPY --from=build /repo/apps/api/dist apps/api/dist
RUN npm run generate --workspace=@job-search-copilot/core
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
