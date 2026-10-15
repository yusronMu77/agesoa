# One Postgres instance, one database + user per service (no service reads another service's database).
resource "google_sql_database_instance" "postgres" {
  name                = "agesoa-${var.environment}-pg"
  region              = var.region
  database_version    = "POSTGRES_17"
  deletion_protection = var.deletion_protection

  settings {
    edition                     = "ENTERPRISE"
    tier                        = var.db_tier
    availability_type           = "ZONAL"
    disk_type                   = "PD_SSD"
    disk_size                   = 10
    disk_autoresize             = true
    deletion_protection_enabled = var.deletion_protection

    # Public IP without authorized networks: only the Cloud SQL connector (IAM-checked) can reach it.
    ip_configuration {
      ipv4_enabled = true
      ssl_mode     = "ENCRYPTED_ONLY"
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = false
      start_time                     = "19:00" # 02:00 WIB
      backup_retention_settings {
        retained_backups = 7
      }
    }

    maintenance_window {
      day  = 7
      hour = 20 # 03:00 WIB
    }

    insights_config {
      query_insights_enabled = true
    }
  }

  depends_on = [google_project_service.apis]
}

module "service" {
  source   = "../../modules/service"
  for_each = local.services

  project_id          = var.project_id
  region              = var.region
  environment         = var.environment
  service             = each.key
  database            = each.value.database
  db_password_version = var.db_password_version
  deletion_protection = var.deletion_protection
  image               = var.bootstrap_image
  sql_instance = {
    name            = google_sql_database_instance.postgres.name
    connection_name = google_sql_database_instance.postgres.connection_name
  }
  scheduler_service_account = google_service_account.scheduler.email

  project_roles = concat(
    each.value.agent ? ["roles/aiplatform.user"] : [],
    each.value.firestore ? ["roles/datastore.user"] : [],
    each.value.identity ? ["roles/firebaseauth.admin"] : [],
  )

  secret_env = each.value.identity && var.demo_mode ? {
    # From the version, so the service only references the secret once a version exists.
    DEMO_VALIDATOR_PASSWORD = google_secret_manager_secret_version.demo_account_password[0].secret
  } : {}

  env = merge(
    {
      ENVIRONMENT             = var.environment
      DEMO_MODE               = tostring(var.demo_mode)
      PUSH_INVOKER_EMAILS     = google_service_account.pubsub_push.email
      INTERNAL_INVOKER_EMAILS = join(",", [google_service_account.scheduler.email, google_service_account.ops.email])
      CORS_ORIGINS            = join(",", local.cors_origins)
      LOG_LEVEL               = "INFO"
    },
    each.value.agent ? {
      GOOGLE_GENAI_USE_VERTEXAI = "TRUE"
      GOOGLE_CLOUD_LOCATION     = var.vertex_location
    } : {},
    each.key == "ingestion" ? { MEDIA_BUCKET = google_storage_bucket.media.name } : {},
  )

  depends_on = [google_project_service.apis]
}

# Evidence media: private bucket written only by ingestion, after the privacy guard (EXIF removed, hashed).
# Clients upload through the ingestion API, never to the bucket, so there is no CORS and no signed URL.
resource "google_storage_bucket" "media" {
  name                        = "${var.project_id}-agesoa-media"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = !var.deletion_protection

  depends_on = [google_project_service.apis]
}

resource "google_storage_bucket_iam_member" "media_ingestion" {
  bucket = google_storage_bucket.media.name
  role   = "roles/storage.objectUser"
  member = module.service["ingestion"].service_account.member
}

# Read models only (written by services, read by clients).
resource "google_firestore_database" "default" {
  name                    = "(default)"
  location_id             = var.region
  type                    = "FIRESTORE_NATIVE"
  delete_protection_state = var.deletion_protection ? "DELETE_PROTECTION_ENABLED" : "DELETE_PROTECTION_DISABLED"
  deletion_policy         = var.deletion_protection ? "ABANDON" : "DELETE"
  depends_on              = [google_project_service.apis]
}

# Clients only read the public read-model collections; writes come from transparency (server SDK).
resource "google_firebaserules_ruleset" "firestore" {
  source {
    files {
      name    = "firestore.rules"
      content = file("${path.module}/../../../firestore/firestore.rules")
    }
  }
  depends_on = [google_firestore_database.default]
}

resource "google_firebaserules_release" "firestore" {
  name         = "cloud.firestore"
  ruleset_name = google_firebaserules_ruleset.firestore.name
}

# Safety net for the read model: projects events whose after-commit projection did not run.
resource "google_cloud_scheduler_job" "read_model_sync" {
  name             = "agesoa-${var.environment}-transparency-read-model-sync"
  region           = var.region
  schedule         = "*/5 * * * *"
  time_zone        = "Etc/UTC"
  attempt_deadline = "120s"

  retry_config {
    retry_count = 0
  }

  http_target {
    http_method = "POST"
    uri         = "${module.service["transparency"].uri}/internal/read-model/sync"
    oidc_token {
      service_account_email = google_service_account.scheduler.email
      audience              = module.service["transparency"].audience
    }
  }
}
