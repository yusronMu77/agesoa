# Public portal (Next.js standalone on Cloud Run). Server-side only calls to the services; no database.

resource "google_service_account" "portal" {
  account_id   = "agesoa-run-portal"
  display_name = "AGESOA portal (Cloud Run runtime)"
  depends_on   = [google_project_service.apis]
}

resource "google_project_iam_member" "portal" {
  for_each = toset(["roles/logging.logWriter", "roles/cloudtrace.agent"])
  project  = var.project_id
  role     = each.value
  member   = google_service_account.portal.member
}

resource "google_cloud_run_v2_service" "portal" {
  name                 = "agesoa-portal"
  location             = var.region
  ingress              = "INGRESS_TRAFFIC_ALL"
  deletion_protection  = var.deletion_protection
  invoker_iam_disabled = true

  labels = {
    app     = "agesoa"
    env     = var.environment
    service = "portal"
  }

  template {
    service_account                  = google_service_account.portal.email
    max_instance_request_concurrency = 80
    timeout                          = "30s"

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    containers {
      image = var.bootstrap_image

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      dynamic "env" {
        for_each = merge(
          {
            APP_ENV   = var.environment
            DEMO_MODE = tostring(var.demo_mode)
          },
          { for k, m in module.service : "SERVICE_URL_${upper(replace(k, "-", "_"))}" => m.uri },
        )
        content {
          name  = env.key
          value = env.value
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      client,
      client_version,
      labels,
      template[0].labels,
      template[0].revision,
      template[0].containers[0].image,
    ]
  }

  depends_on = [google_project_iam_member.portal]
}

check "portal_url_is_deterministic" {
  assert {
    condition     = contains(google_cloud_run_v2_service.portal.urls, "https://${local.portal_host}")
    error_message = "Cloud Run URL format changed; update local.portal_host (used for CORS and auth domains)."
  }
}
