//! `/api/events`: calendar events with their calendar, category and participants, invitations and RSVP.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::common::{CalendarId, CategoryId, EventId, SubscriptionId, Timestamp, UserId};

crate::id_types!(EventParticipantId, RecurrenceExceptionId);

/// A `calendar_event` row with its relations, as create, read, update and list return it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    /// A recurring instance in a list is `<seriesId>_<occurrence ISO instant>`.
    pub id: EventId,
    /// Empty for encrypted events: the content lives in `encryptedContent`.
    pub title: String,
    pub description: Option<String>,
    pub encrypted_content: Option<String>,
    /// A JSON array of blind-index tokens, stored as text.
    pub blind_index_tokens: Option<String>,
    pub encryption_state: String,
    pub encryption_key_version: i32,
    pub start: Timestamp,
    pub end: Timestamp,
    pub all_day: bool,
    pub location: Option<String>,
    pub color: Option<String>,
    pub timezone: String,
    pub is_private: bool,
    pub reminder: Option<i32>,
    /// A JSON recurrence rule, stored as text.
    pub recurrence: Option<String>,
    pub parent_event_id: Option<EventId>,
    pub is_cancelled: bool,
    pub is_synced: bool,
    pub external_id: Option<String>,
    pub subscription_id: Option<SubscriptionId>,
    pub synced_at: Option<Timestamp>,
    pub stalwart_account_id: Option<String>,
    pub stalwart_calendar_id: Option<String>,
    pub stalwart_event_id: Option<String>,
    pub stalwart_uid: Option<String>,
    pub stalwart_synced_at: Option<Timestamp>,
    pub user_id: UserId,
    pub calendar_id: CalendarId,
    pub category_id: Option<CategoryId>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    pub category: Option<EventCategory>,
    pub calendar: EventCalendar,
    /// Absent only on whole-series recurring edits that carry no participants.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub participants: Option<Vec<EventParticipant>>,
    /// Set on recurring series rows in a list: `false` for the series row itself, `true` for generated instances.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_recurring_instance: Option<bool>,
    /// Present on recurring series rows and their instances in a list.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recurrence_exceptions: Option<Vec<RecurrenceException>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub warnings: Option<Vec<OperationWarning>>,
}

/// The full `calendar` row an event embeds.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EventCalendar {
    pub id: CalendarId,
    pub name: String,
    pub encrypted_name: Option<String>,
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
    pub ics_share_token: Option<String>,
    pub ics_share_enabled: bool,
    pub stalwart_account_id: Option<String>,
    pub stalwart_calendar_id: Option<String>,
    pub stalwart_synced_at: Option<Timestamp>,
    pub user_id: UserId,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// The full `event_category` row an event embeds.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EventCategory {
    pub id: CategoryId,
    pub name: String,
    pub encrypted_name: Option<String>,
    pub blind_index_tokens: Option<String>,
    pub encryption_state: String,
    pub encryption_key_version: i32,
    pub color: String,
    pub is_active: bool,
    pub user_id: UserId,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EventParticipant {
    pub id: EventParticipantId,
    pub event_id: EventId,
    /// The Solace user behind the address, when there is one.
    pub user_id: Option<UserId>,
    pub email: String,
    pub display_name: String,
    /// A Solace avatar path (`/api/profiles/avatars/:id`, or `/api/profiles/avatar?email=` for remote pictures), never a remote URL.
    pub image: Option<String>,
    pub role: String,
    pub status: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RecurrenceException {
    pub id: RecurrenceExceptionId,
    pub parent_event_id: EventId,
    pub exception_date: Timestamp,
    pub modified_event_id: Option<EventId>,
    /// `modified` or `deleted`.
    #[serde(rename = "type")]
    pub kind: String,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A non-fatal problem of a mutation that otherwise succeeded.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct OperationWarning {
    pub code: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EventList {
    /// Regular events, recurring series and instances, and detached occurrences, by start.
    pub events: Vec<Event>,
    pub categories: Vec<EventCategory>,
    pub calendars: Vec<EventCalendar>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EventSearchResults {
    pub events: Vec<SearchEvent>,
    pub total: i64,
}

/// A search hit: a subset of the row with trimmed calendar and category.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SearchEvent {
    pub id: EventId,
    pub title: String,
    pub description: Option<String>,
    pub start: Timestamp,
    pub end: Timestamp,
    pub all_day: bool,
    pub location: Option<String>,
    pub color: Option<String>,
    pub timezone: String,
    pub recurrence: Option<String>,
    pub encrypted_content: Option<String>,
    pub blind_index_tokens: Option<String>,
    pub encryption_state: String,
    pub encryption_key_version: i32,
    pub calendar_id: CalendarId,
    pub category_id: Option<CategoryId>,
    pub user_id: UserId,
    pub calendar: Option<SearchLabel>,
    pub category: Option<SearchLabel>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    pub participants: Vec<EventParticipant>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SearchLabel {
    pub id: String,
    pub name: String,
    pub encrypted_name: Option<String>,
    pub encryption_key_version: i32,
    pub color: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EventSearchCorpus {
    pub events: Vec<Event>,
    pub total: i64,
    pub next_offset: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EventDeleted {
    pub success: bool,
    pub message: String,
    pub deleted_event_id: EventId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct BulkEventResult {
    pub success: bool,
    pub message: String,
    pub events_processed: i64,
    pub action: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created_events: Option<Vec<Event>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct InvitationLookup {
    pub event: Option<Event>,
}

/// What an ICS invitation import did.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct InvitationImportSummary {
    pub messages_scanned: i64,
    pub ics_parts_found: i64,
    pub events_created: i64,
    pub events_updated: i64,
    pub events_deleted: i64,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct InvitationDeclined {
    pub declined: bool,
}

/// A decline answers `{ deleted: true }`; accept and tentative answer the updated event.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(untagged)]
pub enum RsvpResult {
    Deleted(RsvpDeleted),
    Event(Box<Event>),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RsvpDeleted {
    pub deleted: bool,
}

/// `POST /api/subscriptions/import-ics` with on-device encrypted events.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EncryptedIcsImportResult {
    pub success: bool,
    pub events_created: i64,
    pub events_total: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub errors: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateEventRequest {
    pub start: String,
    pub end: String,
    pub calendar_id: CalendarId,
    /// Plaintext content is only accepted without `encryptedContent`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub all_day: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category_id: Option<CategoryId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timezone: Option<String>,
    /// Minutes before the start, or `null` for none.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "::serde_with::rust::double_option"
    )]
    pub reminder: Option<Option<i32>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recurrence: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encrypted_content: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blind_index_tokens: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encryption_key_version: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub participants: Option<Vec<ParticipantInput>>,
    /// Transient plaintext for invitation mail; never stored.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub invitation_content: Option<InvitationContent>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateEventRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timezone: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub all_day: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub calendar_id: Option<CalendarId>,
    /// An empty id clears the category.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "::serde_with::rust::double_option"
    )]
    pub reminder: Option<Option<i32>>,
    /// `null` turns a series into a single event.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "::serde_with::rust::double_option"
    )]
    pub recurrence: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encrypted_content: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blind_index_tokens: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encryption_key_version: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub participants: Option<Vec<ParticipantInput>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub invitation_content: Option<InvitationContent>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ParticipantInput {
    pub email: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InvitationContent {
    pub title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RsvpRequest {
    /// `accepted`, `declined` or `tentative`.
    pub status: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SealEncryptionRequest {
    pub encrypted_content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blind_index_tokens: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encryption_key_version: Option<i32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BulkEventRequest {
    /// `move`, `delete` or `duplicate`.
    pub action: String,
    pub event_ids: Vec<EventId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_calendar_id: Option<CalendarId>,
}

/// A decrypted mailed invitation the client imports.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImportInvitationRequest {
    pub ics_content: String,
    /// `accepted` or `tentative`; without it the invitation is staged.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub calendar_id: Option<CalendarId>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encryption: Option<Vec<InvitationEncryptionEntry>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InvitationEncryptionEntry {
    pub external_id: String,
    pub encrypted_content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blind_index_tokens: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encryption_key_version: Option<i32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeclineInvitationRequest {
    pub ics_content: String,
}

/// `POST /api/subscriptions/import-ics` body of current clients: ciphertext and keyed ids only.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EncryptedIcsImportRequest {
    pub calendar_id: CalendarId,
    pub encrypted_events: Vec<EncryptedIcsImportEvent>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EncryptedIcsImportEvent {
    pub external_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub series_external_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub occurrence_date: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub excluded_dates: Option<Vec<String>>,
    pub start: String,
    pub end: String,
    pub all_day: bool,
    pub timezone: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recurrence: Option<String>,
    pub encrypted_content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blind_index_tokens: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encryption_key_version: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub participants: Option<Vec<ParticipantInput>>,
}
