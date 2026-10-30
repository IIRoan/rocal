//! `/api/notifications/event/:eventId`: per-event reminder schedules the notifications worker sends.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::common::{EventId, NotificationId, Timestamp};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateEventNotificationsRequest {
    pub notifications: Vec<NotificationSetting>,
    /// `v1.<iv>.<ciphertext>` under the notification key; omitted keeps the stored one, `null` clears it.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "::serde_with::rust::double_option"
    )]
    pub encrypted_display_title: Option<Option<String>>,
    /// Binaries built before 2026-09-15 still send it; accepted and dropped, never stored.
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "::serde_with::rust::double_option"
    )]
    #[schema(deprecated)]
    pub display_title: Option<Option<String>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NotificationSetting {
    /// `email` or `browser`.
    pub notification_type: String,
    pub minutes_before: i32,
    pub is_enabled: bool,
    /// `minutes_before` sealed under the notification key, so a push shows the start time without carrying it; omitted keeps a stored one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encrypted_lead: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EventNotifications {
    pub success: bool,
    pub data: EventNotificationList,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EventNotificationList {
    pub event_id: EventId,
    pub notifications: Vec<EventNotification>,
    pub count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EventNotification {
    pub id: NotificationId,
    pub event_id: EventId,
    pub notification_type: String,
    pub minutes_before: i32,
    pub notification_time: Timestamp,
    /// Wall-clock `YYYY-MM-DDTHH:mm:ss` in `notificationTimezone`.
    pub notification_date_local: String,
    pub notification_timezone: String,
    pub is_enabled: bool,
    pub is_sent: bool,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct NotificationUpdateResult {
    pub success: bool,
    pub message: String,
    /// Absent for recurring instances and synced events, which have no reminders.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[schema(nullable = false)]
    pub data: Option<NotificationUpdateData>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct NotificationUpdateData {
    pub event_id: EventId,
    pub created: i64,
    pub skipped: i64,
    pub details: NotificationUpdateDetails,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct NotificationUpdateDetails {
    pub created_notifications: Vec<CreatedNotification>,
    pub skipped_configurations: Vec<SkippedNotification>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreatedNotification {
    pub id: NotificationId,
    /// The notification type.
    #[serde(rename = "type")]
    pub kind: String,
    pub minutes_before: i32,
    pub notification_time: Timestamp,
    pub notification_date_local: String,
    pub notification_timezone: String,
    pub is_enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SkippedNotification {
    pub notification_type: String,
    pub minutes_before: i32,
    /// `disabled`, `notification_time_in_past` or `event_in_past`.
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct NotificationDeleteResult {
    pub success: bool,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<NotificationDeleteData>,
    /// Only on the no-op answer for recurring instances and synced events.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deleted_count: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct NotificationDeleteData {
    pub event_id: EventId,
    pub deleted_count: i64,
}
