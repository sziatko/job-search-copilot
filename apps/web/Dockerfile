# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS base
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/mcp/package.json apps/mcp/package.json
COPY apps/web/package.json apps/web/package.json

# Dev: only installs deps. Source comes from the bind-mount in docker-compose.yml.
FROM base AS dev
RUN npm ci
WORKDIR /repo/apps/web
EXPOSE 5173
CMD ["npm", "run", "dev"]

# Build: produces the static production bundle.
FROM base AS build
RUN npm ci
COPY apps/web apps/web
RUN npm run build --workspace=@job-search-copilot/web

# Production: just the static files behind nginx — no Node runtime needed at all.
FROM nginx:alpine AS production
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
# SPA fallback: without it, reloading /applications hits nginx's 404 (see nginx.conf).
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
