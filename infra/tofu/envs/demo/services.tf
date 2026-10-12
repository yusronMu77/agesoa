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
  )

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

# Evidence media: private bucket, uploads through signed URLs issued by ingestion.
resource "google_storage_bucket" "media" {
  name                        = "${var.project_id}-agesoa-media"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = !var.deletion_protection

  cors {
    origin          = local.cors_origins
    method          = ["GET", "PUT", "HEAD"]
    response_header = ["Content-Type", "x-goog-content-sha256"]
    max_age_seconds = 3600
  }

  depends_on = [google_project_service.apis]
}

resource "google_storage_bucket_iam_member" "media_ingestion" {
  bucket = google_storage_bucket.media.name
  role   = "roles/storage.objectUser"
  member = module.service["ingestion"].service_account.member
}

# Signed URLs are signed with the runtime account itself (iam.signBlob), no key file.
resource "google_service_account_iam_member" "ingestion_sign_blob" {
  service_account_id = module.service["ingestion"].service_account.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = module.service["ingestion"].service_account.member
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
