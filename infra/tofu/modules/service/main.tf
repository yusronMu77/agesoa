# One AGESOA domain service: runtime service account, its own Postgres database + user, the DATABASE_URL
# secret, the Cloud Run service and the outbox sweep job. Topics, subscriptions and cross-service IAM are
# wired by the environment stack from the event catalog.

terraform {
  required_providers {
    google = {
      source = "hashicorp/google"
    }
    random = {
      source = "hashicorp/random"
    }
  }
}

locals {
  name     = "agesoa-${var.service}"
  audience = "agesoa-${var.environment}-${var.service}"
  # Built-in Cloud SQL users are members of cloudsqlsuperuser; isolation between services is by credentials.
  base_roles = [
    "roles/cloudsql.client",
    "roles/cloudtrace.agent",
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
  ]
}

resource "google_service_account" "runtime" {
  account_id   = "agesoa-run-${var.service}"
  display_name = "AGESOA ${var.service} (Cloud Run runtime)"
}

resource "google_project_iam_member" "runtime" {
  for_each = toset(concat(local.base_roles, var.project_roles))
  project  = var.project_id
  role     = each.value
  member   = google_service_account.runtime.member
}

# --- Database (one database + user per service on the shared instance) ---

ephemeral "random_password" "db" {
  length  = 32
  special = false
}

resource "google_sql_database" "this" {
  name     = var.database
  instance = var.sql_instance.name
}

resource "google_sql_user" "this" {
  name                = var.database
  instance            = var.sql_instance.name
  password_wo         = ephemeral.random_password.db.result
  password_wo_version = var.db_password_version
  deletion_policy     = "ABANDON"
}

resource "google_secret_manager_secret" "database_url" {
  secret_id = "${local.name}-database-url"
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

resource "google_secret_manager_secret_version" "database_url" {
  secret                 = google_secret_manager_secret.database_url.id
  secret_data_wo         = "postgresql+asyncpg://${var.database}:${ephemeral.random_password.db.result}@/${var.database}?host=/cloudsql/${var.sql_instance.connection_name}"
  secret_data_wo_version = var.db_password_version
  depends_on             = [google_sql_user.this]
}

resource "google_secret_manager_secret_iam_member" "database_url" {
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.runtime.member
}

resource "google_secret_manager_secret_iam_member" "secret_env" {
  for_each  = var.secret_env
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.runtime.member
}

# --- Cloud Run ---

resource "google_cloud_run_v2_service" "this" {
  name                = local.name
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = var.deletion_protection
  # Public API: user calls are authenticated in the app (Firebase ID tokens), service-to-service calls with
  # Google-signed OIDC tokens checked against OIDC_AUDIENCE and an allow-list.
  invoker_iam_disabled = true

  labels = {
    app     = "agesoa"
    env     = var.environment
    service = var.service
  }

  template {
    service_account                  = google_service_account.runtime.email
    max_instance_request_concurrency = 40
    timeout                          = "60s"

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    volumes {
      name = "cloudsql"
      cloud_sql_instance {
        instances = [var.sql_instance.connection_name]
      }
    }

    containers {
      image = var.image

      resources {
        limits = {
          cpu    = "1"
          memory = var.memory
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      dynamic "env" {
        for_each = merge(var.env, {
          OIDC_AUDIENCE        = local.audience
          GOOGLE_CLOUD_PROJECT = var.project_id
        })
        content {
          name  = env.key
          value = env.value
        }
      }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_url.secret_id
            version = "latest"
          }
        }
      }

      dynamic "env" {
        for_each = var.secret_env
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }
    }
  }

  lifecycle {
    # The deploy workflow owns the image and the commit-sha labels of each revision.
    # The revision name is not set here nor by the deploy workflow: Cloud Run generates a new one per change.
    ignore_changes = [
      client,
      client_version,
      labels,
      template[0].labels,
      template[0].containers[0].image,
    ]
  }

  depends_on = [
    google_secret_manager_secret_iam_member.database_url,
    google_secret_manager_secret_version.database_url,
    google_secret_manager_secret_iam_member.secret_env,
    google_project_iam_member.runtime,
  ]
}

# --- Outbox sweep: publishes events whose immediate dispatch failed ---

resource "google_cloud_scheduler_job" "sweep" {
  name             = "${local.name}-outbox-sweep"
  region           = var.region
  schedule         = var.sweep_schedule
  time_zone        = "Etc/UTC"
  attempt_deadline = "60s"

  retry_config {
    retry_count = 0
  }

  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.this.uri}/internal/outbox/sweep"
    oidc_token {
      service_account_email = var.scheduler_service_account
      audience              = local.audience
    }
  }
}
