# Monthly budget with alerts at 50 / 90 / 100 % of actual spend and 100 % of forecast.

resource "google_monitoring_notification_channel" "budget_email" {
  count        = var.alert_email != "" && var.billing_account != "" ? 1 : 0
  display_name = "AGESOA budget alerts"
  type         = "email"
  labels = {
    email_address = var.alert_email
  }
  depends_on = [google_project_service.apis]
}

resource "google_billing_budget" "monthly" {
  count           = var.billing_account != "" ? 1 : 0
  billing_account = var.billing_account
  display_name    = "agesoa-${var.environment}"

  budget_filter {
    projects               = ["projects/${data.google_project.this.number}"]
    calendar_period        = "MONTH"
    credit_types_treatment = "INCLUDE_ALL_CREDITS"
  }

  amount {
    specified_amount {
      currency_code = var.budget_currency
      units         = tostring(var.budget_amount)
    }
  }

  dynamic "threshold_rules" {
    for_each = [0.5, 0.9, 1.0]
    content {
      threshold_percent = threshold_rules.value
      spend_basis       = "CURRENT_SPEND"
    }
  }

  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "FORECASTED_SPEND"
  }

  all_updates_rule {
    disable_default_iam_recipients   = false
    monitoring_notification_channels = google_monitoring_notification_channel.budget_email[*].id
  }

  depends_on = [google_project_service.apis]
}
