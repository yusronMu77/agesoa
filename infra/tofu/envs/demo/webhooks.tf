# Institution webhooks (delivery): each webhook attempt runs as a Cloud Tasks task that calls delivery back
# (POST /internal/webhooks/<id>/attempts/<n>, OIDC token of the scheduler service account, already an allowed
# internal caller). delivery schedules the retries itself (30 s, 2 min, 10 min); the queue only retries a task whose
# callback did not answer. One Secret Manager secret per subscription (`agesoa-webhook-*`), written only by delivery.

locals {
  # Deterministic Cloud Run URL (as the portal's), known before the service exists.
  delivery_url = "https://agesoa-delivery-${data.google_project.this.number}.${var.region}.run.app"
}

resource "google_cloud_tasks_queue" "webhooks" {
  name     = "agesoa-webhooks"
  location = var.region

  rate_limits {
    max_dispatches_per_second = 5
    max_concurrent_dispatches = 5
  }

  retry_config {
    max_attempts  = 3
    min_backoff   = "10s"
    max_backoff   = "60s"
    max_doublings = 2
  }

  depends_on = [google_project_service.apis]
}

resource "google_cloud_tasks_queue_iam_member" "delivery_enqueuer" {
  name     = google_cloud_tasks_queue.webhooks.name
  location = var.region
  role     = "roles/cloudtasks.enqueuer"
  member   = module.service["delivery"].service_account.member
}

# Tasks carry an OIDC token of the scheduler service account: delivery must be allowed to act as it.
resource "google_service_account_iam_member" "delivery_acts_as_scheduler" {
  service_account_id = google_service_account.scheduler.name
  role               = "roles/iam.serviceAccountUser"
  member             = module.service["delivery"].service_account.member
}

# Create, version and read webhook secrets only (creation is checked on the project; every other operation on the
# secret itself, so other secrets such as the database URLs stay out of reach).
resource "google_project_iam_member" "delivery_webhook_secrets" {
  project = var.project_id
  role    = "roles/secretmanager.admin"
  member  = module.service["delivery"].service_account.member

  condition {
    title      = "agesoa-webhook-secrets"
    expression = "resource.type == \"cloudresourcemanager.googleapis.com/Project\" || resource.name.startsWith(\"projects/${data.google_project.this.number}/secrets/agesoa-webhook-\")"
  }
}
