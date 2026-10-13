#!/usr/bin/env bash
# Environment setup for cloud coding agents on Ubuntu (Jules "Initial Setup": `bash scripts/agent/setup.sh`,
# then "Run and Snapshot"). Mirrors .github/workflows/ci.yml; see AGENTS.md.
# Jules VM notes (verified 2026-10-13): a setup step that prints nothing for ~1 min is killed (hence the
# heartbeat); BUN_INSTALL=/usr/local/bun is root-owned (sudo works); Docker cannot extract the PostGIS image
# (overlayfs whiteout: operation not permitted), so Postgres + PostGIS come from apt instead.
set -euo pipefail
cd "$(dirname "$0")/../.."

BUN_VERSION=1.4.2  # same as ci.yml
PG_MAJOR=17        # same as ci.yml (postgis/postgis:17-3.5)

( while sleep 15; do echo "[setup $(date +%T)] still running"; done ) &
heartbeat=$!
trap 'kill "$heartbeat" 2>/dev/null || true' EXIT
step() { echo "[setup $(date +%T)] $*"; }

if ! command -v uv >/dev/null 2>&1; then
  step "uv"
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi
if [ "$(bun --version 2>/dev/null || true)" != "$BUN_VERSION" ]; then
  step "bun $BUN_VERSION"
  # Replace the preinstalled bun where it lives, else ~/.bun.
  bun_dir="${BUN_INSTALL:-$HOME/.bun}"
  if mkdir -p "$bun_dir" 2>/dev/null && [ -w "$bun_dir" ]; then
    curl -fsSL https://bun.sh/install | BUN_INSTALL="$bun_dir" bash -s "bun-v$BUN_VERSION"
  elif sudo -n true 2>/dev/null; then
    curl -fsSL https://bun.sh/install | sudo env BUN_INSTALL="$bun_dir" bash -s "bun-v$BUN_VERSION"
  else
    bun_dir="$HOME/.bun"
    curl -fsSL https://bun.sh/install | BUN_INSTALL="$bun_dir" bash -s "bun-v$BUN_VERSION"
  fi
  export PATH="$bun_dir/bin:$PATH"
  hash -r
  [ "$(bun --version)" = "$BUN_VERSION" ]
fi
if [ ! -d "/etc/postgresql/$PG_MAJOR/main" ]; then
  step "postgresql-$PG_MAJOR + postgis (apt, PGDG)"
  export DEBIAN_FRONTEND=noninteractive
  sudo -E apt-get update -qq
  sudo -E apt-get install -y -qq postgresql-common >/dev/null
  sudo -E /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y >/dev/null
  sudo -E apt-get install -y -qq "postgresql-$PG_MAJOR" "postgresql-$PG_MAJOR-postgis-3" >/dev/null
fi

step "uv sync"
uv sync --all-packages --frozen -q   # also installs Python 3.13 from .python-version
step "bun install"
bun install --frozen-lockfile

# Validate the environment once: lint + the full Python suite against the throwaway database.
step "ruff"
uv run ruff check .
uv run ruff format --check .
step "pytest"
bash scripts/agent/db.sh
TEST_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/postgres uv run pytest -q 2>&1 | tail -5
step "done"
