#!/usr/bin/env bash
# Environment setup for cloud coding agents on Ubuntu (Jules "Initial Setup": `bash scripts/agent/setup.sh`,
# then "Run and Snapshot"). Mirrors .github/workflows/ci.yml; see AGENTS.md.
set -euo pipefail
cd "$(dirname "$0")/../.."

BUN_VERSION=1.4.2                # same as ci.yml
PG_IMAGE=postgis/postgis:17-3.5  # same as ci.yml

if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi
if [ "$(bun --version 2>/dev/null || true)" != "$BUN_VERSION" ]; then
  curl -fsSL https://bun.sh/install | bash -s "bun-v$BUN_VERSION"
  export PATH="$HOME/.bun/bin:$PATH"
fi

uv sync --all-packages --frozen   # also installs Python 3.13 from .python-version
bun install --frozen-lockfile
docker pull -q "$PG_IMAGE"        # kept in the snapshot; started per task by scripts/agent/db.sh

# Validate the environment once: lint + the full Python suite against a throwaway database.
uv run ruff check .
uv run ruff format --check .
bash scripts/agent/db.sh
TEST_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/postgres uv run pytest -q
docker rm -f agesoa-test-pg >/dev/null
