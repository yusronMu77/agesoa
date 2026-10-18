data "google_project" "this" {}

locals {
  catalog = jsondecode(file("${path.module}/../../../../packages/contracts/events/catalog.json"))
  events  = { for e in local.catalog.events : e.type => e }

  # Domain services. agent = calls Gemini through Vertex AI; firestore = writes read models; identity = sets role
  # claims on Identity Platform accounts (only trust); archive = queries the BigQuery event archive (only case-audit).
  services = {
    ingestion    = { database = "ingestion", agent = true, firestore = false, identity = false, archive = false }
    case-audit   = { database = "case_audit", agent = true, firestore = true, identity = false, archive = true }
    trust        = { database = "trust", agent = true, firestore = false, identity = true, archive = false }
    delivery     = { database = "delivery", agent = true, firestore = false, identity = false, archive = false }
    transparency = { database = "transparency", agent = false, firestore = true, identity = false, archive = false }
  }

  # "<consumer>--<type>" => push subscription
  push_subscriptions = merge([
    for e in local.catalog.events : {
      for c in e.consumers : "${c}--${e.type}" => { consumer = c, type = e.type }
    }
  ]...)

  # Producer "*" (decision.recorded) = every service records decisions.
  topic_publishers = merge([
    for e in local.catalog.events : {
      for s in(e.producer == "*" ? keys(local.services) : [e.producer]) : "${s}--${e.type}" => { service = s, type = e.type }
    }
  ]...)

  pubsub_agent = "serviceAccount:service-${data.google_project.this.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
  # Deterministic Cloud Run URL, known before the portal exists (services need it for CORS, the portal needs them).
  portal_host = "agesoa-portal-${data.google_project.this.number}.${var.region}.run.app"
  # Pull-request preview of the portal (portal.tf); only sign-in needs to know it.
  portal_preview_host = "agesoa-portal-preview-${data.google_project.this.number}.${var.region}.run.app"
  cors_origins        = concat(["https://${local.portal_host}"], var.extra_cors_origins)
}

resource "google_project_service" "apis" {
  for_each = toset([
    "aiplatform.googleapis.com",
    "artifactregistry.googleapis.com",
    "bigquery.googleapis.com",
    "billingbudgets.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "cloudscheduler.googleapis.com",
    "cloudtasks.googleapis.com",
    "cloudtrace.googleapis.com",
    "firebase.googleapis.com",
    "firebaserules.googleapis.com",
    "firestore.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "identitytoolkit.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "pubsub.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "serviceusage.googleapis.com",
    "sqladmin.googleapis.com",
    "sts.googleapis.com",
  ])
  service            = each.value
  disable_on_destroy = false
}

# Shared identities
resource "google_service_account" "pubsub_push" {
  account_id   = "agesoa-pubsub-push"
  display_name = "AGESOA Pub/Sub push (OIDC caller of /events/*)"
  depends_on   = [google_project_service.apis]
}

resource "google_service_account" "scheduler" {
  account_id   = "agesoa-scheduler"
  display_name = "AGESOA Cloud Scheduler (OIDC caller of /internal/*)"
  depends_on   = [google_project_service.apis]
}

resource "google_service_account" "ops" {
  account_id   = "agesoa-ops"
  display_name = "AGESOA operators (impersonated for /internal/probe)"
  depends_on   = [google_project_service.apis]
}

resource "google_service_account_iam_member" "ops_impersonation" {
  for_each           = toset(var.operators)
  service_account_id = google_service_account.ops.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = each.value
}

resource "google_artifact_registry_repository" "images" {
  repository_id = "agesoa"
  location      = var.region
  format        = "DOCKER"
  description   = "AGESOA service images (pushed by the deploy workflow)."

  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 10
    }
  }
  cleanup_policies {
    id     = "delete-old"
    action = "DELETE"
    condition {
      older_than = "2592000s"
    }
  }

  depends_on = [google_project_service.apis]
}
