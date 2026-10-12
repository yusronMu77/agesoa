# syntax=docker/dockerfile:1.7
# Build from the repository root: docker build -f services/trust/Dockerfile .
FROM ghcr.io/astral-sh/uv:0.12.21-python3.13-bookworm-slim AS build
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=0
WORKDIR /app
COPY pyproject.toml uv.lock .python-version ./
COPY packages/contracts packages/contracts
COPY libs libs
COPY services services
COPY domain-packs domain-packs
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --package agesoa-trust

FROM python:3.13-slim-bookworm
RUN useradd --system --uid 10001 --home /app app
COPY --from=build --chown=app:app /app /app
# Commit SHA of this build, reported by /healthz (set by the deploy workflow).
ARG RELEASE=dev
ENV PATH=/app/.venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    RELEASE=${RELEASE} \
    PORT=8080 \
    DOMAIN_PACKS_DIR=/app/domain-packs
USER app
WORKDIR /app/services/trust
# Migrations run under an advisory lock before the server starts (one container at a time).
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn agesoa_trust.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips '*'"]
