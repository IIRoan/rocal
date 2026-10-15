//! The Stalwart webhook (`lib/stalwart-webhook*.ts`, `stalwart-webhook.service.ts`): HMAC-verified `message-ingest.ham` events become pushes for linked mailboxes.

mod routes;

pub use routes::routes;

use std::sync::LazyLock;
use std::time::Duration;

use axum::Json;
use axum::body::Body;
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use base64::Engine;
use hmac::{KeyInit, Mac};
use regex_lite::Regex;
use serde::Deserialize;
use serde_json::{Value, json};
use solace_api_types::mail::{StalwartWebhookError, StalwartWebhookResult};

use super::bridge::LENIENT_BASE64;
use super::sync::{self, IngestLookup, IngestedEmailRef};
use super::{push, queries};
use crate::db::entities::mail_directory_entry;
use crate::error::AppError;
use crate::http;
use crate::http::client_ip::client_ip;
use crate::http::extract::validate;
use crate::http::rate_limit::{self, Limit};
use crate::http::zod::{self, is_js_whitespace, js_number_string, js_trim};
use crate::request_schema;
use crate::state::AppState;
use crate::telemetry::{log_ref, redact_pii};

pub const MAX_BODY_BYTES: usize = 256 * 1024;
const SIGNED_LIMIT: Limit = Limit {
    requests: 120,
    window: Duration::from_secs(60),
};
const UNSIGNED_LIMIT: Limit = Limit {
    requests: 30,
    window: Duration::from_secs(60),
};
const MAIL_INGEST_EVENT: &str = "message-ingest.ham";
/// Must match `reminderMessageIDPrefix` in `apps/notifications/main.go`.
const REMINDER_MESSAGE_ID_PREFIX: &str = "solace-reminder.";

/// Why a post was refused.
#[derive(Debug, PartialEq, Eq)]
pub enum Refusal {
    Unconfigured,
    TooLarge,
    BadSignature,
    RateLimited(String),
    InvalidJson,
    InvalidPayload,
}

impl IntoResponse for Refusal {
    fn into_response(self) -> Response {
        let (status, error, message) = match self {
            Self::Unconfigured => (
                StatusCode::SERVICE_UNAVAILABLE,
                "Service unavailable",
                "Stalwart webhook is not configured.".to_owned(),
            ),
            Self::TooLarge => (
                StatusCode::PAYLOAD_TOO_LARGE,
                "Payload too large",
                "Webhook body exceeds the allowed size.".to_owned(),
            ),
            Self::BadSignature => (
                StatusCode::UNAUTHORIZED,
                "Unauthorized",
                "Invalid webhook signature.".to_owned(),
            ),
            Self::RateLimited(message) => {
                (StatusCode::TOO_MANY_REQUESTS, "Too many requests", message)
            }
            Self::InvalidJson => (
                StatusCode::BAD_REQUEST,
                "Bad request",
                "Webhook body must be valid JSON.".to_owned(),
            ),
            Self::InvalidPayload => (
                StatusCode::BAD_REQUEST,
                "Bad request",
                "Webhook payload is invalid.".to_owned(),
            ),
        };
        let body = StalwartWebhookError {
            error: error.into(),
            message,
        };
        (status, Json(body)).into_response()
    }
}

/// `stalwartWebhookPayloadSchema`.
#[derive(Debug, Deserialize)]
pub struct Payload {
    events: Vec<WebhookEvent>,
}

#[derive(Debug, Deserialize)]
struct WebhookEvent {
    #[serde(rename = "type")]
    kind: String,
    data: Option<Value>,
}

request_schema!(Payload => zod::object([(
    "events",
    zod::array(zod::object([
        ("id", zod::string().optional()),
        ("createdAt", zod::string().optional()),
        ("type", zod::string()),
        ("data", zod::any().optional()),
    ]))
    .default(json!([])),
)]));

/// `messageIngestDataSchema`; its passthrough keys are read from the raw data.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IngestData {
    account_id: String,
    document_id: Option<String>,
    from: Option<Addresses>,
    to: Option<Addresses>,
    subject: Option<String>,
    message_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum Addresses {
    One(String),
    Many(Vec<Address>),
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum Address {
    Plain(String),
    Mailbox { email: String },
}

/// Telemetry ids arrive as strings or numbers.
fn stalwart_id() -> zod::Schema {
    zod::union(vec![zod::string(), zod::number()])
        .transform(|value| {
            let text = match &value {
                Value::Number(number) => js_number_string(number.as_f64().unwrap_or_default()),
                other => other.as_str().unwrap_or_default().to_owned(),
            };
            Value::String(js_trim(&text).to_owned())
        })
        .refine(
            |value| value.as_str().is_some_and(|id| !id.is_empty()),
            "Expected a non-empty id",
            &[],
        )
}

fn mailbox() -> zod::Schema {
    zod::object([("email", zod::string()), ("name", zod::string().nullish())])
}

request_schema!(IngestData => zod::object([
    ("accountId", stalwart_id()),
    ("documentId", stalwart_id().optional()),
    ("from", zod::union(vec![zod::string(), zod::array(mailbox())]).optional()),
    (
        "to",
        zod::union(vec![zod::string(), zod::array(zod::string()), zod::array(mailbox())]).optional(),
    ),
    ("subject", zod::string().nullish()),
    ("messageId", zod::string().nullish()),
]));

/// `StalwartMailIngestEvent`; the subject is transient, used only to find the JMAP email.
#[derive(Debug, PartialEq, Eq)]
struct MailIngestEvent {
    account_id: String,
    document_id: String,
    recipient_emails: Vec<String>,
    message_id: Option<String>,
    subject: Option<String>,
    from_email: Option<String>,
}

/// Checks the post as the TypeScript route did, in its order: configuration, size, signature with its rate limits, then JSON and shape.
pub async fn receive(
    secret: Option<&str>,
    headers: &HeaderMap,
    body: Body,
) -> Result<Payload, Refusal> {
    let secret = secret.ok_or(Refusal::Unconfigured)?;
    let declared = headers
        .get(header::CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.trim().parse::<usize>().ok());
    if declared.is_some_and(|length| length > MAX_BODY_BYTES) {
        return Err(Refusal::TooLarge);
    }
    // Read to the platform limit like `request.text()`: answering mid-upload would break the sender's pipe instead of returning 413.
    let bytes = axum::body::to_bytes(body, http::BODY_LIMIT_BYTES)
        .await
        .map_err(|_| Refusal::TooLarge)?;
    // `request.text()`: invalid UTF-8 becomes U+FFFD and a leading BOM is dropped before signing and parsing.
    let decoded = String::from_utf8_lossy(&bytes);
    let text = decoded.strip_prefix('\u{feff}').unwrap_or(&decoded);
    if text.len() > MAX_BODY_BYTES {
        return Err(Refusal::TooLarge);
    }
    let signature = headers
        .get("x-signature")
        .and_then(|value| value.to_str().ok());
    if !signature_is_valid(text, signature, secret) {
        limit(
            "stalwart-webhook-unsigned",
            &client_ip(headers),
            UNSIGNED_LIMIT,
        )?;
        return Err(Refusal::BadSignature);
    }
    limit("stalwart-webhook-signed", "stalwart-ingest", SIGNED_LIMIT)?;
    let value: Value = serde_json::from_str(text).map_err(|_| Refusal::InvalidJson)?;
    validate(Some(&value)).map_err(|_| Refusal::InvalidPayload)
}

/// Like the other in-memory limits, a poisoned store lets the request through.
fn limit(store: &'static str, key: &str, limit: Limit) -> Result<(), Refusal> {
    match rate_limit::enforce(store, key, limit) {
        Err(AppError::RateLimited { message, .. }) => Err(Refusal::RateLimited(message)),
        _ => Ok(()),
    }
}

/// `verifyStalwartWebhookSignature`: a standard-alphabet base64 HMAC-SHA-256 of the body, compared in constant time.
fn signature_is_valid(body: &str, header: Option<&str>, secret: &str) -> bool {
    let Some(signature) = header.map(str::trim).filter(|value| !value.is_empty()) else {
        return false;
    };
    let digits = signature.trim_end_matches('=');
    if secret.is_empty()
        || digits.is_empty()
        || !digits
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'+' || byte == b'/')
    {
        return false;
    }
    let Ok(provided) = LENIENT_BASE64.decode(digits) else {
        return false;
    };
    let Ok(mut mac) = <hmac::Hmac<sha2::Sha256> as KeyInit>::new_from_slice(secret.as_bytes())
    else {
        return false;
    };
    mac.update(body.as_bytes());
    mac.verify_slice(&provided).is_ok()
}

/// `parseStalwartMailIngestEvents`: ham events with a document id; anything else is ignored.
fn ingest_events(payload: Payload) -> Vec<MailIngestEvent> {
    payload
        .events
        .into_iter()
        .filter(|event| event.kind == MAIL_INGEST_EVENT)
        .filter_map(|event| {
            let raw = event.data.unwrap_or_else(|| json!({}));
            let data: IngestData = validate(Some(&raw)).ok()?;
            let message_id = data
                .message_id
                .as_deref()
                .map(js_trim)
                .filter(|id| !id.is_empty())
                .or_else(|| {
                    ["message_id", "message-id", "Message-Id"]
                        .iter()
                        .filter_map(|key| raw.get(*key)?.as_str().map(js_trim))
                        .find(|id| !id.is_empty())
                })
                .map(str::to_owned);
            Some(MailIngestEvent {
                account_id: data.account_id,
                document_id: data.document_id?,
                recipient_emails: recipient_emails(data.to.as_ref()),
                message_id,
                subject: data.subject.as_deref().and_then(normalize_subject),
                from_email: from_email(data.from.as_ref()),
            })
        })
        .collect()
}

fn recipient_emails(to: Option<&Addresses>) -> Vec<String> {
    let lowered = |email: &str| Some(js_trim(email).to_lowercase()).filter(|e| !e.is_empty());
    match to {
        None => Vec::new(),
        Some(Addresses::One(email)) => lowered(email).into_iter().collect(),
        Some(Addresses::Many(entries)) => entries
            .iter()
            .filter_map(|entry| match entry {
                Address::Plain(email) | Address::Mailbox { email } => lowered(email),
            })
            .collect(),
    }
}

/// The first `<address>` in a header, else the whole value; it must contain `@`.
fn from_email(from: Option<&Addresses>) -> Option<String> {
    static ANGLE_ADDRESS: LazyLock<Option<Regex>> = LazyLock::new(|| Regex::new("<([^>]+)>").ok());
    let email = match from? {
        Addresses::One(header) => {
            let trimmed = js_trim(header);
            ANGLE_ADDRESS
                .as_ref()
                .and_then(|pattern| pattern.captures(trimmed)?.get(1))
                .map_or(trimmed, |found| found.as_str())
                .to_owned()
        }
        Addresses::Many(entries) => match entries.first()? {
            Address::Plain(email) | Address::Mailbox { email } => email.clone(),
        },
    };
    Some(js_trim(&email).to_lowercase()).filter(|email| email.contains('@'))
}

fn normalize_subject(subject: &str) -> Option<String> {
    let collapsed = js_trim(subject)
        .split(is_js_whitespace)
        .filter(|word| !word.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    Some(collapsed).filter(|subject| !subject.is_empty())
}

/// `isSolaceReminderMail`: both headers are sender-controlled, so the noreply From and a reminder Message-ID on the noreply domain are both required.
fn is_solace_reminder_mail<'a>(
    from_email: Option<&str>,
    message_ids: impl IntoIterator<Item = &'a str>,
    noreply_email: &str,
) -> bool {
    let noreply = js_trim(noreply_email).to_lowercase();
    let from = from_email.map(|from| js_trim(from).to_lowercase());
    if noreply.is_empty() || from.as_deref() != Some(noreply.as_str()) {
        return false;
    }
    let noreply_domain = noreply.rsplit('@').next().unwrap_or_default();
    message_ids.into_iter().any(|value| {
        let value = js_trim(value);
        let value = value.strip_prefix('<').unwrap_or(value);
        let value = value.strip_suffix('>').unwrap_or(value).to_lowercase();
        let mut parts = value.split('@');
        let local_part = parts.next().unwrap_or_default();
        let domain = parts.next();
        parts.next().is_none()
            && domain == Some(noreply_domain)
            && local_part.starts_with(REMINDER_MESSAGE_ID_PREFIX)
    })
}

/// `handlePayload`: `ignoredCount` is every event that was not a usable ham event.
#[tracing::instrument(skip_all)]
pub async fn handle_payload(
    state: &AppState,
    payload: Payload,
) -> Result<StalwartWebhookResult, AppError> {
    let total = payload.events.len();
    let events = ingest_events(payload);
    let mut enqueued = 0;
    for event in &events {
        if enqueue_event(state, event).await? {
            enqueued += 1;
        }
    }
    let ignored = total - events.len();
    if !events.is_empty() {
        tracing::info!(
            event_count = events.len(),
            enqueued_count = enqueued,
            ignored_count = ignored,
            "Processed Stalwart mail ingest webhook"
        );
    }
    let count = |n: usize| u32::try_from(n).unwrap_or(u32::MAX);
    Ok(StalwartWebhookResult {
        ok: true,
        processed_count: count(events.len()),
        enqueued_count: count(enqueued),
        ignored_count: count(ignored),
    })
}

/// The mailbox by its Stalwart account id, else by the first linked recipient, since telemetry ids may differ from the account id.
async fn linked_mailbox(
    state: &AppState,
    event: &MailIngestEvent,
) -> Result<Option<queries::LinkedMailbox>, AppError> {
    use mail_directory_entry::Column;
    if let Some(found) =
        queries::linked_mailbox(&state.db, Column::StalwartAccountId, &event.account_id).await?
    {
        return Ok(Some(found));
    }
    for email in &event.recipient_emails {
        if let Some(found) = queries::linked_mailbox(&state.db, Column::Email, email).await? {
            return Ok(Some(found));
        }
    }
    Ok(None)
}

/// `true` when the event was handed to the push outbox, which may still skip it as a duplicate or muted.
async fn enqueue_event(state: &AppState, event: &MailIngestEvent) -> Result<bool, AppError> {
    let Some(mailbox) = linked_mailbox(state, event).await? else {
        let recipient_refs: Vec<String> =
            event.recipient_emails.iter().map(|e| log_ref(e)).collect();
        tracing::info!(
            account_ref = log_ref(&event.account_id),
            document_ref = log_ref(&event.document_id),
            recipient_refs = ?recipient_refs,
            "Skipped Stalwart mail ingest webhook for unlinked account"
        );
        return Ok(false);
    };
    let noreply = &state.config.noreply_email;
    let skipped_reminder = || {
        tracing::info!(
            account_ref = log_ref(&mailbox.stalwart_account_id),
            document_ref = log_ref(&event.document_id),
            "Skipped mail push for Solace reminder mail"
        );
        Ok(false)
    };
    if is_solace_reminder_mail(
        event.from_email.as_deref(),
        event.message_id.as_deref(),
        noreply,
    ) {
        return skipped_reminder();
    }
    let lookup = IngestLookup {
        document_id: &event.document_id,
        subject: event.subject.as_deref(),
        message_id: event.message_id.as_deref(),
        from_email: event.from_email.as_deref(),
    };
    let resolved = sync::resolve_ingested_email(state, &mailbox.stalwart_account_id, &lookup).await;
    let Some(email_id) = push_email_id(
        &mailbox.stalwart_account_id,
        &event.document_id,
        resolved,
        noreply,
    ) else {
        return skipped_reminder();
    };
    push::enqueue(
        &state.db,
        &mailbox.stalwart_account_id,
        &mailbox.user_id,
        &[email_id],
    )
    .await?;
    Ok(true)
}

/// The JMAP id to push, or `None` for a stored reminder; a failed or empty lookup keeps the telemetry document id, and only an exact match can veto.
fn push_email_id(
    account_id: &str,
    document_id: &str,
    resolved: Result<Option<IngestedEmailRef>, AppError>,
    noreply_email: &str,
) -> Option<String> {
    match resolved {
        Ok(Some(found))
            if found.exact_match
                && is_solace_reminder_mail(
                    found.from_email.as_deref(),
                    found.message_ids.iter().map(String::as_str),
                    noreply_email,
                ) =>
        {
            None
        }
        Ok(Some(found)) => Some(found.id),
        Ok(None) => Some(document_id.to_owned()),
        Err(error) => {
            tracing::warn!(
                account_ref = log_ref(account_id),
                document_ref = log_ref(document_id),
                error = %redact_pii(&error.to_string()),
                "Failed to resolve JMAP email id for Stalwart ingest webhook"
            );
            Some(document_id.to_owned())
        }
    }
}

#[cfg(test)]
mod tests {
    use axum::http::HeaderValue;
    use base64::engine::general_purpose::STANDARD;
    use sea_orm::ConnectionTrait;

    use super::*;
    use crate::config::Config;
    use crate::db::scratch::ScratchDatabase;
    use crate::mail::push::tests::{USER, email_ids, seed_user};

    const NOREPLY: &str = "noreply@solace.onl";
    const SECRET: &str = "solace-test-webhook-secret";

    fn sign(body: &str) -> String {
        let mut mac =
            <hmac::Hmac<sha2::Sha256> as KeyInit>::new_from_slice(SECRET.as_bytes()).unwrap();
        mac.update(body.as_bytes());
        STANDARD.encode(mac.finalize().into_bytes())
    }

    fn payload(events: Value) -> Payload {
        validate(Some(&json!({ "events": events }))).unwrap()
    }

    fn ingest(data: Value) -> Value {
        json!({"type": MAIL_INGEST_EVENT, "data": data})
    }

    fn found(id: &str, from: &str, message_id: &str, exact_match: bool) -> IngestedEmailRef {
        IngestedEmailRef {
            id: id.into(),
            message_ids: vec![message_id.into()],
            from_email: Some(from.into()),
            exact_match,
        }
    }

    #[tokio::test]
    async fn unconfigured_secret_is_a_503() {
        let body = r#"{"events":[]}"#;
        let mut headers = HeaderMap::new();
        headers.insert("x-signature", HeaderValue::from_str(&sign(body)).unwrap());
        let refusal = receive(None, &headers, Body::from(body)).await.unwrap_err();
        let response = refusal.into_response();
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        assert_eq!(
            serde_json::from_slice::<Value>(&bytes).unwrap(),
            json!({"error": "Service unavailable", "message": "Stalwart webhook is not configured."})
        );
    }

    #[tokio::test]
    async fn bodies_are_signed_as_request_text_decodes_them() {
        let received = |raw: &'static [u8], signed: &str| {
            let mut headers = HeaderMap::new();
            headers.insert("x-signature", HeaderValue::from_str(&sign(signed)).unwrap());
            async move {
                receive(Some(SECRET), &headers, Body::from(raw))
                    .await
                    .map(drop)
            }
        };
        assert_eq!(
            received(b"\xef\xbb\xbf{}", "{}").await,
            Ok(()),
            "the BOM is dropped"
        );
        assert_eq!(
            received(b"{\"x\":\"\xff\"}", "{\"x\":\"\u{fffd}\"}").await,
            Ok(()),
            "invalid UTF-8 becomes U+FFFD"
        );
        assert_eq!(
            received(b"\xef\xbb\xbf{}", "\u{feff}{}").await,
            Err(Refusal::BadSignature)
        );
    }

    #[test]
    fn pushes_when_the_jmap_lookup_fails() {
        let failed = Err(AppError::internal("Stalwart unavailable"));
        assert_eq!(
            push_email_id("n", "1704", failed, NOREPLY).as_deref(),
            Some("1704")
        );
        assert_eq!(
            push_email_id("n", "1705", Ok(None), NOREPLY).as_deref(),
            Some("1705"),
            "nothing found"
        );
    }

    #[test]
    fn only_an_exact_lookup_match_vetoes_a_reminder_push() {
        let reminder = "<solace-reminder.x@solace.onl>";
        let exact = found("gc1", "noreply@solace.onl", reminder, true);
        assert_eq!(push_email_id("n", "1", Ok(Some(exact)), NOREPLY), None);
        let guessed = found("gc2", "noreply@solace.onl", reminder, false);
        assert_eq!(
            push_email_id("n", "1", Ok(Some(guessed)), NOREPLY).as_deref(),
            Some("gc2")
        );
        let spoofed = found("gc3", "mallory@evil.example", reminder, true);
        assert_eq!(
            push_email_id("n", "1", Ok(Some(spoofed)), NOREPLY).as_deref(),
            Some("gc3")
        );
        let foreign = found(
            "gc4",
            "noreply@solace.onl",
            "<solace-reminder.x@evil.example>",
            true,
        );
        assert_eq!(
            push_email_id("n", "1", Ok(Some(foreign)), NOREPLY).as_deref(),
            Some("gc4")
        );
    }

    #[test]
    fn reminder_mail_needs_the_noreply_sender_and_a_reminder_id_on_its_domain() {
        let is = |from: Option<&str>, id: &str| is_solace_reminder_mail(from, [id], NOREPLY);
        assert!(is(
            Some("noreply@solace.onl"),
            "solace-reminder.abc@solace.onl"
        ));
        assert!(is(
            Some(" NoReply@Solace.onl "),
            "<SOLACE-REMINDER.abc@solace.onl>"
        ));
        assert!(!is(Some("noreply@solace.onl"), "abc@solace.onl"));
        assert!(!is(
            Some("noreply@solace.onl"),
            "re.solace-reminder.abc@solace.onl"
        ));
        assert!(!is(
            Some("noreply@solace.onl"),
            "solace-reminder.abc@solace.onl@x"
        ));
        assert!(!is(
            Some("noreply@solace.onl"),
            "solace-reminder.abc@evil.example"
        ));
        assert!(!is(
            Some("mallory@evil.example"),
            "solace-reminder.abc@solace.onl"
        ));
        assert!(!is(None, "solace-reminder.abc@solace.onl"));
        assert!(!is_solace_reminder_mail(
            Some("noreply@solace.onl"),
            [],
            NOREPLY
        ));
    }

    #[test]
    fn ingest_events_parse_telemetry_ids_addresses_and_message_id_aliases() {
        let events = ingest_events(payload(json!([
            ingest(json!({"accountId": 13, "documentId": 1553, "to": ["Owner@Solace.onl", " "],
                          "subject": "  Quarterly \n numbers ", "from": "Roan <Roan@Example.com>"})),
            ingest(json!({"accountId": " n ", "documentId": "7", "to": [{"email": " A@B.c ", "name": null}],
                          "from": [{"email": "noreply@solace.onl"}], "message-id": " <x@solace.onl> "})),
            ingest(json!({"accountId": "n", "documentId": "8", "to": " c@d.e ", "from": "no address",
                          "messageId": "  ", "message_id": "y@solace.onl"})),
            ingest(json!({"accountId": "n", "subject": "no document id"})),
            ingest(json!({"accountId": "", "documentId": "9"})),
            ingest(json!({"accountId": "n", "documentId": "10", "from": 5})),
            {"type": "message-ingest.spam", "data": {"accountId": "n", "documentId": "11"}},
            {"type": MAIL_INGEST_EVENT},
        ])));
        assert_eq!(
            events,
            [
                MailIngestEvent {
                    account_id: "13".into(),
                    document_id: "1553".into(),
                    recipient_emails: vec!["owner@solace.onl".into()],
                    message_id: None,
                    subject: Some("Quarterly numbers".into()),
                    from_email: Some("roan@example.com".into()),
                },
                MailIngestEvent {
                    account_id: "n".into(),
                    document_id: "7".into(),
                    recipient_emails: vec!["a@b.c".into()],
                    message_id: Some("<x@solace.onl>".into()),
                    subject: None,
                    from_email: Some("noreply@solace.onl".into()),
                },
                MailIngestEvent {
                    account_id: "n".into(),
                    document_id: "8".into(),
                    recipient_emails: vec!["c@d.e".into()],
                    message_id: Some("y@solace.onl".into()),
                    subject: None,
                    from_email: None,
                },
            ]
        );
    }

    async fn linked_state(database: &ScratchDatabase) -> AppState {
        let config = Config::from_lookup(|name| match name {
            "DATABASE_URL" => Some(database.url.clone()),
            "BETTER_AUTH_SECRET" => Some("solace-test-auth-secret-0123456789abcdef".into()),
            "EMAIL_FROM" => Some(NOREPLY.into()),
            _ => None,
        })
        .unwrap();
        seed_user(&database.db).await;
        database
            .db
            .execute_unprepared(&format!(
                "INSERT INTO mail_directory_entry (id, user_id, email, local_part, domain, stalwart_account_id, \
                 stalwart_domain_id, public_key_armored, public_key_fingerprint, updated_at) \
                 VALUES ('dir-1', '{USER}', 'owner@solace.onl', 'owner', 'solace.onl', 'n', 'd', 'key', 'fp', now())"
            ))
            .await
            .unwrap();
        AppState::new(config, database.db.clone()).unwrap()
    }

    async fn post(state: &AppState, events: Value) -> StalwartWebhookResult {
        handle_payload(state, payload(events)).await.unwrap()
    }

    #[tokio::test]
    async fn linked_mailboxes_get_one_push_per_message_unless_muted_or_reminders() {
        let database = ScratchDatabase::create().await;
        let state = linked_state(&database).await;
        let result = post(
            &state,
            json!([
                ingest(json!({"accountId": "n", "documentId": "501", "from": "Sam <sam@example.com>"})),
                ingest(json!({"accountId": 13, "documentId": "502", "to": ["OWNER@solace.onl"]})),
                ingest(json!({"accountId": "unlinked", "documentId": "503", "to": "stranger@solace.onl"})),
                ingest(json!({"accountId": "n", "documentId": "504", "from": NOREPLY,
                              "messageId": "<solace-reminder.a@solace.onl>"})),
                ingest(json!({"accountId": "n", "documentId": 501})),
                {"type": "telemetry.alert"},
            ]),
        )
        .await;
        assert_eq!(
            result,
            StalwartWebhookResult {
                ok: true,
                processed_count: 5,
                enqueued_count: 3,
                ignored_count: 1
            }
        );
        assert_eq!(email_ids(&database.db).await, ["501", "502"]);
        let payload: Value = serde_json::from_str(
            &database
                .db
                .query_one_raw(sea_orm::Statement::from_string(
                    database.db.get_database_backend(),
                    "SELECT payload::text AS p FROM notification_job WHERE payload->>'emailId' = '502'",
                ))
                .await
                .unwrap()
                .unwrap()
                .try_get::<String>("", "p")
                .unwrap(),
        )
        .unwrap();
        assert_eq!(
            payload,
            json!({"kind": "new_mail", "inboundCount": 1, "emailId": "502", "accountId": "n"}),
            "the linked account id, and nothing about the sender"
        );

        database
            .db
            .execute_unprepared(&format!(
                "INSERT INTO user_settings (id, user_id, push_notifications, updated_at) VALUES ('s-1', '{USER}', false, now())"
            ))
            .await
            .unwrap();
        let muted = post(
            &state,
            json!([ingest(json!({"accountId": "n", "documentId": "505"}))]),
        )
        .await;
        assert_eq!(
            muted.enqueued_count, 1,
            "handed over, then skipped as muted"
        );
        assert_eq!(email_ids(&database.db).await, ["501", "502"]);
    }

    #[test]
    fn signatures_are_read_like_node_reads_base64() {
        let body = r#"{"events":[]}"#;
        let good = sign(body);
        let valid = |signature: &str| signature_is_valid(body, Some(signature), SECRET);
        assert!(valid(&good));
        assert!(valid(&format!("  {good} ")));
        assert!(valid(good.trim_end_matches('=')), "padding is optional");
        assert!(valid(&format!("{good}===")), "extra padding is ignored");
        assert!(!valid(&good[..good.len() - 4]));
        assert!(!valid(&format!("{good}AAAA")));
        assert!(!valid("not base64!"));
        assert!(!valid("===="));
        assert!(
            !valid(&format!("{}={}", &good[..8], &good[8..])),
            "padding only at the end"
        );
        assert!(
            !valid(&format!("-{}", &good[1..])),
            "only the standard alphabet"
        );
        assert!(!signature_is_valid(body, None, SECRET));
        assert!(!signature_is_valid(body, Some(&good), "another-secret"));
        assert!(!signature_is_valid("{}", Some(&good), SECRET));
    }
}
