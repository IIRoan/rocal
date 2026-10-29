//! Shared setup for the event modules: calendars, encrypted events, feed and staged plaintext rows and the noreply mail they send.

use std::time::Duration;

use serde_json::{Value, json};
use solace_api_tests::seed::{fake_envelope, fake_token};
use solace_api_types::calendars::{
    CalendarList, CreateCalendarRequest, SeedDefaultCalendarsRequest,
};
use solace_api_types::events::{CreateEventRequest, Event, EventList};
use sqlx::PgPool;

use crate::helpers::{TestApp, TestUser, hex, ok};

/// Far enough ahead that reminders stay schedulable whenever the suite runs.
pub const FUTURE_START: &str = "2099-03-02T09:00:00.000Z";
pub const FUTURE_END: &str = "2099-03-02T10:00:00.000Z";

pub fn to_json<T: serde::Serialize>(value: &T) -> Value {
    serde_json::to_value(value).expect("serialize request")
}

/// An encrypted create body, the only kind owned calendars accept.
pub fn encrypted_event(calendar_id: &str, start: &str, end: &str) -> CreateEventRequest {
    CreateEventRequest {
        start: start.into(),
        end: end.into(),
        calendar_id: calendar_id.to_owned().into(),
        all_day: None,
        color: None,
        category_id: None,
        timezone: None,
        reminder: None,
        recurrence: None,
        encrypted_content: fake_envelope(),
        blind_index_tokens: Some(vec![fake_token(), fake_token()]),
        encryption_key_version: Some(1),
        participants: None,
        invitation_content: None,
    }
}

pub async fn create_event(user: &mut TestUser, request: &CreateEventRequest) -> Event {
    ok(user
        .post("/api/events", to_json(request))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()))
}

pub async fn list_events(user: &mut TestUser, start: &str, end: &str) -> EventList {
    ok(user
        .get(&format!("/api/events?start={start}&end={end}"))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()))
}

/// The starting set a client seeds, told apart by color since the names are ciphertext; Personal is the default.
pub const DEFAULT_CALENDARS: [(&str, &str); 3] = [
    ("Personal", "#10b981"),
    ("Work", "#3b82f6"),
    ("Family", "#f43f5e"),
];

/// An owned calendar as clients create it: an encrypted name only.
pub fn encrypted_calendar(color: &str, is_default: bool) -> CreateCalendarRequest {
    CreateCalendarRequest {
        color: color.into(),
        is_default: Some(is_default),
        encrypted_name: fake_envelope(),
        blind_index_tokens: Some(vec![fake_token()]),
        encryption_key_version: Some(1),
    }
}

pub fn seed_defaults_request() -> SeedDefaultCalendarsRequest {
    SeedDefaultCalendarsRequest {
        calendars: DEFAULT_CALENDARS
            .iter()
            .enumerate()
            .map(|(index, (_, color))| encrypted_calendar(color, index == 0))
            .collect(),
    }
}

/// `POST /api/calendars/defaults`, which stores the set only while the user owns no calendar yet.
pub async fn seed_default_calendars(user: &mut TestUser) -> CalendarList {
    ok(user
        .post("/api/calendars/defaults", to_json(&seed_defaults_request()))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()))
}

/// The user's starting calendar by its old name, seeding the set first.
pub async fn calendar_id(user: &mut TestUser, name: &str) -> String {
    let color = DEFAULT_CALENDARS
        .iter()
        .find(|(label, _)| *label == name)
        .map(|(_, color)| *color)
        .unwrap_or_else(|| panic!("no default calendar {name}"));
    seed_default_calendars(user)
        .await
        .calendars
        .into_iter()
        .find(|calendar| calendar.color == color && calendar.kind == "owned")
        .map(|calendar| calendar.id.0)
        .unwrap_or_else(|| panic!("no calendar {name}"))
}

/// A calendar row inserted directly, for kinds the API never creates (subscribed, sync-only, shared); owned rows get an encrypted name.
pub async fn insert_calendar(app: &TestApp, user_id: &str, kind: &str, sync_only: bool) -> String {
    let id = format!("suitecal{}", hex(8));
    let encrypted_name = (kind == "owned").then(fake_envelope);
    sqlx::query(
        "INSERT INTO calendar (id, name, encrypted_name, encryption_state, color, kind, is_sync_only, user_id, created_at, updated_at) \
         VALUES ($1, CASE WHEN $5::text IS NULL THEN 'Feed' ELSE '' END, $5, CASE WHEN $5::text IS NULL THEN 'plaintext' ELSE 'encrypted' END, '#64748b', $2, $3, $4, now(), now())",
    )
    .bind(&id)
    .bind(kind)
    .bind(sync_only)
    .bind(user_id)
    .bind(encrypted_name)
    .execute(&app.db)
    .await
    .expect("insert calendar");
    id
}

/// A plaintext row, as only feed sync and staged invitation imports write one.
pub async fn insert_plaintext_event(
    app: &TestApp,
    user_id: &str,
    calendar_id: &str,
    title: &str,
    start: &str,
    end: &str,
) -> String {
    let id = format!("suiteevt{}", hex(8));
    sqlx::query(
        "INSERT INTO calendar_event (id, title, start, \"end\", timezone, user_id, calendar_id, created_at, updated_at) \
         VALUES ($1, $2, $3::timestamptz AT TIME ZONE 'UTC', $4::timestamptz AT TIME ZONE 'UTC', 'Europe/Amsterdam', $5, $6, now(), now())",
    )
    .bind(&id)
    .bind(title)
    .bind(start)
    .bind(end)
    .bind(user_id)
    .bind(calendar_id)
    .execute(&app.db)
    .await
    .expect("insert plaintext event");
    id
}

/// The hidden Invitations calendar, the one owned calendar whose staged copies stay plaintext.
pub async fn insert_staging_calendar(app: &TestApp, user_id: &str) -> String {
    crate::calendars::insert_calendar(&app.db, user_id, crate::calendars::STAGING).await
}

/// The content columns of a `calendar_event` row.
#[derive(Debug, PartialEq, sqlx::FromRow)]
pub struct StoredContent {
    pub title: String,
    pub description: Option<String>,
    pub location: Option<String>,
    pub encrypted_content: Option<String>,
    pub blind_index_tokens: Option<String>,
    pub encryption_state: String,
    pub encryption_key_version: i32,
}

pub async fn stored_content(db: &PgPool, event_id: &str) -> StoredContent {
    sqlx::query_as(
        "SELECT title, description, location, encrypted_content, blind_index_tokens, encryption_state, encryption_key_version \
         FROM calendar_event WHERE id = $1",
    )
    .bind(event_id)
    .fetch_one(db)
    .await
    .expect("event row")
}

/// Every column of a row as JSON, to prove a refused request changed nothing.
pub async fn row_snapshot(db: &PgPool, table: &str, id: &str) -> Option<Value> {
    sqlx::query_scalar(&format!("SELECT to_jsonb(t) FROM {table} t WHERE id = $1"))
        .bind(id)
        .fetch_optional(db)
        .await
        .expect("snapshot")
}

/// `now()` plus an offset, as JavaScript's `toISOString()` writes it.
pub async fn iso_from_now(db: &PgPool, seconds: i64) -> String {
    sqlx::query_scalar(
        "SELECT to_char((now() AT TIME ZONE 'UTC') + make_interval(secs => $1), 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')",
    )
    .bind(seconds as f64)
    .fetch_one(db)
    .await
    .expect("now")
}

/// One message the noreply identity sent, as the test Stalwart's catch-all sink received it.
#[derive(Debug)]
pub struct SentMail {
    pub subject: String,
    pub text: String,
    pub attachment_name: Option<String>,
    pub ics: Option<String>,
}

/// Mail the noreply identity sent to `to`, waiting until `expected` messages are indexed.
pub async fn sent_mail(app: &TestApp, to: &str, expected: usize) -> Vec<SentMail> {
    let mut found = Vec::new();
    for _ in 0..80 {
        found = query_sent_mail(app, to).await;
        if found.len() >= expected {
            break;
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    found
}

/// Proves nothing was mailed to `to`, after giving the index a moment.
pub async fn assert_no_mail(app: &TestApp, to: &str) {
    tokio::time::sleep(Duration::from_millis(750)).await;
    let mail = query_sent_mail(app, to).await;
    assert!(mail.is_empty(), "unexpected mail to {to}: {mail:?}");
}

async fn query_sent_mail(app: &TestApp, to: &str) -> Vec<SentMail> {
    let Some(sink) = app.stalwart_account_id("sink").await else {
        return Vec::new();
    };
    let response = app
        .stalwart_admin(
            &["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
            json!([
                ["Email/query", {"accountId": sink, "filter": {"to": to}, "sort": [{"property": "receivedAt", "isAscending": true}]}, "q"],
                ["Email/get", {"accountId": sink, "#ids": {"resultOf": "q", "name": "Email/query", "path": "/ids"},
                    "properties": ["subject", "attachments", "textBody", "bodyValues"], "fetchTextBodyValues": true}, "g"],
            ]),
        )
        .await;
    let list = response["methodResponses"][1][1]["list"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    let mut mail = Vec::new();
    for email in list {
        let text_part = email["textBody"][0]["partId"].as_str().unwrap_or_default();
        let attachment = email["attachments"].get(0);
        let ics = match attachment.and_then(|a| a["blobId"].as_str()) {
            Some(blob) => Some(download(app, &sink, blob).await),
            None => None,
        };
        mail.push(SentMail {
            subject: email["subject"].as_str().unwrap_or_default().to_owned(),
            text: email["bodyValues"][text_part]["value"]
                .as_str()
                .unwrap_or_default()
                .to_owned(),
            attachment_name: attachment.and_then(|a| a["name"].as_str().map(str::to_owned)),
            ics,
        });
    }
    mail
}

/// The raw blob, since JMAP body values normalize the CRLF line endings ICS requires.
async fn download(app: &TestApp, sink: &str, blob: &str) -> String {
    let base = app.env.stalwart_url.trim_end_matches('/');
    let mut request = reqwest::Client::new()
        .get(format!("{base}/jmap/download/{sink}/{blob}/invite.ics"))
        .basic_auth("admin", Some(&app.env.stalwart_admin_password));
    if let Some(key) = &app.env.stalwart_gate_key {
        request = request.header("X-Solace-Gate", key);
    }
    request
        .send()
        .await
        .expect("JMAP download")
        .text()
        .await
        .expect("JMAP download text")
}

/// Unfolds RFC 5545 continuation lines so assertions can match whole properties.
pub fn unfold(ics: &str) -> String {
    ics.replace("\r\n ", "")
}
