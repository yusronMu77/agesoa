# templates/service

Copier template for an AGESOA service: FastAPI + ADK 2.x + Alembic (outbox/inbox migration) + uv + Dockerfile,
wired to `libs/platform-py` (health/readiness, Pub/Sub push with OIDC, outbox sweep, probe, logging, tracing).
The 5 services in `services/` were generated from it; service-specific code lives in files the template only
seeds (`api.py`, `events.py`, `tables.py`, later migrations).

```powershell
# new service (from the repo root); add it to events/catalog.json and infra/tofu afterwards
uv run copier copy --defaults templates/service services/<name> `
  --data service_name=<name> --data port=<port> --data "description=<one sentence>"
uv sync --all-packages
uv run python -m agesoa_<name>.export_openapi

# pull template changes into an existing service
uv run copier update --defaults services/<name>
```

| Question | Default |
|---|---|
| `service_name` | — (kebab-case) |
| `package_name` | `agesoa_<service_name with _>` |
| `database_name` | `<service_name with _>` |
| `port` | — (local port) |
| `with_agent` | `true` (adds `google-adk` + `agesoa-packs` and the Gemini model setting) |
