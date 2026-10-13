#!/usr/bin/env bash
# Throwaway Postgres 17 + PostGIS for DB tests (same versions as CI), idempotent. Afterwards:
#   export TEST_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/postgres
# Every test runs in its own schema (libs/platform-py testing.isolated_schema), so one database is enough.
# Uses the apt cluster that setup.sh installs; falls back to the CI image where Docker can run it.
set -euo pipefail

PG_MAJOR=17
URL=postgresql+asyncpg://postgres:postgres@localhost:5432/postgres

if [ -d "/etc/postgresql/$PG_MAJOR/main" ]; then
  sudo pg_ctlcluster "$PG_MAJOR" main status >/dev/null 2>&1 || sudo pg_ctlcluster "$PG_MAJOR" main start
  sudo -u postgres psql -qc "alter user postgres password 'postgres'"
  ready() { pg_isready -h 127.0.0.1 -p 5432 -q; }
else
  NAME=agesoa-test-pg
  if [ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null || true)" != "true" ]; then
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    docker run -d --name "$NAME" -e POSTGRES_PASSWORD=postgres -p 5432:5432 "postgis/postgis:$PG_MAJOR-3.5" >/dev/null
  fi
  # TCP readiness: the image's init server listens on the unix socket only, so this passes after init.
  ready() { docker exec "$NAME" pg_isready -h 127.0.0.1 -U postgres -q; }
fi

for _ in $(seq 1 90); do
  if ready; then
    echo "postgres ready: $URL"
    exit 0
  fi
  sleep 1
done
echo "postgres did not become ready" >&2
exit 1
