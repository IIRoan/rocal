//! `EventService.list`, `search` and `searchCorpus`: the calendar range with recurring instances, and the two search paths.

use sea_orm::ConnectionTrait;
use solace_api_types::events::{
    Event, EventList, EventParticipant, EventSearchCorpus, EventSearchCorpusQuery,
    EventSearchQuery, EventSearchResults, SearchEvent, SearchLabel,
};

use super::queries;
use super::recurrence::{self, Exception, ExceptionType};
use super::view::{self, Relations};
use crate::addresses::is_reserved_system_email;
use crate::auth::guard::RouteUser;
use crate::calendars::service::ensure_user_calendars;
use crate::db::entities::{calendar_event, event_participant, user};
use crate::error::AppError;
use crate::http::zod::js_trim;
use crate::instant;
use crate::state::AppState;

/// The rule an empty recurrence gets when the title says it repeats on weekdays.
const WEEKDAY_FALLBACK_RULE: &str = r#"{"frequency":"daily","interval":1,"byWeekDay":[1,2,3,4,5]}"#;

/// `shouldHideDeclinedInvitationEvent`: invitations the caller declined as an attendee stay out of lists.
pub fn declined_by(user_id: &str, participants: &[EventParticipant]) -> bool {
    participants
        .iter()
        .find(|p| p.user_id.as_ref().is_some_and(|id| id.0 == user_id) && p.role != "organizer")
        .is_some_and(|p| p.status == "declined")
}

fn instant_or(text: &str, message: &str) -> Result<time::PrimitiveDateTime, AppError> {
    instant::parse_js_date(text)
        .and_then(instant::from_unix_millis)
        .ok_or_else(|| AppError::validation(message))
}

/// The events overlapping `[start, end]`: single events, every series' instances, and detached occurrences, by start.
pub async fn list(
    state: &AppState,
    user: &RouteUser,
    start: &str,
    end: &str,
) -> Result<EventList, AppError> {
    ensure_user_calendars(state, &user.id).await;
    if start.is_empty() || end.is_empty() {
        return Err(AppError::validation(
            "Start and end date parameters are required",
        ));
    }
    let range_start = instant_or(
        start,
        "Invalid start date format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)",
    )?;
    let range_end = instant_or(
        end,
        "Invalid end date format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)",
    )?;
    if range_start >= range_end {
        return Err(AppError::validation("End date must be after start date"));
    }
    let db = &state.db;
    let (regular, recurring, modified, categories, calendars) = tokio::try_join!(
        queries::regular_in_range(db, &user.id, range_start, range_end),
        queries::recurring(db, &user.id),
        queries::modified_in_range(db, &user.id, range_start, range_end),
        crate::categories::queries::active(db, &user.id),
        crate::calendars::queries::owned_by(db, &user.id),
    )?;
    let all: Vec<&calendar_event::Model> =
        regular.iter().chain(&recurring).chain(&modified).collect();
    let relations = Relations::load(db, &all, true).await?;
    let mut events: Vec<(time::PrimitiveDateTime, Event)> = Vec::new();
    for model in &regular {
        events.push((model.start, view::with_participants(model, &relations)?));
    }
    for series in &recurring {
        for (start, event) in expand(series, &relations, range_start, range_end)? {
            events.push((start, event));
        }
    }
    for model in &modified {
        events.push((model.start, view::with_participants(model, &relations)?));
    }
    events.retain(|(_, event)| {
        !event
            .participants
            .as_deref()
            .is_some_and(|p| declined_by(&user.id, p))
    });
    events.sort_by_key(|(start, _)| *start);
    Ok(EventList {
        events: events.into_iter().map(|(_, event)| event).collect(),
        categories: categories.iter().map(view::category_dto).collect(),
        calendars: calendars.iter().map(view::calendar_dto).collect(),
    })
}

/// A series' rows for the range: the series itself when its first occurrence falls inside, and one row per later instance.
fn expand(
    series: &calendar_event::Model,
    relations: &Relations,
    range_start: time::PrimitiveDateTime,
    range_end: time::PrimitiveDateTime,
) -> Result<Vec<(time::PrimitiveDateTime, Event)>, AppError> {
    let mut base = view::with_participants(series, relations)?;
    base.recurrence_exceptions = Some(
        relations
            .exceptions
            .get(&series.id)
            .map(|rows| rows.iter().map(view::exception_dto).collect())
            .unwrap_or_default(),
    );
    let original = |base: &Event| {
        let mut event = base.clone();
        event.is_recurring_instance = Some(false);
        (series.start, event)
    };
    let mut rule = series.recurrence.clone().unwrap_or_else(|| "{}".into());
    let title = series.title.to_lowercase();
    if recurrence::parse_rule(&rule).is_none()
        && (title.contains("standup") || title.contains("daily"))
    {
        rule = WEEKDAY_FALLBACK_RULE.into();
    }
    let exceptions: Vec<Exception> = relations
        .exceptions
        .get(&series.id)
        .into_iter()
        .flatten()
        .map(|row| Exception {
            date_ms: instant::unix_millis(row.exception_date),
            kind: if row.r#type == "deleted" {
                ExceptionType::Deleted
            } else {
                ExceptionType::Modified
            },
        })
        .collect();
    let start_ms = instant::unix_millis(series.start);
    let duration_ms = instant::unix_millis(series.end) - start_ms;
    let instances = recurrence::generate_instances(
        start_ms,
        &rule,
        instant::unix_millis(range_start),
        instant::unix_millis(range_end),
        &exceptions,
    );
    let instances = match instances {
        Ok(instances) => instances,
        Err(error) => {
            tracing::error!(event_id = %series.id, error = %error, "Error generating instances for a recurring event");
            let in_range = series.start >= range_start && series.start <= range_end;
            return Ok(if in_range {
                vec![original(&base)]
            } else {
                Vec::new()
            });
        }
    };
    let mut rows = Vec::new();
    for instance in instances {
        if instance.is_original {
            if instance.date_ms >= instant::unix_millis(range_start)
                && instance.date_ms <= instant::unix_millis(range_end)
            {
                rows.push(original(&base));
            }
            continue;
        }
        let (Some(start), Some(end)) = (
            instant::from_unix_millis(instance.date_ms),
            instant::from_unix_millis(instance.date_ms + duration_ms),
        ) else {
            continue;
        };
        let mut event = base.clone();
        event.id = format!("{}_{}", series.id, instant::iso(start).0).into();
        event.start = instant::iso(start);
        event.end = instant::iso(end);
        event.parent_event_id = Some(series.id.clone().into());
        event.is_recurring_instance = Some(true);
        rows.push((start, event));
    }
    Ok(rows)
}

fn label(
    id: Option<String>,
    name: Option<String>,
    encrypted_name: Option<String>,
    key_version: Option<i32>,
    color: Option<String>,
) -> Option<SearchLabel> {
    Some(SearchLabel {
        id: id?,
        name: name.unwrap_or_default(),
        encrypted_name,
        encryption_key_version: key_version.unwrap_or(1),
        color: color.unwrap_or_default(),
    })
}

/// Plaintext full-text search with a title substring fallback, plus blind-index tokens for encrypted events.
pub async fn search(
    state: &AppState,
    user: &RouteUser,
    query: EventSearchQuery,
) -> Result<EventSearchResults, AppError> {
    let text = js_trim(&query.q).to_owned();
    let tokens: Vec<String> = query
        .blind_index_tokens
        .as_deref()
        .map(|tokens| {
            tokens
                .split(',')
                .map(|t| js_trim(t).to_owned())
                .filter(|t| !t.is_empty())
                .collect()
        })
        .unwrap_or_default();
    if (text.is_empty() || crate::http::zod::js_length(&text) < 2) && tokens.is_empty() {
        return Ok(EventSearchResults {
            events: Vec::new(),
            total: 0,
        });
    }
    let limit = query
        .limit
        .filter(|limit| *limit != 0)
        .unwrap_or(20)
        .clamp(1, 50);
    let offset = query.offset.unwrap_or(0).max(0);
    let mut dates = None;
    if let (Some(start), Some(end)) = (
        query.start_date.as_deref().filter(|s| !s.is_empty()),
        query.end_date.as_deref().filter(|s| !s.is_empty()),
    ) {
        let parse = |text: &str| instant::parse_js_date(text).and_then(instant::from_unix_millis);
        let (Some(start), Some(end)) = (parse(start), parse(end)) else {
            return Err(AppError::internal("search dates are not valid instants"));
        };
        dates = Some((start, end));
    }
    let (rows, total) =
        queries::search(&state.db, &user.id, &text, tokens, dates, limit, offset).await?;
    let ids: Vec<String> = rows.iter().map(|row| row.id.clone()).collect();
    let participants = participant_map(&state.db, &ids).await?;
    let mut events = Vec::new();
    for row in rows {
        let participants = participants.get(&row.id).cloned().unwrap_or_default();
        if declined_by(&user.id, &participants) {
            continue;
        }
        events.push(SearchEvent {
            id: row.id.into(),
            title: row.title,
            description: row.description,
            start: instant::iso(row.start),
            end: instant::iso(row.end),
            all_day: row.all_day,
            location: row.location,
            color: row.color,
            timezone: row.timezone,
            recurrence: row.recurrence,
            encrypted_content: row.encrypted_content,
            blind_index_tokens: row.blind_index_tokens,
            encryption_state: row.encryption_state,
            encryption_key_version: row.encryption_key_version,
            calendar_id: row.calendar_id.into(),
            category_id: row.category_id.map(Into::into),
            user_id: row.user_id.into(),
            calendar: label(
                row.calendar_label_id,
                row.calendar_label_name,
                row.calendar_label_encrypted_name,
                row.calendar_label_key_version,
                row.calendar_label_color,
            ),
            category: label(
                row.category_label_id,
                row.category_label_name,
                row.category_label_encrypted_name,
                row.category_label_key_version,
                row.category_label_color,
            ),
            created_at: instant::iso(row.created_at),
            updated_at: instant::iso(row.updated_at),
            participants,
        });
    }
    Ok(EventSearchResults { events, total })
}

/// `buildParticipantMap`: each event's participants, reserved system addresses left out, sorted.
async fn participant_map<C: ConnectionTrait>(
    db: &C,
    event_ids: &[String],
) -> Result<std::collections::HashMap<String, Vec<EventParticipant>>, sea_orm::DbErr> {
    let mut grouped: std::collections::HashMap<
        String,
        Vec<(event_participant::Model, Option<user::Model>)>,
    > = std::collections::HashMap::new();
    if event_ids.is_empty() {
        return Ok(std::collections::HashMap::new());
    }
    for (row, owner) in queries::participants_with_users(db, event_ids).await? {
        let email = if row.email.is_empty() {
            owner.as_ref().map(|u| u.email.clone())
        } else {
            Some(row.email.clone())
        };
        if email.is_some_and(|email| is_reserved_system_email(&email, None)) {
            continue;
        }
        grouped
            .entry(row.event_id.clone())
            .or_default()
            .push((row, owner));
    }
    Ok(grouped
        .into_iter()
        .map(|(event_id, rows)| (event_id, super::participants::map_and_sort(&rows)))
        .collect())
}

/// `searchCorpus`: the owner's events by `updatedAt`, in pages, for the on-device index.
pub async fn search_corpus(
    state: &AppState,
    user: &RouteUser,
    query: EventSearchCorpusQuery,
) -> Result<EventSearchCorpus, AppError> {
    let limit = query
        .limit
        .filter(|limit| *limit != 0)
        .unwrap_or(100)
        .clamp(1, 200);
    let offset = query.offset.unwrap_or(0).max(0);
    let updated_after = match query.updated_after.as_deref().filter(|s| !s.is_empty()) {
        Some(text) => Some(instant_or(
            text,
            "Invalid updatedAfter date format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)",
        )?),
        None => None,
    };
    let (rows, total) = queries::corpus_page(
        &state.db,
        &user.id,
        updated_after,
        u64::try_from(limit).unwrap_or(100),
        u64::try_from(offset).unwrap_or(0),
    )
    .await?;
    let relations = Relations::load(&state.db, &rows.iter().collect::<Vec<_>>(), false).await?;
    let events = rows
        .iter()
        .map(|row| view::with_participants(row, &relations))
        .collect::<Result<Vec<_>, _>>()?;
    let total = i64::try_from(total).unwrap_or(i64::MAX);
    let consumed = offset + i64::try_from(events.len()).unwrap_or(0);
    Ok(EventSearchCorpus {
        events,
        total,
        next_offset: (consumed < total).then_some(consumed),
    })
}
