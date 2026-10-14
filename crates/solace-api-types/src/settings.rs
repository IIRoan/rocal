//! `/api/settings`: per-user calendar preferences.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::common::{CalendarId, Timestamp, UserId};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UserSettings {
    pub id: String,
    pub user_id: UserId,
    pub theme: String,
    pub default_view: String,
    pub week_start_day: i32,
    pub timezone: String,
    pub time_format: String,
    pub working_hours_start: i32,
    pub working_hours_end: i32,
    /// A JSON array of weekday numbers, stored as text.
    pub working_days: String,
    pub email_notifications: bool,
    pub push_notifications: bool,
    pub browser_notifications: bool,
    pub reminder_sound: bool,
    pub event_encryption_mode: String,
    pub default_event_duration: i32,
    #[schema(required = true)]
    pub default_calendar_id: Option<CalendarId>,
    pub compact_view: bool,
    pub show_week_numbers: bool,
    pub show_declined_events: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateSettingsRequest {
    /// `light`, `dark` or `system`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub theme: Option<String>,
    /// `month`, `week`, `day` or `agenda`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_view: Option<String>,
    /// 0 is Sunday.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub week_start_day: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timezone: Option<String>,
    /// `12h` or `24h`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub time_format: Option<String>,
    /// Minutes after midnight.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub working_hours_start: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub working_hours_end: Option<i32>,
    /// A JSON array of weekday numbers as text.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub working_days: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub email_notifications: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub push_notifications: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub browser_notifications: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reminder_sound: Option<bool>,
    /// `hybrid` or `full`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event_encryption_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_event_duration: Option<i32>,
    /// `null` clears the default calendar.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "::serde_with::rust::double_option"
    )]
    pub default_calendar_id: Option<Option<CalendarId>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub compact_view: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub show_week_numbers: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub show_declined_events: Option<bool>,
}
