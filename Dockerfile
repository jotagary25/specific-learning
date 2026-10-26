# syntax=docker/dockerfile:1
# Production image: the api (TypeScript run directly by Node 24) serves the built web app.
#   docker build -t english-course .
ARG NODE_IMAGE=node:24-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    CI=true
RUN corepack enable
WORKDIR /app
# Workspace manifests only, so dependency layers are cached until they change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/book-importer/package.json packages/book-importer/

# ---- web build (all dev dependencies) ----
FROM base AS build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store --filter "@english-course/web..."
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @english-course/web build

# ---- api production dependencies ----
FROM base AS prod-deps
# No store cache mount here: node_modules must hold real files to be copied out.
RUN pnpm install --frozen-lockfile --prod --filter "@english-course/api..." \
    && rm -rf /pnpm/store

# ---- runtime ----
FROM ${NODE_IMAGE} AS runtime
# TZ is fixed to UTC: users pick their own zone in Settings (apps/api/src/shared/clock.ts).
ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIST_DIR=/app/apps/web/dist \
    TZ=UTC
WORKDIR /app
COPY --from=prod-deps /app /app
COPY packages/shared/src packages/shared/src
COPY apps/api/src apps/api/src
COPY apps/api/drizzle apps/api/drizzle
COPY content content
COPY --from=build /app/apps/web/dist apps/web/dist
# Files stay root-owned and read-only for the app user.
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/api/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/api/src/index.ts"]
