output "name" {
  value = google_cloud_run_v2_service.this.name
}

output "uri" {
  value = google_cloud_run_v2_service.this.uri
}

output "audience" {
  value       = local.audience
  description = "Expected aud of OIDC tokens on /events/* and /internal/*."
}

output "service_account" {
  value = google_service_account.runtime
}
