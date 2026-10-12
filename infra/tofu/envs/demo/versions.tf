terraform {
  required_version = ">= 1.11.0"

  # tofu init -backend-config=bucket=<bootstrap output state_bucket>
  backend "gcs" {
    prefix = "envs/demo"
  }

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.6"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 8.6"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  # Quota/billing project for user credentials (needed by the Billing Budgets and Identity Toolkit APIs).
  billing_project       = var.project_id
  user_project_override = true
  default_labels = {
    app = "agesoa"
    env = var.environment
  }
}

provider "google-beta" {
  project               = var.project_id
  region                = var.region
  billing_project       = var.project_id
  user_project_override = true
  default_labels = {
    app = "agesoa"
    env = var.environment
  }
}
