variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "environment" {
  type        = string
  description = "Environment name (demo, staging, prod); part of resource names and the OIDC audience."
}

variable "service" {
  type        = string
  description = "Service name as in the event catalog (e.g. case-audit)."
}

variable "database" {
  type        = string
  description = "Postgres database and user name owned by this service (e.g. case_audit)."
}

variable "sql_instance" {
  type = object({
    name            = string
    connection_name = string
  })
}

variable "db_password_version" {
  type        = number
  default     = 1
  description = "Bump to rotate the database password (written to Cloud SQL and Secret Manager, never to state)."
}

variable "image" {
  type        = string
  description = "Image for the first revision only; later revisions come from the deploy workflow."
}

variable "env" {
  type        = map(string)
  default     = {}
  description = "Plain environment variables (no secrets)."
}

variable "project_roles" {
  type        = list(string)
  default     = []
  description = "Extra project-level roles for the runtime service account."
}

variable "scheduler_service_account" {
  type        = string
  description = "Service account that calls /internal/outbox/sweep."
}

variable "sweep_schedule" {
  type    = string
  default = "*/5 * * * *"
}

variable "min_instances" {
  type    = number
  default = 0
}

variable "max_instances" {
  type    = number
  default = 2
}

variable "memory" {
  type    = string
  default = "512Mi"
}

variable "deletion_protection" {
  type    = bool
  default = true
}
