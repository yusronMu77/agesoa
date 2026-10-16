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
            # Sign-in (browser): Identity Platform through the portal's Firebase web app. The web API key is public
            # by design (it identifies the project; access is governed by Identity Platform and the rules).
            FIREBASE_PROJECT_ID  = var.project_id
            FIREBASE_API_KEY     = data.google_firebase_web_app_config.portal.api_key
            FIREBASE_AUTH_DOMAIN = data.google_firebase_web_app_config.portal.auth_domain
            # Public read models, read server-side without credentials (Firestore rules: public_* readable).
            READ_MODEL_URL = "https://firestore.googleapis.com/v1/projects/${var.project_id}/databases/(default)/documents"
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
    # The revision name is not set here nor by the deploy workflow: Cloud Run generates a new one per change.
    ignore_changes = [
      client,
      client_version,
      labels,
      template[0].labels,
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

data "google_firebase_web_app_config" "portal" {
  provider   = google-beta
  web_app_id = google_firebase_web_app.portal.app_id
}
