output "service_urls" {
  value = { for k, m in module.service : k => m.uri }
}

output "service_audiences" {
  value = { for k, m in module.service : k => m.audience }
}

output "portal_url" {
  value = google_cloud_run_v2_service.portal.uri
}

output "ops_service_account" {
  value       = google_service_account.ops.email
  description = "Impersonate to call /internal/*: gcloud auth print-identity-token --impersonate-service-account=<this> --audiences=<audience> --include-email"
}

output "sql_connection_name" {
  value = google_sql_database_instance.postgres.connection_name
}

output "media_bucket" {
  value = google_storage_bucket.media.name
}

output "events_table" {
  value = "${var.project_id}.${google_bigquery_dataset.events.dataset_id}.${google_bigquery_table.events.table_id}"
}

output "firebase_web_apps" {
  value = {
    portal  = google_firebase_web_app.portal.app_id
    witness = google_firebase_web_app.witness.app_id
  }
}

# Values for the deploy workflow (gh variable set ... --env demo).
output "github_variables" {
  value = {
    GCP_PROJECT_ID          = var.project_id
    GCP_REGION              = var.region
    GCP_WIF_PROVIDER        = google_iam_workload_identity_pool_provider.github.name
    GCP_DEPLOYER_SA         = google_service_account.deployer.email
    GCP_ARTIFACT_REPOSITORY = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
  }
}
