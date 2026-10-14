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
