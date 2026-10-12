# services/ingestion

Citizen reports (drafts, corrections, media, privacy guard) and public signals (news, official data).
Agents: Intake, Signal. Owns the `ingestion` Postgres database; publishes `laporan.diterima`, `sinyal.diterima`.
Python + FastAPI + ADK, one Cloud Run service. Filled in at CP0.
