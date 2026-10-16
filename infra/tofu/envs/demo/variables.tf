variable "project_id" {
  type        = string
  description = "GCP project for this environment."
}

variable "environment" {
  type    = string
  default = "demo"
}

variable "region" {
  type        = string
  default     = "asia-southeast2"
  description = "Region for data and compute (Jakarta)."
}

variable "vertex_location" {
  type        = string
  default     = "global"
  description = "Vertex AI location for Gemini calls from the agent services."
}

variable "demo_mode" {
  type        = bool
  default     = false
  description = "Fictional data and scripted fallbacks. The services refuse it when environment = prod."
}

variable "pattern_archive" {
  type        = bool
  default     = false
  description = "case-audit reads the BigQuery event archive for its pattern tests (INCIDENT_STORE=bigquery; its own database is the fallback). Off until the archive query has been tried against the deployed archive."
}

variable "github_repository" {
  type        = string
  default     = "yusronMu77/agesoa-prototype"
  description = "owner/repo allowed to deploy through Workload Identity Federation (main branch only)."
}

variable "operators" {
  type        = list(string)
  default     = []
  description = "Principals (user:a@b.c) allowed to impersonate the ops service account (probe, sweep by hand)."
}

variable "extra_cors_origins" {
  type        = list(string)
  default     = ["http://localhost:3000", "http://localhost:5173", "capacitor://localhost", "https://localhost"]
  description = "Browser origins allowed by the services (Witness dev server, Capacitor app), besides the portal."
}

variable "billing_account" {
  type        = string
  default     = ""
  description = "Billing account id (XXXXXX-XXXXXX-XXXXXX) for the budget; empty = no budget."
}

variable "budget_amount" {
  type        = number
  default     = 75
  description = "Monthly budget in budget_currency (whole units)."
}

variable "budget_currency" {
  type        = string
  default     = "USD"
  description = "Must match the billing account currency."
}

variable "alert_email" {
  type        = string
  default     = ""
  description = "Extra e-mail for budget alerts (billing admins are always notified)."
}

variable "bootstrap_image" {
  type    = string
  default = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "deletion_protection" {
  type        = bool
  default     = true
  description = "Protect Cloud SQL, Firestore, BigQuery and Cloud Run from tofu destroy."
}

variable "db_tier" {
  type    = string
  default = "db-g1-small"
}

variable "demo_account_password_version" {
  type        = number
  default     = 1
  description = "Bump to rotate the password of the demo sign-in accounts (then redeploy trust)."
}

variable "db_password_version" {
  type        = number
  default     = 1
  description = "Bump to rotate every service database password."
}
