# Event routing generated from packages/contracts/events/catalog.json:
# one topic per event type, one push subscription per consumer (POST /events/{type}, Google-signed OIDC),
# one BigQuery subscription per topic (raw event archive), dead letters after 5 attempts.

resource "google_project_service_identity" "pubsub" {
  provider = google-beta
  service  = "pubsub.googleapis.com"
}

resource "google_pubsub_topic" "events" {
  for_each                   = local.events
  name                       = each.key
  message_retention_duration = "604800s"
  depends_on                 = [google_project_service.apis]
}

resource "google_pubsub_topic_iam_member" "publishers" {
  for_each = local.topic_publishers
  topic    = google_pubsub_topic.events[each.value.type].name
  role     = "roles/pubsub.publisher"
  member   = module.service[each.value.service].service_account.member
}

resource "google_pubsub_topic" "dead_letter" {
  name                       = "agesoa-dead-letter"
  message_retention_duration = "604800s"
  depends_on                 = [google_project_service.apis]
}

# Keeps dead letters for inspection (a topic without subscriptions drops messages).
resource "google_pubsub_subscription" "dead_letter_inspect" {
  name                       = "agesoa-dead-letter-inspect"
  topic                      = google_pubsub_topic.dead_letter.id
  message_retention_duration = "604800s"
  ack_deadline_seconds       = 60
  expiration_policy {
    ttl = ""
  }
}

resource "google_pubsub_topic_iam_member" "dead_letter_publisher" {
  topic      = google_pubsub_topic.dead_letter.name
  role       = "roles/pubsub.publisher"
  member     = local.pubsub_agent
  depends_on = [google_project_service_identity.pubsub]
}

# Pub/Sub mints OIDC tokens as the push account.
resource "google_service_account_iam_member" "pubsub_token_creator" {
  service_account_id = google_service_account.pubsub_push.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = local.pubsub_agent
  depends_on         = [google_project_service_identity.pubsub]
}

resource "google_pubsub_subscription" "push" {
  for_each             = local.push_subscriptions
  name                 = "push--${each.key}"
  topic                = google_pubsub_topic.events[each.value.type].id
  ack_deadline_seconds = 30
  # Consumers dedupe by CloudEvent id (inbox); ordering is not relied on.
  message_retention_duration = "604800s"

  push_config {
    push_endpoint = "${module.service[each.value.consumer].uri}/events/${each.value.type}"
    oidc_token {
      service_account_email = google_service_account.pubsub_push.email
      audience              = module.service[each.value.consumer].audience
    }
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dead_letter.id
    max_delivery_attempts = 5
  }

  expiration_policy {
    ttl = ""
  }

  depends_on = [google_service_account_iam_member.pubsub_token_creator, google_pubsub_topic_iam_member.dead_letter_publisher]
}

resource "google_pubsub_subscription_iam_member" "dead_letter_subscriber" {
  for_each     = google_pubsub_subscription.push
  subscription = each.value.name
  role         = "roles/pubsub.subscriber"
  member       = local.pubsub_agent
}

# --- BigQuery archive of every event (analytics, audit of the event path) ---

resource "google_bigquery_dataset" "events" {
  dataset_id                 = "agesoa_events"
  location                   = var.region
  description                = "Raw CloudEvents from every AGESOA topic (Pub/Sub BigQuery subscriptions)."
  delete_contents_on_destroy = !var.deletion_protection
  depends_on                 = [google_project_service.apis]
}

resource "google_bigquery_table" "events" {
  dataset_id          = google_bigquery_dataset.events.dataset_id
  table_id            = "events"
  deletion_protection = var.deletion_protection
  description         = "One row per Pub/Sub message; data = structured CloudEvent JSON, attributes = ce-* headers."

  time_partitioning {
    type  = "DAY"
    field = "publish_time"
  }
  clustering = ["subscription_name"]

  schema = jsonencode([
    { name = "subscription_name", type = "STRING", mode = "NULLABLE" },
    { name = "message_id", type = "STRING", mode = "NULLABLE" },
    { name = "publish_time", type = "TIMESTAMP", mode = "NULLABLE" },
    { name = "data", type = "JSON", mode = "NULLABLE" },
    { name = "attributes", type = "JSON", mode = "NULLABLE" },
  ])
}

resource "google_bigquery_dataset_iam_member" "pubsub_writer" {
  dataset_id = google_bigquery_dataset.events.dataset_id
  role       = "roles/bigquery.dataEditor"
  member     = local.pubsub_agent
  depends_on = [google_project_service_identity.pubsub]
}

resource "google_pubsub_subscription" "bigquery" {
  for_each = local.events
  name     = "bq--${each.key}"
  topic    = google_pubsub_topic.events[each.key].id

  bigquery_config {
    table          = "${var.project_id}.${google_bigquery_dataset.events.dataset_id}.${google_bigquery_table.events.table_id}"
    write_metadata = true
  }

  expiration_policy {
    ttl = ""
  }

  depends_on = [google_bigquery_dataset_iam_member.pubsub_writer]
}
