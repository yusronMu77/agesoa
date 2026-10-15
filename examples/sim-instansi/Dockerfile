# syntax=docker/dockerfile:1.7
# Standalone (no AGESOA packages). Build from this folder: docker build -t sim-instansi examples/sim-instansi
FROM ghcr.io/astral-sh/uv:0.12.21-python3.13-trixie-slim AS build
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=0
WORKDIR /app
COPY pyproject.toml uv.lock .python-version ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project
COPY src src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-editable

FROM python:3.13-slim-trixie
RUN useradd --system --uid 10001 --home /app app
COPY --from=build --chown=app:app /app/.venv /app/.venv
ENV PATH=/app/.venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PORT=8080
USER app
WORKDIR /app
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn sim_instansi.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips '*'"]
