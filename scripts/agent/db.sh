#!/usr/bin/env bash
# Throwaway PostGIS for DB tests (same image as CI), idempotent. Afterwards:
#   export TEST_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/postgres
# Every test runs in its own schema (libs/platform-py testing.isolated_schema), so one database is enough.
set -euo pipefail

NAME=agesoa-test-pg
IMAGE=postgis/postgis:17-3.5

if [ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null || true)" != "true" ]; then
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres -p 5432:5432 "$IMAGE" >/dev/null
fi

# TCP readiness: the image's init server listens on the unix socket only, so this passes after init is done.
for _ in $(seq 1 90); do
  if docker exec "$NAME" pg_isready -h 127.0.0.1 -U postgres -q; then
    echo "postgres ready: postgresql+asyncpg://postgres:postgres@localhost:5432/postgres"
    exit 0
  fi
  sleep 1
done
echo "postgres did not become ready" >&2
docker logs --tail 50 "$NAME" >&2
exit 1
