# Backup of the Witness Android release key. The key signs every APK on the public repository's releases
# (release-witness.yml) and is registered for com.agesoa.witness in Android developer verification, so losing it means
# no more updates. It is created once with keytool, outside OpenTofu, and only its container is managed here; add the
# value by hand so it never enters the state (JSON: keystore_b64, store_password, key_alias, key_password):
#   gcloud secrets versions add agesoa-witness-release-key --data-file=witness-release-key.json
resource "google_secret_manager_secret" "witness_release_key" {
  secret_id = "agesoa-witness-release-key"
  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
  depends_on = [google_project_service.apis]
}
