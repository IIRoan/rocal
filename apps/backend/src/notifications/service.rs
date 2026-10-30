//! `NotificationService`: an event's reminder settings, scheduled in its zone and mirrored into its `reminder` column.

use std::collections::{HashMap, HashSet};

use sea_orm::{Set, TransactionTrait};
use solace_api_types::notifications::{
    CreatedNotification, EventNotification, EventNotificationList, EventNotifications,
    NotificationDeleteData, NotificationDeleteResult, NotificationSetting, NotificationUpdateData,
    NotificationUpdateDetails, NotificationUpdateResult, SealEventRemindersRequest,
    SealedReminders, SkippedNotification,
};

use super::{calculator, queries};
use crate::auth::guard::RouteUser;
use crate::db::entities::{calendar_event, event_notification};
use crate::error::AppError;
use crate::events::service::series_id;
use crate::instant;
use crate::state::AppState;

/// `validateEventOwnership`: recurring instances and synced events have no reminders of their own.
async fn owned_event(
    state: &AppState,
    user: &RouteUser,
    event_id: &str,
) -> Result<Option<calendar_event::Model>, AppError> {
    if series_id(event_id) != event_id {
        return Ok(None);
    }
    let event = queries::event(&state.db, &user.id, event_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Event not found or access denied".into()))?;
    Ok((!event.is_synced).then_some(event))
}

fn dto(row: event_notification::Model) -> EventNotification {
    EventNotification {
        id: row.id.into(),
        event_id: row.event_id.into(),
        notification_type: row.notification_type,
        minutes_before: row.minutes_before,
        notification_time: instant::iso(row.notification_time),
        notification_date_local: row.notification_date_local,
        notification_timezone: row.notification_timezone,
        is_enabled: row.is_enabled,
        is_sent: row.is_sent,
        created_at: instant::iso(row.created_at),
        updated_at: instant::iso(row.updated_at),
    }
}

pub async fn get(
    state: &AppState,
    user: &RouteUser,
    event_id: &str,
) -> Result<EventNotifications, AppError> {
    let notifications = match owned_event(state, user, event_id).await? {
        Some(_) => queries::for_event(&state.db, &user.id, event_id).await?,
        None => Vec::new(),
    };
    Ok(EventNotifications {
        success: true,
        data: EventNotificationList {
            event_id: event_id.to_owned().into(),
            count: i64::try_from(notifications.len()).unwrap_or(i64::MAX),
            notifications: notifications.into_iter().map(dto).collect(),
        },
    })
}

/// Fills the sealed title and leads of the event's pending reminders; their schedule and ids stay as they are.
pub async fn seal(
    state: &AppState,
    user: &RouteUser,
    event_id: &str,
    request: SealEventRemindersRequest,
) -> Result<SealedReminders, AppError> {
    if owned_event(state, user, event_id).await?.is_none() {
        return Ok(SealedReminders { updated: 0 });
    }
    let leads: HashMap<i32, String> = request
        .leads
        .into_iter()
        .map(|lead| (lead.minutes_before, lead.encrypted_lead))
        .collect();
    let transaction = state.db.begin().await?;
    let updated = queries::seal_pending(
        &transaction,
        event_id,
        request.encrypted_display_title.as_deref(),
        &leads,
    )
    .await?;
    transaction.commit().await?;
    Ok(SealedReminders {
        updated: i64::try_from(updated).unwrap_or(i64::MAX),
    })
}

/// Replaces the event's reminders; `encrypted_display_title` absent keeps the stored ciphertext, `null` clears it.
pub async fn set(
    state: &AppState,
    user: &RouteUser,
    event_id: &str,
    settings: Vec<NotificationSetting>,
    encrypted_display_title: Option<Option<String>>,
) -> Result<NotificationUpdateResult, AppError> {
    let Some(event) = owned_event(state, user, event_id).await? else {
        return Ok(NotificationUpdateResult {
            success: true,
            message: "No notifications to update for this event type".into(),
            data: None,
        });
    };
    let keys: Vec<String> = settings
        .iter()
        .map(|s| format!("{}-{}", s.notification_type, s.minutes_before))
        .collect();
    if keys.iter().collect::<HashSet<_>>().len() != keys.len() {
        return Err(AppError::validation(
            "Duplicate notification configurations are not allowed",
        ));
    }
    let reminder_minutes = settings
        .iter()
        .filter(|s| s.is_enabled && s.notification_type == "email")
        .map(|s| s.minutes_before)
        .min();
    let display_title = match encrypted_display_title {
        Some(title) => title,
        None => queries::latest_display_title(&state.db, event_id).await?,
    };
    let stored_leads = queries::stored_leads(&state.db, event_id).await?;
    let now = instant::now();
    let in_past = event.start <= now;
    let mut created = Vec::new();
    let mut rows = Vec::new();
    let mut skipped = Vec::new();
    for setting in &settings {
        let skip = |reason: &str| SkippedNotification {
            notification_type: setting.notification_type.clone(),
            minutes_before: setting.minutes_before,
            reason: reason.into(),
        };
        if in_past {
            skipped.push(skip("event_in_past"));
            continue;
        }
        if !setting.is_enabled {
            skipped.push(skip("disabled"));
            continue;
        }
        let schedule = calculator::schedule_upcoming_reminder(
            instant::unix_millis(event.start),
            f64::from(setting.minutes_before),
            Some(&event.timezone),
            instant::unix_millis(now),
        )
        .map_err(AppError::internal)?;
        let Some(schedule) = schedule else {
            skipped.push(skip("notification_time_in_past"));
            continue;
        };
        let notification_time = instant::from_unix_millis(schedule.notification_time_ms)
            .ok_or_else(|| AppError::internal("reminder time out of range"))?;
        let id = uuid::Uuid::new_v4().to_string();
        rows.push(event_notification::ActiveModel {
            id: Set(id.clone()),
            event_id: Set(event_id.to_owned()),
            notification_type: Set(setting.notification_type.clone()),
            minutes_before: Set(setting.minutes_before),
            notification_time: Set(notification_time),
            notification_date_local: Set(schedule.notification_date_local.clone()),
            notification_timezone: Set(schedule.notification_timezone.clone()),
            is_enabled: Set(true),
            is_sent: Set(false),
            encrypted_display_title: Set(display_title.clone()),
            encrypted_lead: Set(setting
                .encrypted_lead
                .clone()
                .or_else(|| stored_leads.get(&setting.minutes_before).cloned())),
            created_at: Set(now),
            updated_at: Set(now),
        });
        created.push(CreatedNotification {
            id: id.into(),
            kind: setting.notification_type.clone(),
            minutes_before: setting.minutes_before,
            notification_time: instant::iso(notification_time),
            notification_date_local: schedule.notification_date_local,
            notification_timezone: schedule.notification_timezone,
            is_enabled: true,
        });
    }
    let transaction = state.db.begin().await?;
    queries::set_event_reminder(&transaction, &user.id, &event.id, reminder_minutes).await?;
    queries::delete_for_event(&transaction, event_id).await?;
    queries::insert(&transaction, rows).await?;
    transaction.commit().await?;
    let message = if in_past {
        "Event is in the past; notifications skipped"
    } else {
        "Event notifications updated successfully"
    };
    Ok(NotificationUpdateResult {
        success: true,
        message: message.into(),
        data: Some(NotificationUpdateData {
            event_id: event_id.to_owned().into(),
            created: i64::try_from(created.len()).unwrap_or(i64::MAX),
            skipped: i64::try_from(skipped.len()).unwrap_or(i64::MAX),
            details: NotificationUpdateDetails {
                created_notifications: created,
                skipped_configurations: skipped,
            },
        }),
    })
}

pub async fn delete(
    state: &AppState,
    user: &RouteUser,
    event_id: &str,
) -> Result<NotificationDeleteResult, AppError> {
    let Some(event) = owned_event(state, user, event_id).await? else {
        return Ok(NotificationDeleteResult {
            success: true,
            message: "No notifications to delete for this event type".into(),
            data: None,
            deleted_count: Some(0),
        });
    };
    let transaction = state.db.begin().await?;
    let deleted = queries::delete_for_event(&transaction, event_id).await?;
    queries::set_event_reminder(&transaction, &user.id, &event.id, None).await?;
    transaction.commit().await?;
    let deleted = i64::try_from(deleted).unwrap_or(i64::MAX);
    Ok(NotificationDeleteResult {
        success: true,
        message: format!("Successfully deleted {deleted} notifications for event"),
        data: Some(NotificationDeleteData {
            event_id: event_id.to_owned().into(),
            deleted_count: deleted,
        }),
        deleted_count: None,
    })
}
