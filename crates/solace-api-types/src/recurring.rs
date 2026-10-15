//! `/api/recurring`: rule validation and preview, and scoped edits and deletes of recurring series.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::common::{CalendarId, EventId, Timestamp};
use crate::events::{InvitationContent, ParticipantInput};

/// The JSON object stored (as text) in `calendar_event.recurrence`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecurrenceRule {
    /// `daily`, `weekly`, `monthly` or `yearly`.
    pub frequency: String,
    pub interval: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub count: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub until: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub timezone: Option<String>,
    /// 0 is Sunday.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub by_week_day: Option<Vec<i32>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub by_month_day: Option<Vec<i32>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub by_month: Option<Vec<i32>>,
}

/// A rule object, or the JSON text of one as events store it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(untagged)]
pub enum RecurrenceRuleInput {
    Json(String),
    Rule(RecurrenceRule),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ValidateRecurrenceRequest {
    pub rule: RecurrenceRuleInput,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RecurrenceValidation {
    pub valid: bool,
    pub errors: Vec<String>,
    #[schema(required = true)]
    pub description: Option<String>,
    /// The parsed rule; absent when it could not be parsed.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub rule: Option<RecurrenceRule>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PreviewRecurrenceRequest {
    pub event_start: String,
    pub event_end: String,
    pub recurrence_rule: RecurrenceRuleInput,
    /// 7 to 365 days from the start; 90 when omitted.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub preview_days: Option<i32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RecurrencePreview {
    pub instances: Vec<PreviewInstance>,
    pub description: String,
    pub total_instances: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PreviewInstance {
    pub date: Timestamp,
    pub is_original: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RecurrencePatterns {
    pub patterns: BTreeMap<String, RecurrencePattern>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RecurrencePattern {
    pub rule: RecurrenceRule,
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EditRecurringRequest {
    /// `this_only`, `this_and_future` or `all`.
    pub edit_scope: String,
    /// The occurrence instant; required for `this_only` and `this_and_future`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub occurrence_date: Option<String>,
    pub updates: RecurringUpdates,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RecurringUpdates {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub all_day: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    /// Any number; stored truncated to whole minutes.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reminder: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recurrence: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub calendar_id: Option<CalendarId>,
    /// An empty id clears the category.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timezone: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub participants: Option<Vec<ParticipantInput>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub invitation_content: Option<InvitationContent>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encrypted_content: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blind_index_tokens: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encryption_key_version: Option<i32>,
}

/// Query of `DELETE /api/recurring/event/:id`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeleteRecurringQuery {
    /// `this_only`, `this_and_future` or `all`.
    pub delete_scope: String,
    /// The occurrence instant; required for `this_only` and `this_and_future`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub occurrence_date: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RecurringDeleted {
    pub success: bool,
    pub message: String,
    pub deleted_event_id: EventId,
    /// `delete_occurrence`, `delete_future` or `delete_all`.
    pub action: String,
}
