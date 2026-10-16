# infra/tofu

Infrastructure as code with [OpenTofu](https://opentofu.org) (>= 1.11). Every cloud resource of an
environment is declared here; nothing is created by hand in the console. Region `asia-southeast2` (Jakarta)
for data and compute.

```text
bootstrap/         one-time: GCS bucket for the state of envs/* (its own state stays local, gitignored)
modules/service/   one domain service: runtime SA, own Postgres database + user, DATABASE_URL secret,
                   Cloud Run service, outbox sweep job
envs/demo/         the demo environment (everything below)
```

## What `envs/demo` creates

| Area | Resources |
|---|---|
| APIs | Cloud Run, Cloud SQL Admin, Pub/Sub, BigQuery, Secret Manager, Artifact Registry, Cloud Scheduler, Firebase, Identity Platform, Firestore, Vertex AI, Cloud Trace, Logging, Monitoring, Billing Budgets, IAM, STS |
| Database | Cloud SQL `agesoa-demo-pg` (PostgreSQL 17, Enterprise, `db-g1-small`), one database + user per service; passwords are ephemeral (write-only), so they never land in state |
| Secrets | `agesoa-<service>-database-url` per service, readable only by that service; with `demo_mode`, `agesoa-demo-account-password` (shared password of the demo sign-in accounts, write-only, readable only by trust) |
| Services | Cloud Run `agesoa-<service>` × 5 with their own service account (Cloud SQL client, trace, logs, metrics; Vertex AI for agent services; Firestore for read-model writers) |
| Events | from `packages/contracts/events/catalog.json`: one topic per event type, publisher IAM per producer, one push subscription per consumer (`POST /events/{type}`, Google-signed OIDC token, audience `agesoa-demo-<service>`), dead letters after 5 attempts to `agesoa-dead-letter` |
| Analytics | BigQuery `agesoa_events.events` (partitioned by publish time) fed by one BigQuery subscription per topic; case-audit may read it for pattern tests (`dataViewer` on the dataset, `jobUser` on the project; `pattern_archive = true` makes it the default store, off until tried) |
| Jobs | Cloud Scheduler: `/internal/outbox/sweep` per service every 5 minutes (OIDC, scheduler SA) |
| Webhooks | Cloud Tasks queue `agesoa-webhooks`: each institution webhook attempt calls delivery back (`/internal/webhooks/<id>/attempts/<n>`, OIDC of the scheduler SA; delivery schedules the 30 s / 2 min / 10 min retries); delivery may create and read only `agesoa-webhook-*` secrets (one per subscription) |
| Storage | private media bucket `<project>-agesoa-media` (written only by ingestion after EXIF removal; no browser access) |
| Read models | Firestore `(default)` in `asia-southeast2` |
| Identity | Firebase project, web apps (portal, Witness), Identity Platform (anonymous + e-mail). Role claims (`validator`, `org_admin`, `operator`) are set only by trust (`roles/firebaseauth.admin`); with `demo_mode` trust creates the demo validator, organization admin and operator accounts at startup |
| Portal | Cloud Run `agesoa-portal` (Next.js standalone, server-side calls to the five services). Not on Firebase App Hosting: its buildpacks support npm/yarn/pnpm only (this repository uses bun) and it is not offered in `asia-southeast2` |
| Deploy | Artifact Registry `agesoa`, deployer SA reachable only from GitHub Actions on `main` of this repository (Workload Identity Federation, no keys) |
| Ops | `agesoa-ops` SA that operators impersonate to call `/internal/*`; monthly budget with alerts at 50/90/100 % |

Cloud Run services (and the portal) start from a placeholder image; the deploy workflow (`.github/workflows/deploy.yml`) owns
images and revision labels from then on (`ignore_changes`).

## Use

Run from the `agesoa-devbox` distro (OpenTofu is installed there) or any machine with `tofu` and Google
credentials (`gcloud auth application-default login`, account with Owner on the project).

```sh
# 1. once per project: state bucket
cd infra/tofu/bootstrap
tofu init
tofu apply -var project_id=<project>

# 2. environment
cd ../envs/demo
cp demo.tfvars.example demo.tfvars   # fill in project_id, operators, billing_account
tofu init -backend-config=bucket=<project>-tofu-state
tofu plan -var-file=demo.tfvars -out=demo.plan
tofu apply demo.plan
# demo.plan is git-ignored: a saved plan can hold sensitive values, so never commit it

# 3. deploy workflow variables
tofu output -json github_variables | jq -r 'to_entries[] | "\(.key) \(.value)"' |
  while read -r k v; do gh variable set "$k" --body "$v" --repo yusronMu77/agesoa-prototype; done
```

Rotate every database password: bump `db_password_version` and apply (new secret version, then redeploy).
Rotate the demo account password: bump `demo_account_password_version`, apply, then redeploy trust (it updates the
accounts at startup). Read it with `gcloud secrets versions access latest --secret agesoa-demo-account-password`.

## Checks after apply

```sh
# event path: probe -> outbox -> Pub/Sub -> transparency (hash-chained log) + BigQuery
AUD=$(tofu output -json service_audiences | jq -r .ingestion)
URL=$(tofu output -json service_urls | jq -r .ingestion)
TOKEN=$(gcloud auth print-identity-token --impersonate-service-account="$(tofu output -raw ops_service_account)" --audiences="$AUD" --include-email)
curl -fsS -X POST -H "Authorization: Bearer $TOKEN" "$URL/internal/probe"
curl -fsS "$(tofu output -json service_urls | jq -r .transparency)/v1/log/verify"
bq query --use_legacy_sql=false \
  'SELECT subscription_name, JSON_VALUE(data, "$.type") AS type, publish_time FROM agesoa_events.events ORDER BY publish_time DESC LIMIT 5'
```

## Known limits (prototype)

- Built-in Cloud SQL users belong to `cloudsqlsuperuser`, so services are isolated by credentials only.
  Hardening: IAM database authentication + per-database grants.
- Single zonal Cloud SQL instance, no read replicas; Cloud Run max 2 instances per service.
