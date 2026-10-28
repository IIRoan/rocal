//! `/api/subscriptions`: external ICS feeds mirrored into read-only calendars, and ICS file imports.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::common::{CalendarId, SubscriptionId, Timestamp, UserId};
use crate::events::ParticipantInput;

/// A feed subscription with its mirrored calendar; only the list carries `_count`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CalendarSubscription {
    pub id: SubscriptionId,
    pub name: String,
    pub url: String,
    pub is_active: bool,
    pub sync_interval_minutes: i32,
    #[schema(required = true)]
    pub last_sync_at: Option<Timestamp>,
    /// `pending`, `success` or `error`.
    pub last_sync_status: String,
    #[schema(required = true)]
    pub last_error_message: Option<String>,
    #[schema(required = true)]
    pub etag: Option<String>,
    #[schema(required = true)]
    pub last_modified: Option<String>,
    pub user_id: UserId,
    pub calendar_id: CalendarId,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    pub calendar: SubscribedCalendar,
    #[serde(rename = "_count", default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub count: Option<SyncLogCount>,
}

/// The full calendar row behind a subscription, as stored.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SubscribedCalendar {
    pub id: CalendarId,
    pub name: String,
    #[schema(required = true)]
    pub encrypted_name: Option<String>,
    /// Raw stored JSON text, not a parsed list.
    #[schema(required = true)]
    pub blind_index_tokens: Option<String>,
    pub encryption_state: String,
    pub encryption_key_version: i32,
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
pub struct SyncLogCount {
    pub sync_logs: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateSubscriptionRequest {
    pub name: String,
    pub url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateSubscriptionRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub name: Option<String>,
    /// Recolors the mirrored calendar.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub is_active: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub sync_interval_minutes: Option<i32>,
}

/// Query of `DELETE /api/subscriptions/:id`; `true` also deletes the synced events and calendar.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeleteSubscriptionQuery {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub delete_events: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DeleteSubscriptionResponse {
    pub success: bool,
}

/// Answer of a manual sync; a failed fetch is an error envelope instead.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionSyncResult {
    pub status: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub message: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub events_added: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub events_updated: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub events_deleted: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub errors: Option<Vec<String>>,
}

/// `POST /api/subscriptions/import-ics`: events the client parsed and encrypted.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EncryptedIcsImportRequest {
    pub calendar_id: CalendarId,
    pub encrypted_events: Vec<EncryptedIcsEvent>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EncryptedIcsEvent {
    pub external_id: String,
    /// Set on an override, together with `occurrenceDate`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub series_external_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub occurrence_date: Option<Timestamp>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub excluded_dates: Option<Vec<Timestamp>>,
    pub start: Timestamp,
    pub end: Timestamp,
    pub all_day: bool,
    pub timezone: String,
    /// A recurrence rule object as JSON text.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub recurrence: Option<String>,
    pub encrypted_content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub blind_index_tokens: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub encryption_key_version: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub participants: Option<Vec<ParticipantInput>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ImportIcsResponse {
    pub success: bool,
    pub events_created: i64,
    pub events_total: i64,
    /// Per-event problems; absent when there were none.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub errors: Option<Vec<String>>,
}
