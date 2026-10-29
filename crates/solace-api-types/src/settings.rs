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
    pub default_event_duration: i32,
    #[schema(required = true)]
    pub default_calendar_id: Option<CalendarId>,
    pub compact_view: bool,
    pub show_week_numbers: bool,
    pub show_declined_events: bool,
    /// App-only preferences sealed on the device; while set, their fields above hold the defaults.
    #[schema(required = true)]
    pub encrypted_preferences: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateSettingsRequest {
    /// `light`, `dark` or `system`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub theme: Option<String>,
    /// `month`, `week`, `3day`, `day` or `agenda`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub default_view: Option<String>,
    /// 0 is Sunday.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub week_start_day: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub timezone: Option<String>,
    /// `12h` or `24h`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub time_format: Option<String>,
    /// Minutes after midnight.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub working_hours_start: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub working_hours_end: Option<i32>,
    /// A JSON array of weekday numbers as text.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub working_days: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub email_notifications: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub push_notifications: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub browser_notifications: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub reminder_sound: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub default_event_duration: Option<i32>,
    /// `null` clears the default calendar.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "::serde_with::rust::double_option"
    )]
    pub default_calendar_id: Option<Option<CalendarId>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub compact_view: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub show_week_numbers: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub show_declined_events: Option<bool>,
    /// Replaces the sealed preferences; their plaintext fields go back to the defaults and any sent with it are ignored.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub encrypted_preferences: Option<String>,
    /// The sealed preferences this change was merged onto (`null` for none); a different stored value refuses the write with 409.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "::serde_with::rust::double_option"
    )]
    pub expected_encrypted_preferences: Option<Option<String>>,
}
