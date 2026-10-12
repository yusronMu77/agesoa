# syntax=docker/dockerfile:1.7
#
# Cloud Run image for the portal (deployed by .github/workflows/deploy.yml).
# Build from the monorepo root, because the portal depends on the @agesoa/ui workspace package:
#
#   docker build -f apps/portal/Dockerfile -t agesoa-portal .
#
# The build context is filtered by apps/portal/Dockerfile.dockerignore (BuildKit).

ARG BUN_VERSION=1.4.2
ARG NODE_VERSION=24

FROM oven/bun:${BUN_VERSION}-slim AS bun

# --- build: install with bun, build the Next.js standalone output ---
FROM node:${NODE_VERSION}-bookworm-slim AS build
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1

# Workspace manifests first, so the dependency layer is cached between source changes.
# Add a COPY line here when a new workspace package gains a package.json.
COPY package.json bun.lock ./
COPY apps/portal/package.json apps/portal/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN bun install --frozen-lockfile

COPY packages/ui packages/ui
COPY apps/portal apps/portal
RUN bun run --cwd apps/portal build

# --- runtime: Node.js serving the standalone server, as a non-root user ---
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
# Commit SHA of this build, reported by /api/healthz (set by the deploy workflow).
ARG RELEASE=dev
ENV RELEASE=${RELEASE}
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0
WORKDIR /app

COPY --from=build --chown=node:node /repo/apps/portal/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/portal/.next/static ./apps/portal/.next/static

USER node
EXPOSE 8080
CMD ["node", "apps/portal/server.js"]
