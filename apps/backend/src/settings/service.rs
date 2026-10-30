//! Settings rules: working hours and days, the default calendar, and full encryption closing share links.

use sea_orm::TransactionTrait;
use serde_json::Value;
use solace_api_types::SuccessMessage;
use solace_api_types::settings::{UpdateSettingsRequest, UserSettings};

use super::queries;
use crate::auth::guard::RouteUser;
use crate::db::entities::user_settings;
use crate::entity_metadata::is_mail_invitation_staging_calendar;
use crate::error::AppError;
use crate::instant;
use crate::state::AppState;

pub async fn get(state: &AppState, user: &RouteUser) -> Result<UserSettings, AppError> {
    let settings = match queries::find(&state.db, &user.id).await? {
        Some(settings) => settings,
        None => queries::create(&state.db, &user.id).await?,
    };
    Ok(record(settings))
}

/// `SettingsService.update`.
pub async fn update(
    state: &AppState,
    user: &RouteUser,
    request: UpdateSettingsRequest,
) -> Result<UserSettings, AppError> {
    if let (Some(start), Some(end)) = (request.working_hours_start, request.working_hours_end)
        && start >= end
    {
        return Err(AppError::field(
            "Working hours start must be before working hours end",
            "workingHoursStart",
        ));
    }
    if let Some(days) = request
        .working_days
        .as_deref()
        .filter(|days| !days.is_empty())
    {
        check_working_days(days)?;
    }
    if let Some(calendar_id) = request
        .default_calendar_id
        .as_ref()
        .and_then(|id| id.as_ref())
        .filter(|id| !id.0.is_empty())
    {
        let Some(calendar) = queries::own_calendar(&state.db, &user.id, &calendar_id.0).await?
        else {
            return Err(AppError::field(
                "Invalid default calendar or calendar does not belong to user",
                "defaultCalendarId",
            ));
        };
        if calendar.kind != "owned"
            || is_mail_invitation_staging_calendar(
                &calendar.kind,
                calendar.is_sync_only,
                calendar.is_visible,
                &calendar.name,
            )
        {
            return Err(AppError::field(
                "The default calendar must be one of your editable calendars.",
                "defaultCalendarId",
            ));
        }
    }
    let now = instant::now();
    let Some(expected) = request.expected_encrypted_preferences.clone() else {
        return Ok(record(
            queries::upsert(&state.db, &user.id, request, now).await?,
        ));
    };
    let transaction = state.db.begin().await?;
    // The row lock makes compare-and-replace atomic, so two devices never both merge onto the same preferences.
    let stored = queries::sealed_preferences_for_update(&transaction, &user.id).await?;
    if stored != expected {
        return Err(AppError::Conflict(
            "Your settings changed on another device. Try again.".into(),
        ));
    }
    let settings = queries::upsert(&transaction, &user.id, request, now).await?;
    transaction.commit().await?;
    Ok(record(settings))
}

fn check_working_days(days: &str) -> Result<(), AppError> {
    let parsed: Value = serde_json::from_str(days).map_err(|_| {
        AppError::field(
            "Invalid working days format - must be valid JSON array",
            "workingDays",
        )
    })?;
    let valid = parsed.as_array().is_some_and(|days| {
        days.iter()
            .all(|day| day.as_f64().is_some_and(|day| (0.0..=6.0).contains(&day)))
    });
    if valid {
        Ok(())
    } else {
        Err(AppError::field(
            "Working days must be a JSON array of numbers 0-6",
            "workingDays",
        ))
    }
}

pub async fn reset(state: &AppState, user: &RouteUser) -> Result<SuccessMessage, AppError> {
    queries::delete(&state.db, &user.id).await?;
    Ok(SuccessMessage {
        success: true,
        message: "User settings reset to defaults".into(),
    })
}

/// Everything but `defaultReminder`, which is not part of the public settings.
fn record(settings: user_settings::Model) -> UserSettings {
    UserSettings {
        id: settings.id,
        user_id: settings.user_id.into(),
        theme: settings.theme,
        default_view: settings.default_view,
        week_start_day: settings.week_start_day,
        timezone: settings.timezone,
        time_format: settings.time_format,
        working_hours_start: settings.working_hours_start,
        working_hours_end: settings.working_hours_end,
        working_days: settings.working_days,
        email_notifications: settings.email_notifications,
        push_notifications: settings.push_notifications,
        browser_notifications: settings.browser_notifications,
        reminder_sound: settings.reminder_sound,
        default_event_duration: settings.default_event_duration,
        default_calendar_id: settings.default_calendar_id.map(Into::into),
        compact_view: settings.compact_view,
        show_week_numbers: settings.show_week_numbers,
        show_declined_events: settings.show_declined_events,
        encrypted_preferences: settings.encrypted_preferences,
        created_at: instant::iso(settings.created_at),
        updated_at: instant::iso(settings.updated_at),
    }
}
