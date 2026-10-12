# One-time stack: the GCS bucket that holds the state of every other stack (envs/*).
# Its own state stays local (gitignored); losing it only means re-importing one bucket.

terraform {
  required_version = ">= 1.11.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.6"
    }
  }
}

variable "project_id" {
  type        = string
  description = "GCP project that hosts the environment."
}

variable "region" {
  type    = string
  default = "asia-southeast2"
}

variable "state_bucket" {
  type        = string
  default     = ""
  description = "State bucket name; defaults to <project_id>-tofu-state."
}

provider "google" {
  project               = var.project_id
  region                = var.region
  billing_project       = var.project_id
  user_project_override = true
}

locals {
  state_bucket = var.state_bucket != "" ? var.state_bucket : "${var.project_id}-tofu-state"
}

resource "google_project_service" "bootstrap" {
  for_each           = toset(["serviceusage.googleapis.com", "cloudresourcemanager.googleapis.com", "storage.googleapis.com"])
  service            = each.value
  disable_on_destroy = false
}

resource "google_storage_bucket" "state" {
  name                        = local.state_bucket
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      num_newer_versions = 20
      with_state         = "ARCHIVED"
    }
    action {
      type = "Delete"
    }
  }

  depends_on = [google_project_service.bootstrap]
}

output "state_bucket" {
  value       = google_storage_bucket.state.name
  description = "Pass to envs/*: tofu init -backend-config=bucket=<this>."
}
