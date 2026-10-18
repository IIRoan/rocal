//! `/api/calendars`: calendars, delete actions and ICS share links.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::common::{CalendarId, Timestamp, UserId};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Calendar {
    pub id: CalendarId,
    /// Empty when the name is encrypted.
    pub name: String,
    #[schema(required = true)]
    pub encrypted_name: Option<String>,
    /// A JSON array of blind-index tokens, stored as text.
    #[schema(required = true)]
    pub blind_index_tokens: Option<String>,
    pub encryption_state: String,
    pub encryption_key_version: i32,
    pub force_full_encryption: bool,
    pub color: String,
    pub kind: String,
    pub is_public: bool,
    pub is_visible: bool,
    pub is_default: bool,
    pub is_sync_only: bool,
    #[schema(required = true)]
    pub ics_share_token: Option<String>,
    pub ics_share_enabled: bool,
    #[schema(required = true)]
    pub stalwart_account_id: Option<String>,
    #[schema(required = true)]
    pub stalwart_calendar_id: Option<String>,
    #[schema(required = true)]
    pub stalwart_synced_at: Option<Timestamp>,
    pub user_id: UserId,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CalendarList {
    pub calendars: Vec<Calendar>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateCalendarRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub name: Option<String>,
    pub color: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub is_default: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub encrypted_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub blind_index_tokens: Option<Vec<String>>,
    /// Accepted from older clients and ignored; ciphertext presence decides.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub encryption_state: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub encryption_key_version: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub force_full_encryption: Option<bool>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateCalendarRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub is_visible: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub is_default: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub encrypted_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub blind_index_tokens: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub encryption_state: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub encryption_key_version: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub force_full_encryption: Option<bool>,
}

/// Query of `DELETE /api/calendars/:id`; `action` is `delete_events` (default) or `move_events`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeleteCalendarQuery {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_calendar_id: Option<CalendarId>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CalendarDeleteResult {
    pub success: bool,
    pub message: String,
    pub deleted_calendar_id: CalendarId,
    pub events_affected: i64,
    pub action: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CalendarShareLink {
    pub calendar_id: CalendarId,
    /// The stored name, so empty for encrypted names.
    pub calendar_name: String,
    pub enabled: bool,
    #[schema(required = true)]
    pub share_url: Option<String>,
}

/// The whole body may be omitted or `null`.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateShareLinkRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub regenerate: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DisableShareLinkResponse {
    pub success: bool,
}
