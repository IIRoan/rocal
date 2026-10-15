//! `EventService` writes: create, update, delete, bulk actions, sealing, single reads and ICS export.

use std::sync::LazyLock;

use regex_lite::Regex;
use sea_orm::{IntoActiveModel, Set, TransactionTrait};
use solace_api_types::common::OperationWarning;
use solace_api_types::events::{
    BulkEventRequest, BulkEventResult, CreateEventRequest, Event, EventDeleted, InvitationLookup,
    ParticipantInput, SealEncryptionRequest, UpdateEventRequest,
};

use super::encryption::{
    InvitationContentSource, assert_no_plaintext_with_ciphertext, resolve_invitation_content,
    resolve_persistence_policy,
};
use super::view::{self, Relations};
use super::{constraints, queries, recurrence};
use super::{participants, rsvp};
use crate::addresses::is_reserved_system_email;
use crate::auth::guard::RouteUser;
use crate::calendars::queries as calendars;
use crate::db::entities::{
    calendar, calendar_event, event_notification, recurrence_exception, user_settings,
};
use crate::email;
use crate::entity_metadata::{CALENDAR_COLORS, external_calendar_name, is_valid_calendar_color};
use crate::error::AppError;
use crate::http::zod::js_trim;
use crate::instant;
use crate::integrations::ics::{build, export, trimmed_text};
use crate::invitations::request;
use crate::invitations::rsvp_reply::RsvpStatus;
use crate::notifications::calculator;
use crate::notifications::job_payload::should_schedule_event_reminder;
use crate::state::AppState;

const MS_PER_DAY: i64 = 86_400_000;
const MS_PER_MINUTE: i64 = 60_000;

/// A recurring instance id, `<seriesId>_<ISO instant>`; edits and deletes go to the series.
static INSTANCE_ID: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"_\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}")
        .unwrap_or_else(|error| panic!("instance id pattern: {error}"))
});

static EXPORT_INSTANCE_ID: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(.+?)_(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)$")
        .unwrap_or_else(|error| panic!("export instance id pattern: {error}"))
});

pub fn series_id(id: &str) -> &str {
    match id.find('_') {
        Some(at) if INSTANCE_ID.is_match(id) => &id[..at],
        _ => id,
    }
}

fn not_found() -> AppError {
    AppError::validation("Event not found or access denied")
}

fn has_text(value: Option<&str>) -> bool {
    value.is_some_and(|value| !js_trim(value).is_empty())
}

fn color_error() -> AppError {
    AppError::field(
        format!(
            "Color must be one of: {} or a valid hex color (e.g., #FF0000)",
            CALENDAR_COLORS.join(", ")
        ),
        "color",
    )
}

/// `isCalendarWritable`: owned and not managed by a subscription.
pub fn is_writable(calendar: &calendar::Model) -> bool {
    calendar.kind == "owned" && !calendar.is_sync_only
}

fn assert_writable(calendar: &calendar::Model, message: &str) -> Result<(), AppError> {
    if is_writable(calendar) {
        Ok(())
    } else {
        Err(AppError::field(message, "calendarId"))
    }
}

async fn own_calendar(
    state: &AppState,
    user: &RouteUser,
    id: &str,
) -> Result<calendar::Model, AppError> {
    calendars::find(&state.db, &user.id, id)
        .await?
        .ok_or_else(|| {
            AppError::field(
                "Invalid calendar or calendar does not belong to user",
                "calendarId",
            )
        })
}

async fn assert_active_category(
    state: &AppState,
    user: &RouteUser,
    id: &str,
) -> Result<(), AppError> {
    if queries::active_category(&state.db, &user.id, id)
        .await?
        .is_none()
    {
        return Err(AppError::field(
            "Invalid category or category does not belong to user",
            "categoryId",
        ));
    }
    Ok(())
}

fn assert_no_reserved_participants(
    participants: Option<&[ParticipantInput]>,
) -> Result<(), AppError> {
    if participants
        .into_iter()
        .flatten()
        .any(|participant| is_reserved_system_email(&participant.email, None))
    {
        return Err(AppError::field(
            "Cannot invite system or administrative email addresses",
            "participants",
        ));
    }
    Ok(())
}

/// Any rule problem answers the same message, as the TypeScript catch-all did.
fn assert_recurrence(rule: &str) -> Result<(), AppError> {
    let valid = recurrence::parse_rule(rule)
        .is_some_and(|rule| recurrence::validate_rule(&rule).is_empty());
    if !valid {
        tracing::error!("Recurrence validation error");
        return Err(AppError::field(
            "Invalid recurrence rule format",
            "recurrence",
        ));
    }
    Ok(())
}

fn parse_instant(text: &str, field: &str) -> Result<time::PrimitiveDateTime, AppError> {
    instant::parse_js_date(text)
        .and_then(instant::from_unix_millis)
        .ok_or_else(|| {
            AppError::field(
                format!("Invalid {field} date format. Use ISO 8601 format"),
                field,
            )
        })
}

fn checked_reminder(minutes: Option<i32>) -> Result<Option<i32>, AppError> {
    constraints::validate_reminder_minutes(minutes.map(f64::from))?;
    Ok(minutes)
}

fn tokens_json(tokens: &[String]) -> Result<String, AppError> {
    serde_json::to_string(tokens).map_err(AppError::internal)
}

/// `isAttendeeCopyForUser`: the caller is on the event as an attendee.
fn attendee_copy(
    user_id: &str,
    participants: &[(
        crate::db::entities::event_participant::Model,
        Option<crate::db::entities::user::Model>,
    )],
) -> bool {
    participants
        .iter()
        .find(|(row, _)| row.user_id.as_deref() == Some(user_id))
        .is_some_and(|(row, _)| row.role == "attendee")
}

/// `insertUpcomingEventReminder`: `false` when the event already started.
pub async fn insert_reminder<C: sea_orm::ConnectionTrait>(
    db: &C,
    event_id: &str,
    start: time::PrimitiveDateTime,
    minutes_before: i32,
    timezone: &str,
    encrypted_display_title: Option<String>,
    notification_type: &str,
) -> Result<bool, AppError> {
    let now = instant::now();
    let schedule = calculator::schedule_upcoming_reminder(
        instant::unix_millis(start),
        f64::from(minutes_before),
        Some(timezone),
        instant::unix_millis(now),
    )
    .map_err(AppError::internal)?;
    let Some(schedule) = schedule else {
        return Ok(false);
    };
    let notification_time = instant::from_unix_millis(schedule.notification_time_ms)
        .ok_or_else(|| AppError::internal("reminder time out of range"))?;
    queries::insert_reminder(
        db,
        event_notification::ActiveModel {
            event_id: Set(event_id.to_owned()),
            notification_type: Set(notification_type.to_owned()),
            minutes_before: Set(minutes_before),
            notification_time: Set(notification_time),
            notification_date_local: Set(schedule.notification_date_local),
            notification_timezone: Set(schedule.notification_timezone),
            is_enabled: Set(true),
            is_sent: Set(false),
            encrypted_display_title: Set(encrypted_display_title),
            // The schedule is after this instant, which chk_notification_time_future requires of created_at.
            created_at: Set(now),
            updated_at: Set(now),
            ..Default::default()
        },
    )
    .await?;
    Ok(true)
}

fn schedules_reminders(settings: Option<&user_settings::Model>) -> bool {
    should_schedule_event_reminder(
        settings.map(|s| s.email_notifications),
        settings.map(|s| s.push_notifications),
    )
}

/// `getById`: an instance id falls back to its series.
pub async fn get(state: &AppState, user: &RouteUser, id: &str) -> Result<Event, AppError> {
    let mut found = queries::find(&state.db, &user.id, id).await?;
    if found.is_none() && id.contains('_') {
        let parent = id.split('_').next().unwrap_or_default();
        found = queries::find(&state.db, &user.id, parent).await?;
    }
    let found = found.ok_or_else(not_found)?;
    view::one(&state.db, &found).await
}

/// `getInvitationByExternalId`: the local copy of a mailed invitation, outside subscriptions.
pub async fn invitation_by_external_id(
    state: &AppState,
    user: &RouteUser,
    external_id: &str,
) -> Result<InvitationLookup, AppError> {
    let external_id = js_trim(external_id);
    if external_id.is_empty() {
        return Err(AppError::field(
            "External event id is required",
            "externalId",
        ));
    }
    let event = match queries::by_external_id(&state.db, &user.id, external_id).await? {
        Some(found) => Some(view::one(&state.db, &found).await?),
        None => None,
    };
    Ok(InvitationLookup { event })
}

pub async fn create(
    state: &AppState,
    user: &RouteUser,
    request: CreateEventRequest,
) -> Result<Event, AppError> {
    let has_encrypted = has_text(request.encrypted_content.as_deref());
    assert_no_plaintext_with_ciphertext(
        request.encrypted_content.as_deref(),
        [
            ("title", request.title.as_deref()),
            ("description", request.description.as_deref()),
            ("location", request.location.as_deref()),
        ],
    )?;
    if !has_encrypted && !has_text(request.title.as_deref()) {
        return Err(AppError::field(
            "Title is required and cannot be empty",
            "title",
        ));
    }
    if request.start.is_empty() {
        return Err(AppError::field("Start date is required", "start"));
    }
    if request.end.is_empty() {
        return Err(AppError::field("End date is required", "end"));
    }
    let start = parse_instant(&request.start, "start")?;
    let end = parse_instant(&request.end, "end")?;
    if start >= end {
        return Err(AppError::field("End time must be after start time", "end"));
    }
    if let Some(color) = request.color.as_deref().filter(|c| !c.is_empty())
        && !is_valid_calendar_color(color)
    {
        return Err(color_error());
    }
    assert_no_reserved_participants(request.participants.as_deref())?;
    if let Some(rule) = request.recurrence.as_deref().filter(|r| !r.is_empty()) {
        assert_recurrence(rule)?;
    }
    let category_id = request
        .category_id
        .as_ref()
        .map(|id| id.0.clone())
        .filter(|id| !id.is_empty());
    if let Some(category_id) = &category_id {
        assert_active_category(state, user, category_id).await?;
    }
    if has_text(request.title.as_deref()) {
        constraints::validate_title_length(request.title.as_deref())?;
    }
    constraints::validate_description_length(request.description.as_deref())?;
    constraints::validate_location_length(request.location.as_deref())?;
    if request.calendar_id.0.is_empty() {
        return Err(AppError::field("Calendar ID is required", "calendarId"));
    }
    let calendar = own_calendar(state, user, &request.calendar_id.0).await?;
    assert_writable(
        &calendar,
        "Cannot create events in a read-only calendar. This calendar is managed by a subscription or public feed.",
    )?;
    let reminder = checked_reminder(request.reminder.flatten())?;
    let settings = queries::settings(&state.db, &user.id).await?;
    let timezone = instant::resolve_timezone(
        request
            .timezone
            .as_deref()
            .or(settings.as_ref().map(|s| s.timezone.as_str())),
    );
    if is_writable(&calendar) && !has_encrypted {
        return Err(AppError::field(
            "Event encryption requires an active encryption session.",
            "encryptedContent",
        ));
    }
    let policy = resolve_persistence_policy(
        has_encrypted,
        request.title.as_deref().unwrap_or_default(),
        request.description.as_deref(),
        request.location.as_deref(),
    );
    let uid = format!("{}@solace-calendar.local", uuid::Uuid::new_v4());
    let mut row = calendar_event::ActiveModel {
        title: Set(policy.title),
        description: Set(policy.description),
        encryption_state: Set(policy.encryption_state.into()),
        start: Set(start),
        end: Set(end),
        timezone: Set(timezone.clone()),
        all_day: Set(request.all_day.unwrap_or(false)),
        location: Set(policy.location),
        color: Set(request.color.clone().filter(|c| !c.is_empty())),
        calendar_id: Set(request.calendar_id.0.clone()),
        category_id: Set(category_id),
        reminder: Set(reminder),
        recurrence: Set(request.recurrence.clone().filter(|r| !r.is_empty())),
        user_id: Set(user.id.clone()),
        external_id: Set(Some(uid.clone())),
        stalwart_event_id: Set(None),
        stalwart_uid: Set(Some(uid)),
        stalwart_synced_at: Set(None),
        ..Default::default()
    };
    if let Some(content) = &request.encrypted_content {
        row.encrypted_content = Set(Some(content.clone()));
    }
    if let Some(tokens) = &request.blind_index_tokens {
        row.blind_index_tokens = Set(Some(tokens_json(tokens)?));
    }
    if let Some(version) = request.encryption_key_version {
        row.encryption_key_version = Set(version);
    }
    let event = queries::insert(&state.db, row).await?;
    let synced = participants::sync(
        &state.db,
        &event.id,
        request.participants.as_deref().unwrap_or_default(),
        Some(&user.id),
    )
    .await?;
    let content = resolve_invitation_content(
        has_encrypted,
        request.invitation_content.as_ref(),
        request.title.as_deref(),
        request.description.as_deref(),
        request.location.as_deref(),
    );
    let mut warnings = invite(state, &event, &synced, &calendar.name, content).await?;
    if let Some(minutes) = reminder.filter(|m| *m > 0)
        && schedules_reminders(settings.as_ref())
        && let Err(error) = insert_reminder(
            &state.db, &event.id, start, minutes, &timezone, None, "email",
        )
        .await
    {
        tracing::error!(error = %error, "Failed to create notifications");
        warnings.push(email::reminder_schedule_warning(
            email::ReminderContext::Create,
        ));
    }
    let relations = Relations::load(&state.db, &[&event], false).await?;
    let mut created = view::event_dto(&event, &relations)?;
    created.participants = Some(synced.participants);
    created.warnings = (!warnings.is_empty()).then_some(warnings);
    Ok(created)
}

/// Mails the REQUEST to new invitees once their rows exist; without plaintext to put in it, nobody is mailed.
async fn invite(
    state: &AppState,
    event: &calendar_event::Model,
    synced: &participants::Synced,
    calendar_name: &str,
    content: Option<InvitationContentSource>,
) -> Result<Vec<OperationWarning>, AppError> {
    let Some(content) = content else {
        return Ok(Vec::new());
    };
    let invitation = invitation_event(event, &content)?;
    Ok(request::send_pending(state, &event.id, synced, calendar_name, &invitation).await)
}

/// The REQUEST a new invitee is mailed: the stored event with the invitation's plaintext.
pub fn invitation_event(
    event: &calendar_event::Model,
    content: &InvitationContentSource,
) -> Result<build::Event, AppError> {
    export::to_build_event(&export::ExportEvent {
        title: &content.title,
        description: content.description.as_deref(),
        location: content.location.as_deref(),
        ..export_event(event, &[])
    })
    .map_err(AppError::internal)
}

pub async fn update(
    state: &AppState,
    user: &RouteUser,
    requested: &str,
    request: UpdateEventRequest,
) -> Result<Event, AppError> {
    let id = series_id(requested).to_owned();
    let existing = queries::find(&state.db, &user.id, &id)
        .await?
        .ok_or_else(not_found)?;
    let existing_participants =
        queries::participants_with_users(&state.db, std::slice::from_ref(&existing.id)).await?;
    if existing.is_synced {
        return Err(AppError::validation(
            "Cannot edit synced events. Synced events are read-only.",
        ));
    }
    if attendee_copy(&user.id, &existing_participants) && !existing.is_cancelled {
        return Err(AppError::validation(
            "Imported invitation events are read-only for attendees.",
        ));
    }
    let start = request
        .start
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|s| parse_instant(s, "start"))
        .transpose()?;
    let end = request
        .end
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(|s| parse_instant(s, "end"))
        .transpose()?;
    let final_start = start.unwrap_or(existing.start);
    let final_end = end.unwrap_or(existing.end);
    if final_start >= final_end {
        return Err(AppError::field("End time must be after start time", "end"));
    }
    assert_no_plaintext_with_ciphertext(
        request.encrypted_content.as_deref(),
        [
            ("title", request.title.as_deref()),
            ("description", request.description.as_deref()),
            ("location", request.location.as_deref()),
        ],
    )?;
    if !has_text(request.encrypted_content.as_deref())
        && request.title.is_some()
        && !has_text(request.title.as_deref())
    {
        return Err(AppError::field(
            "Title is required and cannot be empty",
            "title",
        ));
    }
    if request.title.is_some() {
        constraints::validate_title_length(request.title.as_deref())?;
    }
    if request.description.is_some() {
        constraints::validate_description_length(request.description.as_deref())?;
    }
    if request.location.is_some() {
        constraints::validate_location_length(request.location.as_deref())?;
    }
    let reminder_value = checked_reminder(request.reminder.flatten())?;
    if let Some(color) = request.color.as_deref().filter(|c| !c.is_empty())
        && !is_valid_calendar_color(color)
    {
        return Err(color_error());
    }
    let target = match &request.calendar_id {
        Some(calendar_id) => {
            let target = own_calendar(state, user, &calendar_id.0).await?;
            assert_writable(&target, "Cannot move events to a read-only calendar.")?;
            Some(target)
        }
        None => None,
    };
    if let Some(category_id) = request.category_id.as_deref().filter(|id| !id.is_empty()) {
        assert_active_category(state, user, category_id).await?;
    }
    let final_calendar = match target {
        Some(target) => target,
        None => own_calendar(state, user, &existing.calendar_id).await?,
    };
    let settings = queries::settings(&state.db, &user.id).await?;
    let timezone = match &request.timezone {
        Some(zone) => instant::resolve_timezone(
            Some(zone.as_str()).or(settings.as_ref().map(|s| s.timezone.as_str())),
        ),
        None => existing.timezone.clone(),
    };
    let existing_has_encrypted = has_text(existing.encrypted_content.as_deref());
    let final_encrypted = match &request.encrypted_content {
        Some(content) => Some(content.clone()),
        None => existing.encrypted_content.clone(),
    };
    let has_encrypted = has_text(final_encrypted.as_deref());
    let sensitive =
        request.title.is_some() || request.description.is_some() || request.location.is_some();
    let writable = is_writable(&final_calendar);
    if sensitive && request.encrypted_content.is_none() && (existing_has_encrypted || writable) {
        return Err(AppError::field(
            "Encrypted content payload is required when updating protected event fields.",
            "encryptedContent",
        ));
    }
    if writable && !has_encrypted && !existing.is_synced {
        return Err(AppError::field(
            "Event encryption requires an active encryption session.",
            "encryptedContent",
        ));
    }
    let next_title = match &request.title {
        Some(title) => js_trim(title).to_owned(),
        None => existing.title.clone(),
    };
    let optional = |given: &Option<String>, current: &Option<String>| match given {
        Some(value) => trimmed_text(Some(value)),
        None => current.clone(),
    };
    let next_description = optional(&request.description, &existing.description);
    let next_location = optional(&request.location, &existing.location);
    let final_reminder = match request.reminder {
        Some(_) => reminder_value,
        None => existing.reminder,
    };
    let policy = resolve_persistence_policy(
        has_encrypted,
        &next_title,
        next_description.as_deref(),
        next_location.as_deref(),
    );
    let seen = existing.updated_at;
    let mut row = existing.into_active_model();
    row.title = Set(policy.title);
    row.description = Set(policy.description);
    row.location = Set(policy.location);
    if let Some(start) = start {
        row.start = Set(start);
    }
    if let Some(end) = end {
        row.end = Set(end);
    }
    if let Some(all_day) = request.all_day {
        row.all_day = Set(all_day);
    }
    if request.timezone.is_some() {
        row.timezone = Set(timezone.clone());
    }
    if let Some(color) = &request.color {
        row.color = Set(Some(color.clone()).filter(|c| !c.is_empty()));
    }
    if let Some(calendar_id) = &request.calendar_id {
        row.calendar_id = Set(calendar_id.0.clone());
    }
    if let Some(category_id) = &request.category_id {
        row.category_id = Set(Some(category_id.clone()).filter(|c| !c.is_empty()));
    }
    assert_no_reserved_participants(request.participants.as_deref())?;
    if request.reminder.is_some() {
        row.reminder = Set(reminder_value);
    }
    if let Some(recurrence) = &request.recurrence {
        if let Some(rule) = recurrence.as_deref().filter(|r| !r.is_empty()) {
            assert_recurrence(rule)?;
        }
        row.recurrence = Set(recurrence.clone().filter(|r| !r.is_empty()));
    }
    if let Some(content) = &request.encrypted_content {
        row.encrypted_content = Set(Some(content.clone()));
    }
    if let Some(tokens) = &request.blind_index_tokens {
        row.blind_index_tokens = Set(Some(tokens_json(tokens)?));
    }
    row.encryption_state = Set(policy.encryption_state.into());
    if let Some(version) = request.encryption_key_version {
        row.encryption_key_version = Set(version);
    }
    row.updated_at = Set(instant::now());
    let updated = queries::update_if_unchanged(&state.db, row, &id, seen)
        .await?
        .ok_or_else(|| {
            AppError::validation(
                "Event was modified by another process. Please refresh and try again.",
            )
        })?;
    let mut warnings = Vec::new();
    if let Some(given) = &request.participants {
        let synced = participants::sync(&state.db, &updated.id, given, Some(&user.id)).await?;
        let content = resolve_invitation_content(
            has_encrypted,
            request.invitation_content.as_ref(),
            Some(&next_title),
            next_description.as_deref(),
            next_location.as_deref(),
        );
        warnings = invite(state, &updated, &synced, &final_calendar.name, content).await?;
    }
    if (start.is_some() || end.is_some() || request.reminder.is_some())
        && let Err(error) = reschedule_reminders(
            state,
            &id,
            request.reminder.is_some(),
            final_reminder,
            final_start,
            &timezone,
            settings.as_ref(),
        )
        .await
    {
        tracing::error!(error = %error, "Failed to update notifications");
        warnings.push(email::reminder_schedule_warning(
            email::ReminderContext::Update,
        ));
    }
    let mut event = view::one(&state.db, &updated).await?;
    event.warnings = (!warnings.is_empty()).then_some(warnings);
    Ok(event)
}

/// Rebuilds the event's reminders after a time or reminder change, keeping the encrypted display title.
async fn reschedule_reminders(
    state: &AppState,
    event_id: &str,
    reminder_changed: bool,
    final_reminder: Option<i32>,
    start: time::PrimitiveDateTime,
    timezone: &str,
    settings: Option<&user_settings::Model>,
) -> Result<(), AppError> {
    let existing = queries::reminders(&state.db, event_id).await?;
    let preserved = existing
        .iter()
        .find_map(|n| n.encrypted_display_title.clone());
    let configs: Vec<(String, i32, bool, Option<String>)> = if reminder_changed {
        match final_reminder.filter(|m| *m > 0) {
            Some(minutes) if schedules_reminders(settings) => {
                vec![("email".into(), minutes, true, preserved)]
            }
            _ => Vec::new(),
        }
    } else {
        existing
            .iter()
            .map(|n| {
                (
                    n.notification_type.clone(),
                    n.minutes_before,
                    n.is_enabled,
                    n.encrypted_display_title
                        .clone()
                        .or_else(|| preserved.clone()),
                )
            })
            .collect()
    };
    queries::delete_reminders(&state.db, vec![event_id.to_owned()]).await?;
    for (kind, minutes, enabled, title) in configs {
        if enabled {
            insert_reminder(&state.db, event_id, start, minutes, timezone, title, &kind).await?;
        }
    }
    Ok(())
}

pub async fn delete(
    state: &AppState,
    user: &RouteUser,
    requested: &str,
) -> Result<EventDeleted, AppError> {
    let id = series_id(requested).to_owned();
    let existing = queries::find(&state.db, &user.id, &id)
        .await?
        .ok_or_else(not_found)?;
    if existing.is_synced {
        return Err(AppError::validation(
            "Cannot delete synced events. Synced events are read-only.",
        ));
    }
    let participants =
        queries::participants_with_users(&state.db, std::slice::from_ref(&existing.id)).await?;
    let attendee_invitation =
        has_text(existing.external_id.as_deref()) && attendee_copy(&user.id, &participants);
    if attendee_invitation && !existing.is_cancelled {
        rsvp::respond(state, user, &id, RsvpStatus::Declined).await?;
        rsvp::purge(state, user, &id).await?;
        return Ok(EventDeleted {
            success: true,
            message: "Invitation declined and removed from your calendar".into(),
            deleted_event_id: id.into(),
        });
    }
    let transaction = state.db.begin().await?;
    let deleted_reminders = queries::delete_reminders(&transaction, vec![id.clone()]).await?;
    queries::delete_notification_logs(&transaction, Some(&user.id), vec![id.clone()]).await?;
    queries::delete(&transaction, &user.id, vec![id.clone()]).await?;
    transaction.commit().await?;
    tracing::info!(
        deleted_reminders,
        "Deleted notifications for a deleted event"
    );
    let message = if attendee_invitation && existing.is_cancelled {
        "Cancelled event removed from your calendar"
    } else {
        "Event deleted successfully"
    };
    Ok(EventDeleted {
        success: true,
        message: message.into(),
        deleted_event_id: id.into(),
    })
}

pub async fn bulk(
    state: &AppState,
    user: &RouteUser,
    request: BulkEventRequest,
) -> Result<BulkEventResult, AppError> {
    if request.event_ids.is_empty() {
        return Err(AppError::field("Event IDs array is required", "eventIds"));
    }
    let ids: Vec<String> = request.event_ids.iter().map(|id| id.0.clone()).collect();
    let events = queries::find_many(&state.db, &user.id, ids.clone()).await?;
    if events.len() != ids.len() {
        return Err(AppError::field(
            "Some events not found or access denied",
            "eventIds",
        ));
    }
    // Counts, not titles: an error message must not carry user content.
    let synced = events.iter().filter(|e| e.is_synced).count();
    if synced > 0 {
        return Err(AppError::validation(format!(
            "Cannot modify synced events. Synced events are read-only ({synced} selected)."
        )));
    }
    let relations = Relations::load(&state.db, &events.iter().collect::<Vec<_>>(), false).await?;
    let attendee = |event: &calendar_event::Model| {
        attendee_copy(&user.id, relations.participants_of(&event.id))
    };
    let read_only = events
        .iter()
        .filter(|e| attendee(e) && !e.is_cancelled)
        .count();
    if read_only > 0 && request.action != "delete" {
        return Err(AppError::validation(format!(
            "Imported invitation events are read-only for attendees ({read_only} selected)."
        )));
    }
    match request.action.as_str() {
        "move" => {
            let Some(target_id) = request
                .target_calendar_id
                .as_ref()
                .filter(|id| !id.0.is_empty())
            else {
                return Err(AppError::field(
                    "Target calendar ID is required for move operation",
                    "targetCalendarId",
                ));
            };
            let target = calendars::find(&state.db, &user.id, &target_id.0)
                .await?
                .ok_or_else(|| {
                    AppError::field(
                        "Target calendar not found or access denied",
                        "targetCalendarId",
                    )
                })?;
            if target.ics_share_enabled && events.iter().any(|e| e.encryption_state == "encrypted")
            {
                return Err(AppError::field(
                    "Events with encrypted details cannot be moved into a calendar with ICS sharing enabled.",
                    "targetCalendarId",
                ));
            }
            let moved =
                queries::move_to_calendar(&state.db, &user.id, ids, &target.id, instant::now())
                    .await?;
            Ok(BulkEventResult {
                success: true,
                message: format!("Successfully moved {moved} events"),
                events_processed: i64::try_from(moved).unwrap_or(i64::MAX),
                action: "move".into(),
                created_events: None,
            })
        }
        "delete" => {
            let invitation =
                |e: &calendar_event::Model| has_text(e.external_id.as_deref()) && attendee(e);
            let mut declined: u64 = 0;
            for event in events.iter().filter(|e| invitation(e) && !e.is_cancelled) {
                rsvp::respond(state, user, &event.id, RsvpStatus::Declined).await?;
                declined += 1;
            }
            let local: Vec<String> = events
                .iter()
                .filter(|e| !invitation(e) || e.is_cancelled)
                .map(|e| e.id.clone())
                .collect();
            let mut deleted = declined;
            if !local.is_empty() {
                let transaction = state.db.begin().await?;
                queries::delete_reminders(&transaction, local.clone()).await?;
                queries::delete_notification_logs(&transaction, None, local.clone()).await?;
                deleted += queries::delete(&transaction, &user.id, local).await?;
                transaction.commit().await?;
            }
            Ok(BulkEventResult {
                success: true,
                message: format!("Successfully deleted {deleted} events"),
                events_processed: i64::try_from(deleted).unwrap_or(i64::MAX),
                action: "delete".into(),
                created_events: None,
            })
        }
        "duplicate" => {
            duplicate(
                state,
                user,
                &events,
                &relations,
                request.target_calendar_id.as_ref().map(|id| id.0.as_str()),
            )
            .await
        }
        _ => Err(AppError::field(
            "Invalid action. Use 'move', 'delete', or 'duplicate'",
            "action",
        )),
    }
}

async fn duplicate(
    state: &AppState,
    user: &RouteUser,
    events: &[calendar_event::Model],
    relations: &Relations,
    target_calendar_id: Option<&str>,
) -> Result<BulkEventResult, AppError> {
    let settings = queries::settings(&state.db, &user.id).await?;
    let mut created = Vec::new();
    for event in events {
        let title = if event.encryption_state == "encrypted" {
            event.title.clone()
        } else {
            format!("{} (Copy)", event.title)
        };
        let copy = queries::insert(
            &state.db,
            calendar_event::ActiveModel {
                title: Set(title),
                description: Set(event.description.clone()),
                encrypted_content: Set(event.encrypted_content.clone()),
                blind_index_tokens: Set(event.blind_index_tokens.clone()),
                encryption_state: Set(event.encryption_state.clone()),
                encryption_key_version: Set(event.encryption_key_version),
                start: Set(event.start),
                end: Set(event.end),
                all_day: Set(event.all_day),
                location: Set(event.location.clone()),
                color: Set(event.color.clone()),
                is_private: Set(event.is_private),
                reminder: Set(event.reminder),
                recurrence: Set(None),
                calendar_id: Set(target_calendar_id
                    .filter(|id| !id.is_empty())
                    .map_or_else(|| event.calendar_id.clone(), str::to_owned)),
                category_id: Set(event.category_id.clone()),
                user_id: Set(user.id.clone()),
                ..Default::default()
            },
        )
        .await?;
        let attendees: Vec<ParticipantInput> = relations
            .participants_of(&event.id)
            .iter()
            .filter(|(row, _)| row.role != "organizer")
            .map(|(row, owner)| ParticipantInput {
                email: row.email.clone(),
                display_name: row
                    .display_name
                    .clone()
                    .or_else(|| owner.as_ref().map(|u| u.name.clone())),
                role: Some("attendee".into()),
                status: Some(row.status.clone()),
            })
            .collect();
        let synced = participants::sync(&state.db, &copy.id, &attendees, Some(&user.id)).await?;
        if let Some(minutes) = event.reminder.filter(|m| *m > 0)
            && schedules_reminders(settings.as_ref())
            && let Err(error) = insert_reminder(
                &state.db,
                &copy.id,
                copy.start,
                minutes,
                &copy.timezone,
                None,
                "email",
            )
            .await
        {
            tracing::error!(error = %error, "Failed to create notifications for a duplicated event");
        }
        let copy_relations = Relations::load(&state.db, &[&copy], false).await?;
        let mut dto = view::event_dto(&copy, &copy_relations)?;
        dto.participants = Some(synced.participants);
        created.push(dto);
    }
    Ok(BulkEventResult {
        success: true,
        message: format!("Successfully duplicated {} events", created.len()),
        events_processed: i64::try_from(created.len()).unwrap_or(i64::MAX),
        action: "duplicate".into(),
        created_events: Some(created),
    })
}

/// Stores ciphertext for an imported invitation without touching its schedule.
pub async fn seal(
    state: &AppState,
    user: &RouteUser,
    id: &str,
    request: SealEncryptionRequest,
) -> Result<Event, AppError> {
    if !has_text(Some(&request.encrypted_content)) {
        return Err(AppError::field(
            "Encrypted content payload is required.",
            "encryptedContent",
        ));
    }
    let existing = queries::find(&state.db, &user.id, id)
        .await?
        .ok_or_else(not_found)?;
    if existing.is_synced {
        return Err(AppError::validation(
            "Cannot seal encryption for synced subscription events.",
        ));
    }
    if existing.encryption_state == "encrypted" {
        return view::one(&state.db, &existing).await;
    }
    let policy = resolve_persistence_policy(
        true,
        &existing.title,
        existing.description.as_deref(),
        existing.location.as_deref(),
    );
    let mut row = existing.into_active_model();
    row.title = Set(policy.title);
    row.description = Set(policy.description);
    row.location = Set(policy.location);
    row.encrypted_content = Set(Some(request.encrypted_content));
    if let Some(tokens) = &request.blind_index_tokens {
        row.blind_index_tokens = Set(Some(tokens_json(tokens)?));
    }
    row.encryption_state = Set(policy.encryption_state.into());
    row.encryption_key_version = Set(request.encryption_key_version.unwrap_or(1));
    let updated = queries::update(&state.db, row).await?;
    view::one(&state.db, &updated).await
}

/// A stored row as the ICS export reads it.
pub fn export_event<'a>(
    event: &'a calendar_event::Model,
    participants: &'a [export::ExportParticipant<'a>],
) -> export::ExportEvent<'a> {
    export::ExportEvent {
        id: &event.id,
        external_id: event.external_id.as_deref(),
        title: &event.title,
        description: event.description.as_deref(),
        start: event.start,
        end: event.end,
        all_day: event.all_day,
        timezone: Some(&event.timezone),
        location: event.location.as_deref(),
        recurrence: event.recurrence.as_deref(),
        created_at: event.created_at,
        updated_at: event.updated_at,
        participants,
    }
}

/// Carries series' exceptions onto exported rows (`built[i]` is `rows[i]`): a detached row among them overrides its instance under the series UID, and any other exception of a series among them becomes EXDATE.
pub fn attach_exceptions(
    rows: &[&calendar_event::Model],
    built: &mut [build::Event],
    exceptions: &[recurrence_exception::Model],
) {
    let index: std::collections::HashMap<&str, usize> = rows
        .iter()
        .enumerate()
        .map(|(at, row)| (row.id.as_str(), at))
        .collect();
    for exception in exceptions {
        let Some(&series) = index.get(exception.parent_event_id.as_str()) else {
            continue;
        };
        let detached = exception
            .modified_event_id
            .as_deref()
            .and_then(|id| index.get(id).copied())
            .filter(|&at| rows[at].recurrence.is_none());
        match detached {
            Some(at) => {
                built[at].uid = built[series].uid.clone();
                built[at].recurrence_id = Some(exception.exception_date);
                built[at].recurrence_zone = built[series]
                    .recurrence
                    .as_ref()
                    .and_then(|rule| rule.timezone.clone());
            }
            None => built[series].excluded_dates.push(exception.exception_date),
        }
    }
}

/// `exportIcs`: a plaintext event (or one occurrence of a series) as an `.ics` file.
pub async fn export_ics(
    state: &AppState,
    user: &RouteUser,
    requested: &str,
) -> Result<(String, String), AppError> {
    let mut id = requested;
    let mut occurrence: Option<time::PrimitiveDateTime> = None;
    if let Some(captures) = EXPORT_INSTANCE_ID.captures(requested)
        && let (Some(series), Some(at)) = (captures.get(1), captures.get(2))
    {
        id = series.as_str();
        occurrence = instant::parse_js_date(at.as_str()).and_then(instant::from_unix_millis);
    }
    let event = queries::find(&state.db, &user.id, id)
        .await?
        .ok_or_else(not_found)?;
    if event.encryption_state == "encrypted" {
        return Err(AppError::validation(
            "Encrypted event details cannot be exported as ICS by the server.",
        ));
    }
    let relations = Relations::load(&state.db, &[&event], false).await?;
    let calendar = relations
        .calendars
        .get(&event.calendar_id)
        .ok_or_else(|| AppError::internal("event without its calendar"))?;
    let rows = relations.participants_of(&event.id);
    let export_participants: Vec<export::ExportParticipant<'_>> = rows
        .iter()
        .map(|(row, owner)| export::ExportParticipant {
            id: &row.id,
            email: &row.email,
            display_name: row.display_name.as_deref(),
            role: &row.role,
            status: &row.status,
            user_email: owner.as_ref().map(|u| u.email.as_str()),
            user_name: owner.as_ref().map(|u| u.name.as_str()),
        })
        .collect();
    let invalid_until = |_| AppError::internal("recurrence until is not a valid instant");
    let mut built = export::to_build_event(&export_event(&event, &export_participants))
        .map_err(invalid_until)?;
    if let Some(at) = occurrence {
        let duration = (instant::unix_millis(event.end) - instant::unix_millis(event.start)).max(
            if event.all_day {
                MS_PER_DAY
            } else {
                MS_PER_MINUTE
            },
        );
        let end = instant::from_unix_millis(instant::unix_millis(at) + duration)
            .ok_or_else(|| AppError::internal("occurrence end out of range"))?;
        built.uid = Some(format!(
            "{}-{}@solace-calendar.local",
            event
                .external_id
                .as_deref()
                .filter(|id| !id.is_empty())
                .unwrap_or(&event.id),
            instant::iso(at).0
        ));
        built.start = at;
        built.end = end;
        built.recurrence = None;
    }
    let mut events = vec![built];
    if occurrence.is_none() && event.recurrence.is_some() {
        // The series' exceptions travel along; a detached row the server cannot export is skipped like a deleted one.
        let exceptions = queries::exceptions(&state.db, vec![event.id.clone()]).await?;
        let detached_ids: Vec<String> = exceptions
            .iter()
            .filter_map(|exception| exception.modified_event_id.clone())
            .collect();
        let detached: Vec<calendar_event::Model> = if detached_ids.is_empty() {
            Vec::new()
        } else {
            queries::find_many(&state.db, &user.id, detached_ids)
                .await?
                .into_iter()
                .filter(|row| row.encryption_state != "encrypted")
                .collect()
        };
        let rows: Vec<&calendar_event::Model> = std::iter::once(&event).chain(&detached).collect();
        for row in &detached {
            events.push(export::to_build_event(&export_event(row, &[])).map_err(invalid_until)?);
        }
        attach_exceptions(&rows, &mut events, &exceptions);
    }
    let ics = build::build_calendar(
        &build::Calendar {
            name: Some(external_calendar_name(&calendar.name)),
            timezone: Some(instant::resolve_timezone(Some(&event.timezone))),
            ..Default::default()
        },
        &events,
    );
    let base = match occurrence {
        Some(at) => format!("{}-{}", event.title, &instant::iso(at).0[..10]),
        None => event.title.clone(),
    };
    Ok((ics, export::safe_filename(&base)))
}
