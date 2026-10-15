//! `RecurringService` and `lib/recurring-series.ts`: one occurrence detaches, a split ends the old half a day early, and `all` edits the series row.

use std::collections::BTreeMap;

use sea_orm::Set;
use serde_json::{Value, json};
use solace_api_types::events::{Event, ParticipantInput};
use solace_api_types::recurring::{
    DeleteRecurringQuery, EditRecurringRequest, PreviewInstance, PreviewRecurrenceRequest,
    RecurrencePattern, RecurrencePatterns, RecurrencePreview, RecurrenceRule, RecurrenceRuleInput,
    RecurringDeleted, RecurringUpdates,
};
use time::PrimitiveDateTime;

use super::queries;
use super::rules;
use crate::auth::guard::RouteUser;
use crate::db::entities::{calendar_event, event_participant, user};
use crate::error::AppError;
use crate::events::recurrence::generate_instances;
use crate::events::view::{Relations, event_dto};
use crate::events::{participants, queries as events};
use crate::http::zod::js_trim;
use crate::instant;
use crate::integrations::ics::export::{ExportEvent, to_build_event};
use crate::invitations::request;
use crate::state::AppState;

const MS_PER_DAY: i64 = 86_400_000;
const DEFAULT_PREVIEW_DAYS: i32 = 90;
const NOT_FOUND: &str = "Recurring event not found or access denied";

/// `validate`: the parsed rule (echoed as JSON, unknown keys of rule text included), its errors and description.
pub fn validate(input: &RecurrenceRuleInput) -> Value {
    let Some(parsed) = rules::parse_input(input) else {
        return json!({"valid": false, "errors": ["Invalid recurrence rule format"], "description": null});
    };
    let errors = rules::validate_rule(&parsed.rule);
    let description = if errors.is_empty() {
        match rules::describe(&parsed) {
            Some(description) => Some(description),
            None => {
                return json!({"valid": false, "errors": ["Failed to parse recurrence rule"], "description": null});
            }
        }
    } else {
        None
    };
    json!({
        "valid": errors.is_empty(),
        "errors": errors,
        "description": description,
        "rule": parsed.json,
    })
}

fn preview_error() -> AppError {
    AppError::field("Failed to generate preview", "recurrenceRule")
}

/// `preview`: the occurrences from the start through `previewDays` later, without the semantic checks.
pub fn preview(request: &PreviewRecurrenceRequest) -> Result<RecurrencePreview, AppError> {
    let parsed = rules::parse_input(&request.recurrence_rule).ok_or_else(preview_error)?;
    let days = i64::from(request.preview_days.unwrap_or(DEFAULT_PREVIEW_DAYS));
    let instances = match instant::parse_js_date(&request.event_start) {
        Some(start) => generate_instances(
            start,
            &parsed.json.to_string(),
            start,
            start + days * MS_PER_DAY,
            &[],
        )
        .map_err(|_| preview_error())?,
        // An Invalid Date start matches no occurrence, but a zoned rule cannot read it at all.
        None if parsed.rule.timezone.is_some() => return Err(preview_error()),
        None => Vec::new(),
    };
    let description = rules::describe(&parsed).ok_or_else(preview_error)?;
    let instances = instances
        .into_iter()
        .map(|instance| {
            instant::from_unix_millis(instance.date_ms).map(|date| PreviewInstance {
                date: instant::iso(date),
                is_original: instance.is_original,
            })
        })
        .collect::<Option<Vec<_>>>()
        .ok_or_else(preview_error)?;
    Ok(RecurrencePreview {
        total_instances: instances.len() as i64,
        instances,
        description,
    })
}

/// `getCommonPatterns`.
pub fn patterns() -> RecurrencePatterns {
    let pattern = |frequency: &str,
                   interval: i32,
                   weekdays: Option<Vec<i32>>,
                   description: &str| RecurrencePattern {
        rule: RecurrenceRule {
            frequency: frequency.into(),
            interval,
            count: None,
            until: None,
            timezone: None,
            by_week_day: weekdays,
            by_month_day: None,
            by_month: None,
        },
        description: description.into(),
    };
    RecurrencePatterns {
        patterns: BTreeMap::from([
            ("daily".into(), pattern("daily", 1, None, "Daily")),
            ("weekly".into(), pattern("weekly", 1, None, "Weekly")),
            (
                "biweekly".into(),
                pattern("weekly", 2, None, "Every 2 weeks"),
            ),
            ("monthly".into(), pattern("monthly", 1, None, "Monthly")),
            ("yearly".into(), pattern("yearly", 1, None, "Yearly")),
            (
                "weekdays".into(),
                pattern("weekly", 1, Some(vec![1, 2, 3, 4, 5]), "Every weekday"),
            ),
        ]),
    }
}

/// A series with its participants, as `getRecurringEvent` loads it.
struct Series {
    row: calendar_event::Model,
    participants: Vec<(event_participant::Model, Option<user::Model>)>,
}

async fn series(state: &AppState, user_id: &str, id: &str) -> Result<Series, AppError> {
    let row = queries::series(&state.db, user_id, id)
        .await?
        .ok_or_else(|| AppError::validation(NOT_FOUND))?;
    let participants =
        events::participants_with_users(&state.db, std::slice::from_ref(&row.id)).await?;
    Ok(Series { row, participants })
}

/// `requireOccurrenceDate`; the instant is `None` for text `new Date` cannot read.
fn occurrence_date(
    value: Option<&str>,
    scope: &str,
    operation: &str,
) -> Result<Option<i64>, AppError> {
    match value.filter(|text| !text.is_empty()) {
        Some(text) => Ok(instant::parse_js_date(text)),
        None => Err(AppError::field(
            format!("Occurrence date is required for '{scope}' {operation}"),
            "occurrenceDate",
        )),
    }
}

/// A timestamp column write; Prisma refused an Invalid Date with a 500.
fn column(ms: Option<i64>) -> Result<PrimitiveDateTime, AppError> {
    ms.and_then(instant::from_unix_millis)
        .ok_or_else(|| AppError::internal("Invalid Date"))
}

fn js_date(text: Option<&str>) -> Option<Option<i64>> {
    text.filter(|text| !text.is_empty())
        .map(instant::parse_js_date)
}

/// Whole minutes in the `Int` column; Prisma truncated a fraction and refused anything wider.
fn reminder(minutes: f64) -> Result<i32, AppError> {
    let minutes = minutes.trunc();
    if minutes < f64::from(i32::MIN) || minutes > f64::from(i32::MAX) {
        return Err(AppError::internal("reminder out of range"));
    }
    Ok(minutes as i32)
}

/// An empty id clears the category, matching single-event updates.
fn clearable_category(id: &str) -> Option<String> {
    (!id.is_empty()).then(|| id.to_owned())
}

async fn assert_targets_owned(
    state: &AppState,
    user_id: &str,
    updates: &RecurringUpdates,
) -> Result<(), AppError> {
    if let Some(id) = updates.calendar_id.as_ref().filter(|id| !id.0.is_empty()) {
        let calendar = events::calendar(&state.db, user_id, &id.0)
            .await?
            .ok_or_else(|| {
                AppError::field(
                    "Invalid calendar or calendar does not belong to user",
                    "calendarId",
                )
            })?;
        if calendar.kind != "owned" || calendar.is_sync_only {
            return Err(AppError::field(
                "Cannot move events to a read-only calendar.",
                "calendarId",
            ));
        }
    }
    if let Some(id) = updates.category_id.as_deref().filter(|id| !id.is_empty())
        && events::active_category(&state.db, user_id, id)
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

/// `hasEncryptedPayloadValue(updates.encryptedContent)`.
fn new_ciphertext(updates: &RecurringUpdates) -> Option<&str> {
    updates
        .encrypted_content
        .as_deref()
        .filter(|text| !js_trim(text).is_empty())
}

/// `resolveRecurringContentData`: new ciphertext replaces the content; otherwise the series' own content (and ciphertext) is carried over.
fn apply_content(
    row: &mut calendar_event::ActiveModel,
    existing: &calendar_event::Model,
    updates: &RecurringUpdates,
) -> Result<(), AppError> {
    if let Some(ciphertext) = new_ciphertext(updates) {
        row.title = Set(String::new());
        row.description = Set(None);
        row.location = Set(None);
        row.encrypted_content = Set(Some(ciphertext.to_owned()));
        row.blind_index_tokens = Set(Some(
            serde_json::to_string(updates.blind_index_tokens.as_deref().unwrap_or_default())
                .map_err(AppError::internal)?,
        ));
        row.encryption_state = Set("encrypted".into());
        row.encryption_key_version = Set(updates.encryption_key_version.unwrap_or(1));
        return Ok(());
    }
    let edits_content =
        updates.title.is_some() || updates.description.is_some() || updates.location.is_some();
    if edits_content
        && existing
            .encrypted_content
            .as_deref()
            .is_some_and(|text| !text.is_empty())
    {
        return Err(AppError::field(
            "Encrypted content payload is required when updating protected event fields.",
            "encryptedContent",
        ));
    }
    row.title = Set(updates
        .title
        .clone()
        .unwrap_or_else(|| existing.title.clone()));
    row.description = Set(updates
        .description
        .clone()
        .or_else(|| existing.description.clone()));
    row.location = Set(updates
        .location
        .clone()
        .or_else(|| existing.location.clone()));
    row.encrypted_content = Set(existing.encrypted_content.clone());
    row.blind_index_tokens = Set(existing.blind_index_tokens.clone());
    row.encryption_state = Set(existing.encryption_state.clone());
    row.encryption_key_version = Set(existing.encryption_key_version);
    Ok(())
}

/// `buildRecurringEventCreateData`: a child of the series at `occurrence`, keeping the series' duration unless the edit sets an end.
fn child_row(
    existing: &calendar_event::Model,
    updates: &RecurringUpdates,
    parent_event_id: &str,
    recurrence: Option<String>,
    occurrence: Option<i64>,
) -> Result<calendar_event::ActiveModel, AppError> {
    let mut row = calendar_event::ActiveModel::default();
    apply_content(&mut row, existing, updates)?;
    let duration =
        (instant::unix_millis(existing.end) - instant::unix_millis(existing.start)).max(0);
    let start = js_date(updates.start.as_deref()).unwrap_or(occurrence);
    let end = js_date(updates.end.as_deref()).unwrap_or_else(|| start.map(|ms| ms + duration));
    row.all_day = Set(updates.all_day.unwrap_or(existing.all_day));
    row.timezone = Set(updates
        .timezone
        .clone()
        .unwrap_or_else(|| existing.timezone.clone()));
    row.color = Set(updates.color.clone().or_else(|| existing.color.clone()));
    row.reminder = Set(match updates.reminder {
        Some(minutes) => Some(reminder(minutes)?),
        None => existing.reminder,
    });
    row.recurrence = Set(recurrence);
    row.calendar_id = Set(updates
        .calendar_id
        .as_ref()
        .map_or_else(|| existing.calendar_id.clone(), |id| id.0.clone()));
    row.category_id = Set(match &updates.category_id {
        Some(id) => clearable_category(id),
        None => existing.category_id.clone(),
    });
    row.user_id = Set(existing.user_id.clone());
    row.parent_event_id = Set(Some(parent_event_id.to_owned()));
    row.start = Set(column(start)?);
    row.end = Set(column(end)?);
    Ok(row)
}

/// `buildRecurringEventUpdateData`: only the fields the edit sends; content only when it edits content.
fn series_update(
    existing: &calendar_event::Model,
    updates: &RecurringUpdates,
) -> Result<calendar_event::ActiveModel, AppError> {
    let mut row: calendar_event::ActiveModel = existing.clone().into();
    if let Some(all_day) = updates.all_day {
        row.all_day = Set(all_day);
    }
    if let Some(timezone) = &updates.timezone {
        row.timezone = Set(timezone.clone());
    }
    if let Some(color) = &updates.color {
        row.color = Set(Some(color.clone()));
    }
    if let Some(minutes) = updates.reminder {
        row.reminder = Set(Some(reminder(minutes)?));
    }
    if let Some(recurrence) = &updates.recurrence {
        row.recurrence = Set(Some(recurrence.clone()));
    }
    if let Some(calendar_id) = &updates.calendar_id {
        row.calendar_id = Set(calendar_id.0.clone());
    }
    if let Some(category_id) = &updates.category_id {
        row.category_id = Set(clearable_category(category_id));
    }
    let edits_content = new_ciphertext(updates).is_some()
        || updates.title.is_some()
        || updates.description.is_some()
        || updates.location.is_some();
    if edits_content {
        apply_content(&mut row, existing, updates)?;
    }
    if let Some(start) = js_date(updates.start.as_deref()) {
        row.start = Set(column(start)?);
    }
    if let Some(end) = js_date(updates.end.as_deref()) {
        row.end = Set(column(end)?);
    }
    Ok(row)
}

/// `editSeries`.
pub async fn edit(
    state: &AppState,
    user: &RouteUser,
    id: &str,
    request: &EditRecurringRequest,
) -> Result<Event, AppError> {
    let existing = series(state, &user.id, id).await?;
    let updates = &request.updates;
    assert_targets_owned(state, &user.id, updates).await?;
    let occurrence = request.occurrence_date.as_deref();
    match request.edit_scope.as_str() {
        "this_only" => {
            let date = occurrence_date(occurrence, "this_only", "edit")?;
            let row = child_row(&existing.row, updates, id, None, date)?;
            let detached = events::insert(&state.db, row).await?;
            queries::insert_exception(
                &state.db,
                id,
                column(date)?,
                "modified",
                Some(detached.id.clone()),
            )
            .await?;
            respond(state, user, detached, updates, Some(&existing)).await
        }
        "this_and_future" => {
            let date = occurrence_date(occurrence, "this_and_future", "edit")?;
            split(state, &existing.row, date).await?;
            let recurrence = updates
                .recurrence
                .clone()
                .or_else(|| existing.row.recurrence.clone());
            let row = child_row(&existing.row, updates, id, recurrence, date)?;
            let future = events::insert(&state.db, row).await?;
            respond(state, user, future, updates, Some(&existing)).await
        }
        _ => {
            let row = series_update(&existing.row, updates)?;
            let updated = events::update(&state.db, row).await?;
            respond(state, user, updated, updates, None).await
        }
    }
}

/// Ends the stored rule the day before the split, when it is readable.
async fn split(
    state: &AppState,
    series: &calendar_event::Model,
    date: Option<i64>,
) -> Result<(), AppError> {
    if let Some(rule) = rules::split_rule(series.recurrence.as_deref(), date) {
        let mut row: calendar_event::ActiveModel = series.clone().into();
        row.recurrence = Set(Some(rule));
        events::update(&state.db, row).await?;
    }
    Ok(())
}

/// The row with its calendar and category; with participants (and their invitations) when the edit sends some or a child inherits the series'.
async fn respond(
    state: &AppState,
    user: &RouteUser,
    row: calendar_event::Model,
    updates: &RecurringUpdates,
    source: Option<&Series>,
) -> Result<Event, AppError> {
    let relations = Relations::load(&state.db, &[&row], false).await?;
    let mut event = event_dto(&row, &relations)?;
    let inputs: Vec<ParticipantInput> = match (&updates.participants, source) {
        (Some(inputs), _) => inputs.clone(),
        (None, Some(source)) => source
            .participants
            .iter()
            .map(|(participant, user)| {
                let mapped = participants::dto(participant, user.as_ref());
                ParticipantInput {
                    email: mapped.email,
                    display_name: Some(mapped.display_name),
                    role: Some(mapped.role),
                    status: Some(mapped.status),
                }
            })
            .collect(),
        (None, None) => return Ok(event),
    };
    let content = request::resolve_content(
        row.encrypted_content
            .as_deref()
            .is_some_and(|text| !text.is_empty()),
        updates.invitation_content.as_ref(),
        &row.title,
        row.description.as_deref(),
        row.location.as_deref(),
    );
    let invitation = content
        .map(|content| {
            to_build_event(&ExportEvent {
                id: &row.id,
                external_id: row.external_id.as_deref(),
                title: &content.title,
                description: content.description.as_deref(),
                start: row.start,
                end: row.end,
                all_day: row.all_day,
                timezone: Some(&row.timezone),
                location: content.location.as_deref(),
                recurrence: row.recurrence.as_deref(),
                created_at: row.created_at,
                updated_at: row.updated_at,
                participants: &[],
            })
        })
        .transpose()
        .map_err(AppError::internal)?;
    let synced = participants::sync(&state.db, &row.id, &inputs, Some(&user.id)).await?;
    if let (Some(_), Some(invitation)) = (&updates.participants, &invitation) {
        let warnings =
            request::send_pending(state, &row.id, &synced, &event.calendar.name, invitation).await;
        if !warnings.is_empty() {
            event.warnings = Some(warnings);
        }
    }
    event.participants = Some(synced.participants);
    Ok(event)
}

/// `deleteSeries`.
pub async fn delete(
    state: &AppState,
    user: &RouteUser,
    id: &str,
    query: &DeleteRecurringQuery,
) -> Result<RecurringDeleted, AppError> {
    tracing::info!(event_id = id, delete_scope = %query.delete_scope, "Delete recurring event request");
    let existing = series(state, &user.id, id).await?;
    let occurrence = query.occurrence_date.as_deref();
    let (message, action) = match query.delete_scope.as_str() {
        "this_only" => {
            let date = column(occurrence_date(occurrence, "this_only", "delete")?)?;
            match queries::exception(&state.db, id, date).await? {
                Some(exception) if exception.r#type != "deleted" => {
                    queries::mark_exception_deleted(&state.db, exception).await?;
                }
                Some(_) => {}
                None => queries::insert_exception(&state.db, id, date, "deleted", None).await?,
            }
            (
                "Single occurrence deleted successfully",
                "delete_occurrence",
            )
        }
        "this_and_future" => {
            let date = occurrence_date(occurrence, "this_and_future", "delete")?;
            split(state, &existing.row, date).await?;
            ("Future occurrences deleted successfully", "delete_future")
        }
        _ => {
            queries::delete_series(&state.db, &user.id, id).await?;
            ("Entire recurring series deleted successfully", "delete_all")
        }
    };
    Ok(RecurringDeleted {
        success: true,
        message: message.into(),
        deleted_event_id: id.to_owned().into(),
        action: action.into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rule_text(text: &str) -> RecurrenceRuleInput {
        RecurrenceRuleInput::Json(text.into())
    }

    #[test]
    fn validation_reports_format_semantics_and_throws_separately() {
        assert_eq!(
            validate(&rule_text("nope")),
            json!({"valid": false, "errors": ["Invalid recurrence rule format"], "description": null})
        );
        assert_eq!(
            validate(&rule_text(
                r#"{"frequency":"daily","interval":1,"count":2,"until":"2099-01-01"}"#
            )),
            json!({
                "valid": false,
                "errors": ["Cannot specify both count and until date"],
                "description": null,
                "rule": {"frequency": "daily", "interval": 1, "count": 2, "until": "2099-01-01T00:00:00.000Z"},
            })
        );
        let rule = RecurrenceRule {
            frequency: "weekly".into(),
            interval: 1,
            count: None,
            until: Some("2099-12-01T00:00:00.000Z".into()),
            timezone: None,
            by_week_day: None,
            by_month_day: None,
            by_month: None,
        };
        assert_eq!(
            validate(&RecurrenceRuleInput::Rule(rule)),
            json!({"valid": false, "errors": ["Failed to parse recurrence rule"], "description": null})
        );
    }

    #[test]
    fn previews_expand_from_the_start_and_fail_with_one_message() {
        let request = |start: &str, rule: &str, days: Option<i32>| PreviewRecurrenceRequest {
            event_start: start.into(),
            event_end: start.into(),
            recurrence_rule: rule_text(rule),
            preview_days: days,
        };
        let daily = r#"{"frequency":"daily","interval":1}"#;
        let preview_of = |start: &str, rule: &str, days| preview(&request(start, rule, days));
        assert_eq!(
            preview_of("2099-03-02T09:00:00.000Z", daily, None)
                .unwrap()
                .total_instances,
            91
        );
        assert_eq!(
            preview_of("2099-03-02T09:00:00.000Z", daily, Some(7))
                .unwrap()
                .total_instances,
            8
        );
        let nowhere = preview_of("nope", daily, None).unwrap();
        assert_eq!(
            (nowhere.total_instances, nowhere.description.as_str()),
            (0, "Daily")
        );
        let zoned = r#"{"frequency":"daily","interval":1,"timezone":"Europe/Amsterdam"}"#;
        for (start, rule) in [("nope", zoned), ("2099-03-02T09:00:00.000Z", "{}")] {
            let error = preview_of(start, rule, None).unwrap_err();
            assert_eq!(
                error.to_string(),
                "Failed to generate preview",
                "{start} {rule}"
            );
        }
    }

    #[test]
    fn reminders_truncate_to_whole_minutes() {
        assert_eq!(reminder(1.5).unwrap(), 1);
        assert_eq!(reminder(-1.5).unwrap(), -1);
        assert!(reminder(1e10).is_err());
    }
}
