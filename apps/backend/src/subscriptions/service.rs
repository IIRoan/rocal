//! `SubscriptionService`: feeds fetched only through safe fetch, mirrored into read-only calendars, and ICS file imports.

use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};

use reqwest::header::{
    ACCEPT, ACCEPT_LANGUAGE, CACHE_CONTROL, ETAG, HeaderMap, HeaderValue, IF_MODIFIED_SINCE,
    IF_NONE_MATCH, LAST_MODIFIED, USER_AGENT,
};
use reqwest::{Method, StatusCode};
use sea_orm::{ConnectionTrait, Set, TransactionTrait};
use solace_api_types::Timestamp;
use solace_api_types::events::ParticipantInput;
use solace_api_types::subscriptions::{
    CalendarSubscription, CreateSubscriptionRequest, DeleteSubscriptionResponse,
    EncryptedIcsImportRequest, ImportIcsRequest, ImportIcsResponse, LegacyIcsImportRequest,
    SubscribedCalendar, SubscriptionSyncResult, SyncLogCount, UpdateSubscriptionRequest,
};

use super::holidays;
use super::queries::{self, FeedChanges, SyncOutcome};
use crate::auth::guard::RouteUser;
use crate::db::entities::{
    calendar, calendar_event, calendar_subscription, calendar_sync_log, event_participant,
};
use crate::error::AppError;
use crate::events::participants;
use crate::events::queries as events_queries;
use crate::http::zod::{js_length, js_trim};
use crate::instant;
use crate::integrations::ics::Participant;
use crate::integrations::ics::parse::{self, ParsedEvent, StoredEvent, StoredParticipant};
use crate::integrations::safe_fetch::{SafeFetchError, SafeRequest, SafeResponse};
use crate::recurring::queries as recurring;
use crate::state::AppState;
use crate::telemetry::redact_pii;

const FETCH_TIMEOUT: Duration = Duration::from_secs(10);
const MAX_REDIRECTS: usize = 5;
const MAX_RESPONSE_BYTES: usize = 15 * 1024 * 1024;
const BROWSER_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";
const DEFAULT_COLOR: &str = "#6366f1";
/// Holiday feeds change rarely, so they poll weekly.
const HOLIDAY_SYNC_INTERVAL_MINUTES: i32 = 10080;
const SYNC_INTERVAL_MINUTES: i32 = 15;
const NOT_FOUND: &str = "Subscription not found";
const CALENDAR_NOT_FOUND: &str = "Calendar not found or not owned by user";

fn fetch_error_message(error: SafeFetchError) -> String {
    match error {
        SafeFetchError::PrivateNetworkHost => {
            "URLs pointing to internal or private networks are not allowed".into()
        }
        SafeFetchError::UnsupportedScheme => {
            "Only HTTP, HTTPS and webcal URLs are supported".into()
        }
        SafeFetchError::InvalidUrl => "Calendar URL is invalid".into(),
        SafeFetchError::TooManyRedirects => "Too many redirects while fetching calendar URL".into(),
        SafeFetchError::RedirectWithoutLocation => {
            "Calendar server returned a redirect without a location".into()
        }
        SafeFetchError::Timeout => format!(
            "Calendar request timed out after {} seconds",
            FETCH_TIMEOUT.as_secs()
        ),
        SafeFetchError::ResponseTooLarge => format!(
            "Calendar is larger than {} MB",
            MAX_RESPONSE_BYTES / (1024 * 1024)
        ),
        SafeFetchError::RequestFailed => "Could not connect to the calendar server".into(),
    }
}

/// The browser-like request feeds get, conditional when the last full fetch left validators.
fn feed_request(etag: Option<&str>, last_modified: Option<&str>) -> SafeRequest {
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static(BROWSER_USER_AGENT));
    headers.insert(
        ACCEPT,
        HeaderValue::from_static("text/calendar,text/plain,*/*"),
    );
    headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("en-US,en;q=0.9"));
    headers.insert(CACHE_CONTROL, HeaderValue::from_static("no-cache"));
    for (name, value) in [(IF_NONE_MATCH, etag), (IF_MODIFIED_SINCE, last_modified)] {
        if let Some(value) = value
            .filter(|value| !value.is_empty())
            .and_then(|value| HeaderValue::from_str(value).ok())
        {
            headers.insert(name, value);
        }
    }
    SafeRequest {
        method: Method::GET,
        headers,
        timeout: FETCH_TIMEOUT,
        max_bytes: MAX_RESPONSE_BYTES,
        max_redirects: MAX_REDIRECTS,
    }
}

async fn fetch(
    state: &AppState,
    url: &str,
    request: &SafeRequest,
) -> Result<SafeResponse, AppError> {
    state
        .safe_fetch
        .fetch(url, request)
        .await
        .map_err(|error| AppError::field(fetch_error_message(error), "url"))
}

/// `Response.text()`: UTF-8 with replacement characters, without a byte-order mark.
fn text(body: &[u8]) -> String {
    String::from_utf8_lossy(body.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(body)).into_owned()
}

fn status_text(status: StatusCode) -> &'static str {
    status.canonical_reason().unwrap_or_default()
}

fn header(headers: &HeaderMap, name: reqwest::header::HeaderName) -> Option<String> {
    headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned)
}

fn calendar_dto(model: calendar::Model) -> SubscribedCalendar {
    SubscribedCalendar {
        id: model.id.into(),
        name: model.name,
        encrypted_name: model.encrypted_name,
        blind_index_tokens: model.blind_index_tokens,
        encryption_state: model.encryption_state,
        encryption_key_version: model.encryption_key_version,
        force_full_encryption: model.force_full_encryption,
        color: model.color,
        kind: model.kind,
        is_public: model.is_public,
        is_visible: model.is_visible,
        is_default: model.is_default,
        is_sync_only: model.is_sync_only,
        ics_share_token: model.ics_share_token,
        ics_share_enabled: model.ics_share_enabled,
        stalwart_account_id: model.stalwart_account_id,
        stalwart_calendar_id: model.stalwart_calendar_id,
        stalwart_synced_at: model.stalwart_synced_at.map(instant::iso),
        user_id: model.user_id.into(),
        created_at: instant::iso(model.created_at),
        updated_at: instant::iso(model.updated_at),
    }
}

fn dto(
    feed: calendar_subscription::Model,
    calendar: calendar::Model,
    sync_logs: Option<i64>,
) -> CalendarSubscription {
    CalendarSubscription {
        id: feed.id.into(),
        name: feed.name,
        url: feed.url,
        is_active: feed.is_active,
        sync_interval_minutes: feed.sync_interval_minutes,
        last_sync_at: feed.last_sync_at.map(instant::iso),
        last_sync_status: feed.last_sync_status,
        last_error_message: feed.last_error_message,
        etag: feed.etag,
        last_modified: feed.last_modified,
        user_id: feed.user_id.into(),
        calendar_id: feed.calendar_id.into(),
        created_at: instant::iso(feed.created_at),
        updated_at: instant::iso(feed.updated_at),
        calendar: calendar_dto(calendar),
        count: sync_logs.map(|sync_logs| SyncLogCount { sync_logs }),
    }
}

/// The caller's feeds, newest first, with their calendars and sync log counts.
pub async fn list(
    state: &AppState,
    user: &RouteUser,
) -> Result<Vec<CalendarSubscription>, AppError> {
    let feeds = queries::owned_with_calendars(&state.db, &user.id).await?;
    let ids = feeds.iter().map(|(feed, _)| feed.id.clone()).collect();
    let counts = queries::sync_log_counts(&state.db, ids).await?;
    Ok(feeds
        .into_iter()
        .filter_map(|(feed, calendar)| {
            let sync_logs = counts.get(&feed.id).copied().unwrap_or(0);
            Some(dto(feed, calendar?, Some(sync_logs)))
        })
        .collect())
}

/// Subscribes to a feed that answers, in a new read-only calendar, and syncs it in the background.
pub async fn create(
    state: &AppState,
    user: &RouteUser,
    request: CreateSubscriptionRequest,
) -> Result<CalendarSubscription, AppError> {
    let name = js_trim(&request.name);
    if name.is_empty() {
        return Err(AppError::field("Calendar name is required", "name"));
    }
    if queries::by_url(&state.db, &user.id, &request.url)
        .await?
        .is_some()
    {
        return Err(AppError::field(
            "You are already subscribed to this calendar URL",
            "url",
        ));
    }
    probe(state, &user.id, &request.url)
        .await
        .map_err(|error| {
            AppError::field(
                format!(
                    "Unable to fetch or parse calendar from URL: {}",
                    error.client_message()
                ),
                "url",
            )
        })?;
    let holiday = holidays::is_national_holiday_calendar(&request.url);
    let color = request.color.unwrap_or_else(|| {
        if holiday {
            holidays::DEFAULT_COLOR
        } else {
            DEFAULT_COLOR
        }
        .into()
    });
    let calendar =
        queries::insert_feed_calendar(&state.db, &user.id, name, &color, holiday).await?;
    let interval = if holiday {
        HOLIDAY_SYNC_INTERVAL_MINUTES
    } else {
        SYNC_INTERVAL_MINUTES
    };
    let feed = queries::insert_feed(
        &state.db,
        &user.id,
        name,
        &request.url,
        &calendar.id,
        interval,
    )
    .await?;
    let (background, initial) = (state.clone(), feed.clone());
    tokio::spawn(async move {
        if let Err(error) = sync_feed(&background, &initial).await {
            tracing::error!(
                subscription_id = %initial.id,
                message = redact_pii(&error.to_string()),
                "Initial sync failed for subscription"
            );
        }
    });
    Ok(dto(feed, calendar, None))
}

/// Fetches and parses the feed once, so a subscription is only created for one that answers.
async fn probe(state: &AppState, user_id: &str, url: &str) -> Result<(), AppError> {
    let response = fetch(state, url, &feed_request(None, None)).await?;
    let status = response.status;
    if !status.is_success() {
        let code = status.as_u16();
        return Err(match code {
            500.. => AppError::field(
                format!(
                    "The calendar server is currently unavailable ({code}). Please try again later or contact the calendar provider."
                ),
                "url",
            ),
            404 => AppError::NotFound(
                "Calendar not found at the provided URL. Please check the URL and try again."
                    .into(),
            ),
            401 | 403 => AppError::field(
                "Access denied to the calendar. The calendar may be private or require authentication.",
                "url",
            ),
            _ => AppError::field(
                format!("Failed to fetch calendar: {code} {}", status_text(status)),
                "url",
            ),
        });
    }
    let content = text(&response.body);
    drop(response);
    let timezone = queries::user_timezone(&state.db, user_id).await?;
    let warnings = parse::parse(&content, &timezone).errors.len();
    if warnings > 0 {
        tracing::warn!(warning_count = warnings, "ICS parsing warnings");
    }
    Ok(())
}

/// Renames, recolors, pauses or re-times a feed; name and color also change its calendar.
pub async fn update(
    state: &AppState,
    user: &RouteUser,
    id: &str,
    request: UpdateSubscriptionRequest,
) -> Result<CalendarSubscription, AppError> {
    let Some((feed, Some(calendar))) =
        queries::owned_with_calendar(&state.db, id, &user.id).await?
    else {
        return Err(AppError::NotFound(NOT_FOUND.into()));
    };
    let name = request.name.as_deref().map(js_trim);
    if let Some(name) = name {
        if name.is_empty() {
            return Err(AppError::field("Calendar name is required", "name"));
        }
        if js_length(name) > 100 {
            return Err(AppError::field(
                "Calendar name cannot exceed 100 characters",
                "name",
            ));
        }
    }
    let changes = FeedChanges {
        name,
        color: request.color.as_deref(),
        is_active: request.is_active,
        sync_interval_minutes: request.sync_interval_minutes,
    };
    let (feed, calendar) = queries::update_feed(&state.db, feed, calendar, changes).await?;
    Ok(dto(feed, calendar, None))
}

/// Deletes a feed; with `delete_events` its events and calendar go too, otherwise both become ordinary.
pub async fn delete(
    state: &AppState,
    user: &RouteUser,
    id: &str,
    delete_events: bool,
) -> Result<DeleteSubscriptionResponse, AppError> {
    let Some(feed) = queries::owned(&state.db, id, &user.id).await? else {
        return Err(AppError::NotFound(NOT_FOUND.into()));
    };
    if delete_events {
        queries::delete_feed_events(&state.db, &feed.id).await?;
        queries::delete_feed(&state.db, &feed.id).await?;
        queries::delete_sync_only_calendar(&state.db, &feed.calendar_id, &user.id).await?;
    } else {
        queries::detach_feed_events(&state.db, &feed.id).await?;
        queries::release_calendar(&state.db, &feed.calendar_id, &user.id).await?;
        queries::delete_feed(&state.db, &feed.id).await?;
    }
    Ok(DeleteSubscriptionResponse { success: true })
}

/// Syncs one of the caller's feeds now, paused or not.
pub async fn sync(
    state: &AppState,
    user: &RouteUser,
    id: &str,
) -> Result<SubscriptionSyncResult, AppError> {
    let Some(feed) = queries::owned(&state.db, id, &user.id).await? else {
        return Err(AppError::NotFound(NOT_FOUND.into()));
    };
    sync_feed(state, &feed).await
}

fn elapsed_ms(started: Instant) -> i32 {
    i32::try_from(started.elapsed().as_millis()).unwrap_or(i32::MAX)
}

/// `syncCalendarSubscription`: mirrors the feed into its calendar; every attempt leaves a sync log and stamps the feed, and a failure is also returned.
pub async fn sync_feed(
    state: &AppState,
    feed: &calendar_subscription::Model,
) -> Result<SubscriptionSyncResult, AppError> {
    let log = queries::start_sync_log(&state.db, &feed.id).await?;
    let started = Instant::now();
    match mirror(state, feed, log.clone(), started).await {
        Ok(result) => Ok(result),
        Err(error) => {
            let message = error.client_message();
            let outcome = SyncOutcome {
                error_message: Some(message.clone()),
                added: 0,
                updated: 0,
                deleted: 0,
                duration_ms: elapsed_ms(started),
                http_status: None,
            };
            queries::finish_sync_log(&state.db, log, outcome).await?;
            queries::record_sync(&state.db, &feed.id, Some(message), None).await?;
            Err(error)
        }
    }
}

async fn mirror(
    state: &AppState,
    feed: &calendar_subscription::Model,
    log: calendar_sync_log::Model,
    started: Instant,
) -> Result<SubscriptionSyncResult, AppError> {
    let request = feed_request(feed.etag.as_deref(), feed.last_modified.as_deref());
    let response = fetch(state, &feed.url, &request).await?;
    let status = response.status;
    if status == StatusCode::NOT_MODIFIED {
        let outcome = SyncOutcome {
            error_message: None,
            added: 0,
            updated: 0,
            deleted: 0,
            duration_ms: elapsed_ms(started),
            http_status: Some(304),
        };
        queries::finish_sync_log(&state.db, log, outcome).await?;
        queries::record_sync(&state.db, &feed.id, None, None).await?;
        return Ok(SubscriptionSyncResult {
            status: "success".into(),
            message: Some("Calendar not modified, no sync needed".into()),
            events_added: None,
            events_updated: None,
            events_deleted: None,
            errors: None,
        });
    }
    if !status.is_success() {
        return Err(AppError::field(
            format!("HTTP {}: {}", status.as_u16(), status_text(status)),
            "url",
        ));
    }
    let validators = (
        header(&response.headers, ETAG),
        header(&response.headers, LAST_MODIFIED),
    );
    let content = text(&response.body);
    drop(response);
    let timezone = queries::user_timezone(&state.db, &feed.user_id).await?;
    let parsed = parse::parse(&content, &timezone);
    drop(content);
    let counts = reconcile(&state.db, feed, &parsed.events).await?;
    queries::record_sync(&state.db, &feed.id, None, Some(validators)).await?;
    let outcome = SyncOutcome {
        error_message: None,
        added: counts.added,
        updated: counts.updated,
        deleted: counts.deleted,
        duration_ms: elapsed_ms(started),
        http_status: Some(i32::from(status.as_u16())),
    };
    queries::finish_sync_log(&state.db, log, outcome).await?;
    Ok(SubscriptionSyncResult {
        status: "success".into(),
        message: None,
        events_added: Some(i64::from(counts.added)),
        events_updated: Some(i64::from(counts.updated)),
        events_deleted: Some(i64::from(counts.deleted)),
        errors: (!parsed.errors.is_empty()).then_some(parsed.errors),
    })
}

#[derive(Default)]
struct Counts {
    added: i32,
    updated: i32,
    deleted: i32,
}

/// A parsed file's people as the participant sync takes them.
pub(crate) fn participant_inputs(participants: Option<&[Participant]>) -> Vec<ParticipantInput> {
    participants
        .unwrap_or_default()
        .iter()
        .map(|participant| ParticipantInput {
            email: participant.email.clone(),
            display_name: participant.display_name.clone(),
            role: participant.role.map(|role| role.as_str().into()),
            status: participant.status.map(|status| status.as_str().into()),
        })
        .collect()
}

pub(crate) fn stored_participants(rows: &[event_participant::Model]) -> Vec<StoredParticipant<'_>> {
    rows.iter()
        .map(|row| StoredParticipant {
            email: &row.email,
            display_name: row.display_name.as_deref(),
            role: &row.role,
            status: &row.status,
        })
        .collect()
}

pub(crate) fn stored(event: &calendar_event::Model) -> StoredEvent<'_> {
    StoredEvent {
        title: &event.title,
        description: event.description.as_deref(),
        start: event.start,
        end: event.end,
        all_day: event.all_day,
        location: event.location.as_deref(),
        recurrence: event.recurrence.as_deref(),
        timezone: &event.timezone,
    }
}

/// Creates new feed events, updates changed ones and deletes those the feed dropped; a UID-less stored event keys on `""`.
async fn reconcile<C: ConnectionTrait>(
    db: &C,
    feed: &calendar_subscription::Model,
    events: &[ParsedEvent],
) -> Result<Counts, AppError> {
    let current = queries::feed_events(db, &feed.id).await?;
    let ids = current.iter().map(|event| event.id.clone()).collect();
    let people = events_queries::participants_by_event(db, ids).await?;
    let by_uid = rows_by_uid(current);
    let incoming: HashSet<&str> = events.iter().map(|event| event.uid.as_str()).collect();
    let mut counts = Counts::default();
    for parsed in events {
        let Some(existing) = by_uid.get(&parsed.uid) else {
            let row = parse::to_new_event(parsed, &feed.user_id, &feed.calendar_id, Some(&feed.id));
            let created = queries::insert_event(db, row).await?;
            let inputs = participant_inputs(parsed.participants.as_deref());
            participants::sync(db, &created.id, &inputs, None).await?;
            counts.added += 1;
            continue;
        };
        let changed = parse::is_modified(&stored(existing), parsed);
        let rows = stored_participants(people.get(&existing.id).map_or(&[], Vec::as_slice));
        let people_changed = parse::participants_differ(&rows, parsed.participants.as_deref());
        if changed {
            queries::update_feed_event(db, existing.clone(), parsed).await?;
        }
        if people_changed {
            let inputs = participant_inputs(parsed.participants.as_deref());
            participants::sync(db, &existing.id, &inputs, None).await?;
        }
        if changed || people_changed {
            counts.updated += 1;
        }
    }
    for (uid, event) in &by_uid {
        if !incoming.contains(uid.as_str()) {
            queries::delete_event(db, &event.id).await?;
            counts.deleted += 1;
        }
    }
    link_series(
        db,
        &rows_by_uid(queries::feed_events(db, &feed.id).await?),
        events,
    )
    .await?;
    Ok(counts)
}

/// Rows of `events` (and their series) by UID, as `link_series` takes them.
pub(crate) fn rows_by_uid(
    rows: Vec<calendar_event::Model>,
) -> HashMap<String, calendar_event::Model> {
    rows.into_iter()
        .map(|row| (row.external_id.clone().unwrap_or_default(), row))
        .collect()
}

/// Overrides among `rows` hang under their series, and a series' EXDATEs and overrides become its exceptions, so the list shows each occurrence once. A file without the series' master only adds its overrides.
pub(crate) async fn link_series<C: ConnectionTrait>(
    db: &C,
    rows: &HashMap<String, calendar_event::Model>,
    events: &[ParsedEvent],
) -> Result<(), AppError> {
    let series_of = |uid: &str| rows.get(uid).filter(|row| row.recurrence.is_some());
    let masters: HashMap<&str, &ParsedEvent> = events
        .iter()
        .filter(|parsed| parsed.recurrence.is_some())
        .filter_map(|parsed| series_of(&parsed.uid).map(|row| (row.id.as_str(), parsed)))
        .collect();
    let mut overrides: HashMap<&str, Vec<(time::PrimitiveDateTime, String)>> = HashMap::new();
    for parsed in events {
        let (Some(at), Some(row)) = (parsed.occurrence, rows.get(&parsed.uid)) else {
            continue;
        };
        let series = series_of(&parsed.source_uid);
        let parent = series.map(|series| series.id.clone());
        if row.parent_event_id != parent {
            queries::set_parent(db, row.clone(), parent).await?;
        }
        if let Some(series) = series {
            overrides
                .entry(series.id.as_str())
                .or_default()
                .push((at, row.id.clone()));
        }
    }
    let series: Vec<&calendar_event::Model> = rows
        .values()
        .filter(|row| row.recurrence.is_some())
        .collect();
    if series.is_empty() {
        return Ok(());
    }
    let mut stored: HashMap<String, queries::ExceptionSet> = HashMap::new();
    for exception in
        events_queries::exceptions(db, series.iter().map(|row| row.id.clone()).collect()).await?
    {
        stored.entry(exception.parent_event_id).or_default().push((
            exception.exception_date,
            exception.r#type,
            exception.modified_event_id,
        ));
    }
    for row in series {
        let have = stored.remove(&row.id).unwrap_or_default();
        // By date: an override of an excluded occurrence still shows, once.
        let mut dates: std::collections::BTreeMap<
            time::PrimitiveDateTime,
            (String, Option<String>),
        > = std::collections::BTreeMap::new();
        let master = masters.get(row.id.as_str());
        if let Some(master) = master {
            for at in &master.excluded_dates {
                dates.insert(*at, ("deleted".into(), None));
            }
        }
        // A master is authoritative for EXDATEs; overrides from earlier files stay while their rows do.
        for (at, kind, modified) in &have {
            if master.is_none() || modified.is_some() {
                dates.insert(*at, (kind.clone(), modified.clone()));
            }
        }
        for (at, id) in overrides.remove(row.id.as_str()).unwrap_or_default() {
            dates.insert(at, ("modified".into(), Some(id)));
        }
        let wanted: queries::ExceptionSet = dates
            .into_iter()
            .map(|(at, (kind, modified))| (at, kind, modified))
            .collect();
        if have != wanted {
            queries::replace_exceptions(db, &row.id, wanted).await?;
        }
    }
    Ok(())
}

/// Imports client-encrypted events, or a legacy plaintext ICS file from shipped clients.
pub async fn import_ics(
    state: &AppState,
    user: &RouteUser,
    request: ImportIcsRequest,
) -> Result<ImportIcsResponse, AppError> {
    match request {
        ImportIcsRequest::Encrypted(request) => import_encrypted(state, user, request).await,
        ImportIcsRequest::Legacy(request) => import_legacy(state, user, request).await,
    }
}

/// The caller's calendar an import writes into: it must be their own and not managed by a feed.
async fn import_target(
    state: &AppState,
    user: &RouteUser,
    calendar_id: &str,
) -> Result<calendar::Model, AppError> {
    let Some(calendar) = crate::calendars::queries::find(&state.db, &user.id, calendar_id).await?
    else {
        return Err(AppError::NotFound(CALENDAR_NOT_FOUND.into()));
    };
    if !crate::events::service::is_writable(&calendar) {
        return Err(AppError::field(
            "Cannot import events into a read-only calendar.",
            "calendarId",
        ));
    }
    Ok(calendar)
}

async fn import_legacy(
    state: &AppState,
    user: &RouteUser,
    request: LegacyIcsImportRequest,
) -> Result<ImportIcsResponse, AppError> {
    let calendar_id = request.calendar_id.0.as_str();
    import_target(state, user, calendar_id).await?;
    let timezone = queries::user_timezone(&state.db, &user.id).await?;
    let parsed = parse::parse(&request.ics_content, &timezone);
    if parsed.events.is_empty() {
        return Err(AppError::validation("No valid events found in ICS file"));
    }
    let uids = parsed
        .events
        .iter()
        .map(|event| event.uid.clone())
        .collect();
    let taken: HashSet<String> = queries::taken_external_ids(&state.db, calendar_id, uids)
        .await?
        .into_iter()
        .collect();
    let mut errors = parsed.errors.clone();
    let mut created = 0;
    let mut rows = Vec::new();
    for event in &parsed.events {
        // Messages never carry titles or UIDs: those are the file's content.
        if taken.contains(&event.uid) {
            errors.push("An event already exists in this calendar.".to_owned());
            continue;
        }
        let row = parse::to_new_event(event, &user.id, calendar_id, None);
        let imported: Result<calendar_event::Model, AppError> = async {
            let inserted = queries::insert_event(&state.db, row).await?;
            let inputs = participant_inputs(event.participants.as_deref());
            participants::sync(&state.db, &inserted.id, &inputs, None).await?;
            Ok(inserted)
        }
        .await;
        match imported {
            Ok(inserted) => {
                created += 1;
                rows.push(inserted);
            }
            Err(error) => errors.push(format!(
                "An event could not be created: {}",
                error.client_message()
            )),
        }
    }
    // Only rows this file created are linked, so a calendar's own exceptions are never rewritten.
    link_series(&state.db, &rows_by_uid(rows), &parsed.events).await?;
    Ok(ImportIcsResponse {
        success: true,
        events_created: created,
        events_total: parsed.events.len() as i64,
        file_name: Some(
            request
                .file_name
                .filter(|name| !name.is_empty())
                .unwrap_or_else(|| "unknown.ics".into()),
        ),
        calendar_name: parsed.calendar_name,
        errors: (!errors.is_empty()).then_some(errors),
    })
}

/// `new Date(iso)` of an instant the schema already checked.
fn stored_instant(value: &Timestamp) -> Result<time::PrimitiveDateTime, AppError> {
    instant::parse_js_date(&value.0)
        .and_then(instant::from_unix_millis)
        .ok_or_else(|| AppError::validation("Invalid datetime"))
}

/// Series import before their overrides, in one transaction; only ciphertext and keyed ids are stored.
async fn import_encrypted(
    state: &AppState,
    user: &RouteUser,
    request: EncryptedIcsImportRequest,
) -> Result<ImportIcsResponse, AppError> {
    let calendar_id = request.calendar_id.0.as_str();
    import_target(state, user, calendar_id).await?;
    let mut entries: Vec<_> = request.encrypted_events.iter().collect();
    entries.sort_by_key(|entry| entry.series_external_id.is_some());
    let transaction = state.db.begin().await?;
    let mut created = 0;
    let mut errors = Vec::new();
    for entry in entries {
        let existing = queries::imported_event(
            &transaction,
            &user.id,
            calendar_id,
            &entry.external_id,
            false,
        )
        .await?;
        if existing.is_some() {
            errors.push("An event already exists in this calendar.".to_owned());
            continue;
        }
        let parent = match entry.series_external_id.as_deref() {
            Some(series) => {
                let parent =
                    queries::imported_event(&transaction, &user.id, calendar_id, series, true)
                        .await?;
                if parent.is_none() {
                    errors.push("An occurrence could not be linked to its series.".to_owned());
                    continue;
                }
                parent
            }
            None => None,
        };
        let tokens = serde_json::to_string(entry.blind_index_tokens.as_deref().unwrap_or_default())
            .map_err(AppError::internal)?;
        let row = calendar_event::ActiveModel {
            user_id: Set(user.id.clone()),
            calendar_id: Set(calendar_id.to_owned()),
            external_id: Set(Some(entry.external_id.clone())),
            title: Set(String::new()),
            description: Set(None),
            location: Set(None),
            encrypted_content: Set(Some(entry.encrypted_content.clone())),
            encryption_state: Set("encrypted".into()),
            encryption_key_version: Set(entry.encryption_key_version.unwrap_or(1)),
            blind_index_tokens: Set(Some(tokens)),
            start: Set(stored_instant(&entry.start)?),
            end: Set(stored_instant(&entry.end)?),
            all_day: Set(entry.all_day),
            timezone: Set(entry.timezone.clone()),
            recurrence: Set(if parent.is_some() {
                None
            } else {
                entry.recurrence.clone()
            }),
            parent_event_id: Set(parent.as_ref().map(|parent| parent.id.clone())),
            ..Default::default()
        };
        let event = events_queries::insert(&transaction, row).await?;
        let people = entry.participants.as_deref().unwrap_or_default();
        participants::sync(&transaction, &event.id, people, None).await?;
        for date in entry.excluded_dates.iter().flatten() {
            let date = stored_instant(date)?;
            recurring::insert_exception(&transaction, &event.id, date, "deleted", None).await?;
        }
        if let (Some(parent), Some(date)) = (&parent, &entry.occurrence_date) {
            queries::upsert_modified_exception(
                &transaction,
                &parent.id,
                stored_instant(date)?,
                &event.id,
            )
            .await?;
        }
        created += 1;
    }
    transaction.commit().await?;
    Ok(ImportIcsResponse {
        success: true,
        events_created: created,
        events_total: request.encrypted_events.len() as i64,
        file_name: None,
        calendar_name: None,
        errors: (!errors.is_empty()).then_some(errors),
    })
}

#[cfg(test)]
pub(crate) mod tests {
    use axum::Router;
    use axum::http::header;
    use axum::response::IntoResponse;
    use axum::routing::get;
    use sea_orm::Statement;

    use super::*;
    use crate::config::Config;
    use crate::db::scratch::ScratchDatabase;
    use crate::integrations::safe_fetch::tests::{public_lookup, safe_fetch, serve};

    const FEED: &str = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:feed-1@example.com\r\nDTSTAMP:20261001T000000Z\r\nDTSTART:20261101T090000Z\r\nDTEND:20261101T100000Z\r\nSUMMARY:Planning\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";

    const SERIES_FEED: &str = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\n\
        BEGIN:VEVENT\r\nUID:weekly@example.com\r\nDTSTART:20991102T090000Z\r\nDTEND:20991102T100000Z\r\nSUMMARY:Weekly\r\nRRULE:FREQ=WEEKLY;COUNT=4\r\nEXDATE:20991109T090000Z\r\nEND:VEVENT\r\n\
        BEGIN:VEVENT\r\nUID:weekly@example.com\r\nRECURRENCE-ID:20991116T090000Z\r\nDTSTART:20991116T140000Z\r\nDTEND:20991116T150000Z\r\nSUMMARY:Moved\r\nEND:VEVENT\r\n\
        BEGIN:VEVENT\r\nUID:daily@example.com\r\nDTSTART;VALUE=DATE:20991102\r\nSUMMARY:Daily\r\nRRULE:FREQ=DAILY;COUNT=3\r\nEXDATE;VALUE=DATE:20991103\r\nEND:VEVENT\r\n\
        END:VCALENDAR\r\n";

    /// A scratch database with one user, and a feed server that safe fetch may reach.
    pub(crate) struct Fixture {
        pub state: AppState,
        pub user: RouteUser,
        pub origin: String,
        _database: ScratchDatabase,
    }

    async fn feed_server() -> String {
        let app = Router::new()
            .route(
                "/feed.ics",
                get(|| async { ([(header::ETAG, "\"v1\"")], FEED).into_response() }),
            )
            .route("/series.ics", get(|| async { SERIES_FEED.into_response() }))
            .route(
                "/missing.ics",
                get(|| async { StatusCode::NOT_FOUND.into_response() }),
            )
            .route(
                "/slow.ics",
                get(|| async {
                    tokio::time::sleep(FETCH_TIMEOUT + Duration::from_secs(1)).await;
                    FEED.into_response()
                }),
            )
            .route(
                "/private-redirect",
                get(|| async {
                    (
                        StatusCode::FOUND,
                        [(header::LOCATION, "http://10.0.0.1/feed.ics")],
                    )
                        .into_response()
                }),
            );
        format!("http://feeds.test:{}", serve(app).await)
    }

    pub(crate) async fn fixture() -> Fixture {
        let database = ScratchDatabase::create().await;
        let url = database.url.clone();
        let config = Config::from_lookup(|name| match name {
            "DATABASE_URL" => Some(url.clone()),
            "BETTER_AUTH_SECRET" => Some("solace-test-auth-secret-0123456789abcdef".into()),
            _ => None,
        })
        .unwrap();
        let mut state = AppState::new(config, database.db.clone()).unwrap();
        state.safe_fetch = safe_fetch(public_lookup());
        let user = RouteUser {
            id: "feed-test-user".into(),
            email: "feed-test@example.com".into(),
            name: "Feed Test".into(),
        };
        let fixture = Fixture {
            state,
            user,
            origin: feed_server().await,
            _database: database,
        };
        fixture
            .sql(
                "INSERT INTO \"user\" (id, name, email, email_verified, created_at, updated_at) \
                 VALUES ('feed-test-user', 'Feed Test', 'feed-test@example.com', true, now(), now())",
            )
            .await;
        fixture
    }

    impl Fixture {
        /// A feed of the test server at `path`, last synced `synced_minutes_ago` (never when `None`).
        pub(crate) async fn feed(
            &self,
            path: &str,
            synced_minutes_ago: Option<i64>,
            interval_minutes: i32,
        ) -> calendar_subscription::Model {
            let db = &self.state.db;
            let calendar =
                queries::insert_feed_calendar(db, &self.user.id, "Feed", DEFAULT_COLOR, false)
                    .await
                    .unwrap();
            // A feed URL is unique per user, so each feed gets its own query.
            let url = format!("{}{path}?feed={}", self.origin, crate::db::cuid());
            let feed = queries::insert_feed(
                db,
                &self.user.id,
                "Feed",
                &url,
                &calendar.id,
                interval_minutes,
            )
            .await
            .unwrap();
            if let Some(minutes) = synced_minutes_ago {
                self.sql(&format!(
                    "UPDATE calendar_subscription SET last_sync_at = now() - make_interval(mins => {minutes}) WHERE id = '{}'",
                    feed.id
                ))
                .await;
            }
            feed
        }

        pub(crate) async fn sql(&self, sql: &str) {
            self.state.db.execute_unprepared(sql).await.unwrap();
        }

        /// The `(status, error message)` of every sync log of a feed, oldest first.
        pub(crate) async fn logs(&self, subscription_id: &str) -> Vec<(String, Option<String>)> {
            let db = &self.state.db;
            let sql = format!(
                "SELECT status, error_message FROM calendar_sync_log WHERE subscription_id = '{subscription_id}' ORDER BY started_at"
            );
            db.query_all_raw(Statement::from_string(db.get_database_backend(), sql))
                .await
                .unwrap()
                .iter()
                .map(|row| {
                    (
                        row.try_get("", "status").unwrap(),
                        row.try_get("", "error_message").unwrap(),
                    )
                })
                .collect()
        }

        /// `(last_sync_status, last_error_message, etag)` of a feed.
        pub(crate) async fn feed_state(
            &self,
            id: &str,
        ) -> (String, Option<String>, Option<String>) {
            let db = &self.state.db;
            let sql = format!(
                "SELECT last_sync_status, last_error_message, etag FROM calendar_subscription WHERE id = '{id}'"
            );
            let row = db
                .query_one_raw(Statement::from_string(db.get_database_backend(), sql))
                .await
                .unwrap()
                .unwrap();
            (
                row.try_get("", "last_sync_status").unwrap(),
                row.try_get("", "last_error_message").unwrap(),
                row.try_get("", "etag").unwrap(),
            )
        }
    }

    #[tokio::test]
    async fn create_fetches_with_the_redirect_time_and_size_caps() {
        let request = feed_request(None, None);
        assert_eq!(
            (request.max_redirects, request.timeout, request.max_bytes),
            (5, Duration::from_secs(10), 15 * 1024 * 1024)
        );
        assert_eq!(request.headers[ACCEPT], "text/calendar,text/plain,*/*");
        assert!(request.headers.get(IF_NONE_MATCH).is_none());
        let conditional = feed_request(Some("\"v1\""), Some("Sun, 01 Nov 2026 09:00:00 GMT"));
        assert_eq!(conditional.headers[IF_NONE_MATCH], "\"v1\"");
        assert_eq!(
            conditional.headers[IF_MODIFIED_SINCE],
            "Sun, 01 Nov 2026 09:00:00 GMT"
        );

        let fixture = fixture().await;
        let request = CreateSubscriptionRequest {
            name: "Work".into(),
            url: format!("{}/private-redirect", fixture.origin),
            color: None,
        };
        let refused = create(&fixture.state, &fixture.user, request)
            .await
            .unwrap_err();
        assert_eq!(
            refused.client_message(),
            "Unable to fetch or parse calendar from URL: URLs pointing to internal or private networks are not allowed"
        );
        assert!(
            list(&fixture.state, &fixture.user)
                .await
                .unwrap()
                .is_empty()
        );
    }

    #[tokio::test]
    async fn sync_timeout_is_recorded_on_the_log_and_the_feed() {
        let fixture = fixture().await;
        let feed = fixture.feed("/slow.ics", None, 15).await;
        let message = "Calendar request timed out after 10 seconds";
        let error = sync_feed(&fixture.state, &feed).await.unwrap_err();
        assert_eq!(error.client_message(), message);
        assert_eq!(
            fixture.logs(&feed.id).await,
            [("error".to_owned(), Some(message.to_owned()))]
        );
        assert_eq!(
            fixture.feed_state(&feed.id).await,
            ("error".to_owned(), Some(message.to_owned()), None)
        );
    }

    #[tokio::test]
    async fn synced_series_skip_their_excluded_and_overridden_occurrences() {
        let fixture = fixture().await;
        let feed = fixture.feed("/series.ics", None, 15).await;
        let starts = || async {
            crate::events::listing::list(
                &fixture.state,
                &fixture.user,
                "2099-11-01T00:00:00.000Z",
                "2099-11-30T23:59:59.000Z",
            )
            .await
            .unwrap()
            .events
            .into_iter()
            .map(|event| (event.title, event.start.0))
            .collect::<Vec<_>>()
        };
        let exceptions = || async {
            let db = &fixture.state.db;
            db.query_all_raw(Statement::from_string(
                db.get_database_backend(),
                "SELECT id FROM recurrence_exception ORDER BY id".to_owned(),
            ))
            .await
            .unwrap()
            .iter()
            .map(|row| row.try_get::<String>("", "id").unwrap())
            .collect::<Vec<_>>()
        };
        sync_feed(&fixture.state, &feed).await.unwrap();
        let expected = [
            ("Daily", "2099-11-02T00:00:00.000Z"),
            ("Weekly", "2099-11-02T09:00:00.000Z"),
            ("Daily", "2099-11-04T00:00:00.000Z"),
            ("Moved", "2099-11-16T14:00:00.000Z"),
            ("Weekly", "2099-11-23T09:00:00.000Z"),
        ]
        .map(|(title, start)| (title.to_owned(), start.to_owned()));
        assert_eq!(starts().await, expected);
        let first = exceptions().await;
        assert_eq!(first.len(), 3, "two EXDATEs and one override");
        sync_feed(&fixture.state, &feed).await.unwrap();
        assert_eq!(starts().await, expected);
        assert_eq!(
            exceptions().await,
            first,
            "an unchanged feed rewrites nothing"
        );
    }

    #[tokio::test]
    async fn a_sync_mirrors_the_feed_and_keeps_its_validators() {
        let fixture = fixture().await;
        let feed = fixture.feed("/feed.ics", None, 15).await;
        let first = sync_feed(&fixture.state, &feed).await.unwrap();
        assert_eq!(
            (
                first.events_added,
                first.events_updated,
                first.events_deleted
            ),
            (Some(1), Some(0), Some(0))
        );
        assert_eq!(
            fixture.feed_state(&feed.id).await,
            ("success".to_owned(), None, Some("\"v1\"".to_owned()))
        );
        let again = sync_feed(&fixture.state, &feed).await.unwrap();
        assert_eq!(
            (
                again.events_added,
                again.events_updated,
                again.events_deleted
            ),
            (Some(0), Some(0), Some(0))
        );
    }
}
