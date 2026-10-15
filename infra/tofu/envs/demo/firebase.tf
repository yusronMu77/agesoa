# Firebase project and Identity Platform (Firebase Auth upgraded).

resource "google_firebase_project" "this" {
  provider   = google-beta
  project    = var.project_id
  depends_on = [google_project_service.apis]
}

resource "google_firebase_web_app" "portal" {
  provider        = google-beta
  display_name    = "AGESOA Portal"
  deletion_policy = "DELETE"
  depends_on      = [google_firebase_project.this]
}

resource "google_firebase_web_app" "witness" {
  provider        = google-beta
  display_name    = "AGESOA Witness"
  deletion_policy = "DELETE"
  depends_on      = [google_firebase_project.this]
}

resource "google_identity_platform_config" "auth" {
  autodelete_anonymous_users = true
  authorized_domains = [
    "localhost",
    "${var.project_id}.firebaseapp.com",
    "${var.project_id}.web.app",
    local.portal_host,
  ]

  sign_in {
    allow_duplicate_emails = false
    # Witness reporters start anonymous; validators and organizations sign in with e-mail.
    anonymous {
      enabled = true
    }
    email {
      enabled           = true
      password_required = false
    }
  }

  depends_on = [google_firebase_project.this]
}

# Demo sign-in accounts (demo_mode only): trust creates the demo validators, organization admin and operator in
# Identity Platform with their role claims at startup. Their shared password is write-only (never in state) and
# only in Secret Manager: `gcloud secrets versions access latest --secret agesoa-demo-account-password`.
ephemeral "random_password" "demo_accounts" {
  length  = 24
  special = false
}

resource "google_secret_manager_secret" "demo_account_password" {
  count     = var.demo_mode ? 1 : 0
  secret_id = "agesoa-${var.environment}-account-password"
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "demo_account_password" {
  count                  = var.demo_mode ? 1 : 0
  secret                 = google_secret_manager_secret.demo_account_password[0].id
  secret_data_wo         = ephemeral.random_password.demo_accounts.result
  secret_data_wo_version = var.demo_account_password_version
}
