//! `/api/mail/*` and the Stalwart webhook: mailbox provisioning, vault backups, the key directory, mail tokens and sync.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::common::Timestamp;

crate::id_types!(
    /// A Stalwart account id, which is also the JMAP `accountId`.
    MailAccountId,
);

/// `GET /api/mail/account`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MailAccountStatus {
    pub email: String,
    #[schema(required = true)]
    pub display_name: Option<String>,
    pub provisioned: bool,
    pub mailbox_approved: bool,
}

/// Argon2id parameters of the encrypted private-key vault.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MailVaultKdfParams {
    pub salt_b64: String,
    #[serde(rename = "memoryKiB")]
    pub memory_kib: u32,
    pub iterations: u32,
    pub parallelism: u32,
}

/// `POST /api/mail/account/bootstrap`; the mailbox address is the session user's email.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MailBootstrapRequest {
    pub public_key_armored: String,
    pub fingerprint: String,
    pub algorithm: String,
    pub created_at: String,
    pub vault_version: u32,
    pub encrypted_vault_b64: String,
    pub kdf: String,
    pub kdf_params: MailVaultKdfParams,
    /// Optional on the wire, but the service rejects a bootstrap without it.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "serde_with::rust::double_option"
    )]
    #[schema(value_type = Option<String>)]
    pub wrapped_secret: Option<Option<String>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "serde_with::rust::double_option"
    )]
    #[schema(value_type = Option<String>)]
    pub wrap_algorithm: Option<Option<String>>,
}

/// The provisioned mailbox returned by bootstrap.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MailSignup {
    pub email: String,
    #[schema(required = true)]
    pub display_name: Option<String>,
    pub stalwart_account_id: MailAccountId,
    pub stalwart_public_key_id: String,
    pub fingerprint: String,
    pub encryption_at_rest_enabled: bool,
}

/// `PUT /api/mail/account/vault-backup`; an omitted or null seal keeps the stored one.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MailVaultBackupRequest {
    pub vault_version: u32,
    pub encrypted_vault_b64: String,
    pub kdf: String,
    pub kdf_params: MailVaultKdfParams,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "serde_with::rust::double_option"
    )]
    #[schema(value_type = Option<String>)]
    pub wrapped_secret: Option<Option<String>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "serde_with::rust::double_option"
    )]
    #[schema(value_type = Option<String>)]
    pub wrap_algorithm: Option<Option<String>>,
}

/// `GET /api/mail/account/vault-backup` and the answer of its `PUT`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MailVaultBackup {
    pub email: String,
    pub vault_version: u32,
    pub encrypted_vault_b64: String,
    pub kdf: String,
    pub kdf_params: MailVaultKdfParams,
    /// Null for legacy vaults sealed before the account-key seal existed.
    #[schema(required = true)]
    pub wrapped_secret: Option<String>,
    #[schema(required = true)]
    pub wrap_algorithm: Option<String>,
}

/// `GET /api/mail/config`, public.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MailConfig {
    pub default_domain: String,
    pub discovery_base_url: String,
    pub signup_enabled: bool,
    pub oauth: MailOAuthConfig,
    /// Null when Stalwart's limits could not be read.
    #[schema(required = true)]
    pub server_limits: Option<MailServerLimits>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MailOAuthConfig {
    pub mail_token_endpoint: String,
}

/// Stalwart's Email and Jmap singleton limits; a field is absent when Stalwart did not report it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MailServerLimits {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_blob_upload_bytes: Option<u64>,
    #[schema(required = true)]
    pub max_attachment_size_bytes: Option<u64>,
    #[schema(required = true)]
    pub max_message_size_bytes: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_mailbox_depth: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_mailbox_name_length: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_mailboxes: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_identities: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_folders: Option<Vec<MailDefaultFolder>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub get_max_results: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub query_max_results: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_method_calls: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_concurrent_uploads: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_request_size_bytes: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub upload_ttl_ms: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MailDefaultFolder {
    pub role: String,
    pub name: String,
    pub create: bool,
    pub subscribe: bool,
}

/// `GET /api/mail/keys/:email`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MailDirectoryKey {
    pub email: String,
    pub public_key_armored: String,
    pub fingerprint: String,
    pub source: String,
    pub trust: String,
}

/// `GET /api/mail/oauth/access-token`: a Stalwart bearer; the wire keeps OAuth's snake_case.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct MailAccessToken {
    pub access_token: String,
    pub expires_in: u64,
    /// Epoch seconds.
    pub expires_at: u64,
}

/// `GET /api/mail/sync` query.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MailSyncQuery {
    pub account_id: MailAccountId,
}

/// `GET /api/mail/sync`: JMAP deltas since the stored state, plus the invitation import they triggered.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MailSyncResult {
    pub account_id: MailAccountId,
    /// True when this call stored the first JMAP state for the mailbox.
    pub initialized: bool,
    pub changed_types: Vec<String>,
    pub email: MailSyncCollection,
    pub mailbox: MailSyncCollection,
    pub thread: MailSyncCollection,
    pub calendar_import: MailCalendarImportSummary,
}

/// One JMAP type's changes; `records` are Stalwart's objects passed through.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MailSyncCollection {
    #[schema(required = true)]
    pub old_state: Option<String>,
    pub new_state: String,
    pub created: Vec<String>,
    pub updated: Vec<String>,
    pub destroyed: Vec<String>,
    pub records: Vec<serde_json::Value>,
}

/// What invitation auto-filing did with the ICS parts it found; also the answer of `POST /api/events/invitations/import-ics`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MailCalendarImportSummary {
    pub messages_scanned: u32,
    pub ics_parts_found: u32,
    pub events_created: u32,
    pub events_updated: u32,
    pub events_deleted: u32,
    pub errors: Vec<String>,
}

/// The `mail.changed` server-sent event of `GET /api/realtime/mail`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MailChangedEvent {
    /// Always `mail.changed`.
    #[serde(rename = "type")]
    pub kind: String,
    pub account_id: MailAccountId,
    pub changed_types: Vec<String>,
    pub received_at: Timestamp,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sync: Option<MailSyncResult>,
}

/// `POST /api/internal/stalwart/webhook`; `enqueuedCount` counts events handed to the push outbox, duplicates included.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct StalwartWebhookResult {
    pub ok: bool,
    pub processed_count: u32,
    pub enqueued_count: u32,
    pub ignored_count: u32,
}

/// The webhook's refusals, which are not the API envelope.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct StalwartWebhookError {
    pub error: String,
    pub message: String,
}
