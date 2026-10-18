//! `/api/e2ee`: client-owned wrapping keys, the password envelope and raw records for re-encryption.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::common::{CalendarId, CategoryId, EventId, Timestamp, UserId};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct E2eeBootstrap {
    pub enabled: bool,
    pub rollout_stage: String,
    pub algorithms: E2eeAlgorithms,
    pub devices: Vec<EncryptionDevice>,
    #[schema(required = true)]
    pub password_envelope: Option<PasswordEnvelope>,
    pub calendars: Vec<EncryptionCalendar>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct E2eeAlgorithms {
    pub content: String,
    pub blind_index: String,
    pub wrapping: String,
    pub password_wrapping: String,
}

/// A device's public key and the account keys wrapped to it, stored as the client sent them (trimmed).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EncryptionDevice {
    pub id: String,
    pub user_id: UserId,
    /// Client-chosen device identifier.
    pub device_id: String,
    #[schema(required = true)]
    pub device_label: Option<String>,
    pub public_key: String,
    pub public_key_algorithm: String,
    pub wrapped_account_key: String,
    pub wrapped_search_key: String,
    pub wrap_algorithm: String,
    pub key_version: i32,
    pub last_seen_at: Timestamp,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PasswordEnvelope {
    pub id: String,
    pub user_id: UserId,
    pub kdf_algorithm: String,
    pub kdf_salt: String,
    pub kdf_iterations: i32,
    pub wrapped_account_key: String,
    pub wrapped_search_key: String,
    pub wrap_algorithm: String,
    pub key_version: i32,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EncryptionCalendar {
    pub id: CalendarId,
    pub name: String,
    #[schema(required = true)]
    pub encrypted_name: Option<String>,
    /// Parsed from the stored JSON; unreadable values become an empty list.
    pub blind_index_tokens: Vec<String>,
    pub encryption_state: String,
    pub encryption_key_version: i32,
    pub color: String,
    pub kind: String,
    pub is_default: bool,
    pub is_visible: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EncryptionCategory {
    pub id: CategoryId,
    pub name: String,
    #[schema(required = true)]
    pub encrypted_name: Option<String>,
    pub blind_index_tokens: Vec<String>,
    pub encryption_state: String,
    pub encryption_key_version: i32,
    pub color: String,
    pub is_active: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EncryptionEvent {
    pub id: EventId,
    pub title: String,
    #[schema(required = true)]
    pub description: Option<String>,
    #[schema(required = true)]
    pub encrypted_content: Option<String>,
    pub blind_index_tokens: Vec<String>,
    pub encryption_state: String,
    pub encryption_key_version: i32,
    pub start: Timestamp,
    pub end: Timestamp,
    #[schema(required = true)]
    pub timezone: Option<String>,
    pub all_day: bool,
    #[schema(required = true)]
    pub location: Option<String>,
    #[schema(required = true)]
    pub color: Option<String>,
    pub calendar_id: CalendarId,
    #[schema(required = true)]
    pub category_id: Option<CategoryId>,
    #[schema(required = true)]
    pub reminder: Option<i32>,
    #[schema(required = true)]
    pub recurrence: Option<String>,
    #[schema(required = true)]
    pub parent_event_id: Option<EventId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// Raw owned calendars, active categories and unsynced events, so a client can re-wrap them on password reset.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ResetSnapshot {
    pub calendars: Vec<EncryptionCalendar>,
    pub categories: Vec<EncryptionCategory>,
    pub events: Vec<EncryptionEvent>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RegisterDeviceRequest {
    pub device_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub device_label: Option<String>,
    pub public_key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub public_key_algorithm: Option<String>,
    pub wrapped_account_key: String,
    pub wrapped_search_key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub wrap_algorithm: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub key_version: Option<i32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PasswordEnvelopeRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub kdf_algorithm: Option<String>,
    pub kdf_salt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub kdf_iterations: Option<i32>,
    pub wrapped_account_key: String,
    pub wrapped_search_key: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub wrap_algorithm: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub key_version: Option<i32>,
}
