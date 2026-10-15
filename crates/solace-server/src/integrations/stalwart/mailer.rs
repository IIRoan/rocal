//! `stalwart-jmap-mailer.ts`: app mail sent as the noreply identity over JMAP (session, Drafts and identity, blob uploads, Email/set plus EmailSubmission/set).

use std::time::Duration;

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use reqwest::Client;
use serde::Deserialize;
use serde_json::{Map, Value, json};

use super::gate::StalwartGate;
use crate::email::Message;

const USING: [&str; 3] = [
    "urn:ietf:params:jmap:core",
    "urn:ietf:params:jmap:mail",
    "urn:ietf:params:jmap:submission",
];
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, Clone)]
pub struct MailerConfig {
    pub base_url: String,
    pub username: String,
    pub password: String,
    pub from: String,
    pub from_name: String,
}

#[derive(Debug, Clone)]
pub struct Attachment {
    pub filename: String,
    pub content: String,
    pub content_type: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum MailerError {
    #[error("Stalwart JMAP authentication failed")]
    Unauthorized,
    #[error("Stalwart JMAP session failed ({0})")]
    Session(u16),
    #[error("Stalwart JMAP session did not include a mail account")]
    NoAccount,
    #[error("Stalwart JMAP request failed ({0})")]
    Request(u16),
    #[error("Stalwart JMAP returned a non-JSON response")]
    NotJson,
    #[error("{0}")]
    Method(String),
    #[error("Stalwart mailbox has no Drafts folder")]
    NoDrafts,
    #[error("Stalwart identity was not found; create it on the sending mailbox")]
    NoIdentity,
    #[error("Stalwart blob upload failed ({0})")]
    Upload(u16),
    #[error("Stalwart did not queue the message for delivery")]
    NotQueued,
    #[error("Stalwart request failed")]
    Transport(#[from] reqwest::Error),
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Session {
    api_url: Option<String>,
    upload_url: Option<String>,
    #[serde(default)]
    primary_accounts: Map<String, Value>,
    #[serde(default)]
    accounts: Map<String, Value>,
}

struct Discovered {
    api_url: String,
    upload_url: String,
    mail_account: String,
    submission_account: String,
}

/// Sends `message` to `to`; returns the EmailSubmission id.
pub async fn send(
    http: &Client,
    gate: &StalwartGate,
    config: &MailerConfig,
    to: &str,
    message: &Message,
) -> Result<String, MailerError> {
    let client = Jmap {
        http,
        gate,
        authorization: basic(config),
    };
    let session = client.discover(&config.base_url).await?;
    let (context, uploads) = tokio::join!(
        client.send_context(&session, &config.from),
        upload_all(&client, &session, &message.attachments),
    );
    let (drafts, sent, identity) = context?;
    let attachments = uploads?;
    let calls = send_calls(
        &session,
        &drafts,
        sent.as_deref(),
        &identity,
        config,
        to,
        message,
        &attachments,
    );
    let envelope = client.call(&session.api_url, calls).await?;
    assert_success(&envelope, "Stalwart email send")?;
    method_result(&envelope, "EmailSubmission/set")?
        .pointer("/created/s1/id")
        .and_then(Value::as_str)
        .map(str::to_owned)
        .ok_or(MailerError::NotQueued)
}

fn basic(config: &MailerConfig) -> String {
    format!(
        "Basic {}",
        STANDARD.encode(format!("{}:{}", config.username, config.password))
    )
}

struct Jmap<'a> {
    http: &'a Client,
    gate: &'a StalwartGate,
    authorization: String,
}

impl Jmap<'_> {
    fn request(&self, method: reqwest::Method, url: &str) -> reqwest::RequestBuilder {
        let request = self
            .http
            .request(method, url)
            .header(reqwest::header::AUTHORIZATION, &self.authorization)
            .timeout(REQUEST_TIMEOUT);
        self.gate.apply(request, url)
    }

    /// `/jmap/session`, then `/.well-known/jmap`; 401 fails at once.
    async fn discover(&self, base_url: &str) -> Result<Discovered, MailerError> {
        let base = base_url.trim_end_matches('/');
        let mut last_status = 0;
        for url in [
            format!("{base}/jmap/session"),
            format!("{base}/.well-known/jmap"),
        ] {
            let (status, body) = super::send_in(
                &super::NOREPLY_LANE,
                self.request(reqwest::Method::GET, &url)
                    .header(reqwest::header::ACCEPT, "application/json"),
            )
            .await?;
            if status.as_u16() == 401 {
                return Err(MailerError::Unauthorized);
            }
            if !status.is_success() {
                last_status = status.as_u16();
                continue;
            }
            let session: Session = serde_json::from_slice(&body).unwrap_or_default();
            let primary = |capability: &str| {
                session
                    .primary_accounts
                    .get(capability)
                    .and_then(Value::as_str)
                    .map(str::to_owned)
            };
            let mail_account = primary("urn:ietf:params:jmap:mail")
                .or_else(|| primary("urn:stalwart:jmap"))
                .or_else(|| session.accounts.keys().next().cloned())
                .ok_or(MailerError::NoAccount)?;
            return Ok(Discovered {
                api_url: rewrite_to_public_origin(session.api_url.as_deref(), base),
                upload_url: rewrite_to_public_origin(session.upload_url.as_deref(), base),
                submission_account: primary("urn:ietf:params:jmap:submission")
                    .unwrap_or_else(|| mail_account.clone()),
                mail_account,
            });
        }
        Err(MailerError::Session(last_status))
    }

    async fn call(&self, api_url: &str, method_calls: Value) -> Result<Value, MailerError> {
        let (status, body) = super::send_in(
            &super::NOREPLY_LANE,
            self.request(reqwest::Method::POST, api_url)
                .json(&json!({"using": USING, "methodCalls": method_calls})),
        )
        .await?;
        if !status.is_success() {
            return Err(MailerError::Request(status.as_u16()));
        }
        let envelope: Value = serde_json::from_slice(&body).map_err(|_| MailerError::NotJson)?;
        Ok(
            if envelope.get("methodResponses").is_some_and(Value::is_array) {
                envelope
            } else {
                json!({})
            },
        )
    }

    async fn send_context(
        &self,
        session: &Discovered,
        from: &str,
    ) -> Result<(String, Option<String>, String), MailerError> {
        let envelope = self
            .call(
                &session.api_url,
                json!([
                    ["Mailbox/get", {"accountId": session.mail_account, "ids": null, "properties": ["id", "role", "name"]}, "m"],
                    ["Identity/get", {"accountId": session.mail_account}, "i"],
                ]),
            )
            .await?;
        assert_success(&envelope, "Stalwart mailbox lookup")?;
        let list = |method: &str| -> Result<Vec<Value>, MailerError> {
            Ok(method_result(&envelope, method)?
                .get("list")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default())
        };
        let mailboxes = list("Mailbox/get")?;
        let identities = list("Identity/get")?;
        let drafts = pick_mailbox(&mailboxes, "drafts").ok_or(MailerError::NoDrafts)?;
        let identity = pick_identity(&identities, from).ok_or(MailerError::NoIdentity)?;
        Ok((drafts, pick_mailbox(&mailboxes, "sent"), identity))
    }

    async fn upload(
        &self,
        session: &Discovered,
        attachment: &Attachment,
    ) -> Result<Value, MailerError> {
        let kind = attachment
            .content_type
            .as_deref()
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .unwrap_or("application/octet-stream; charset=utf-8")
            .to_owned();
        let bytes = attachment.content.as_bytes().to_vec();
        let size = bytes.len();
        let media = kind
            .split(';')
            .next()
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .unwrap_or("application/octet-stream")
            .to_owned();
        let (status, body) = super::send_in(
            &super::NOREPLY_LANE,
            self.request(
                reqwest::Method::POST,
                &resolve_upload_url(&session.upload_url, &session.mail_account),
            )
            .header(reqwest::header::CONTENT_TYPE, media)
            .body(bytes),
        )
        .await?;
        if !status.is_success() {
            return Err(MailerError::Upload(status.as_u16()));
        }
        let parsed: Value = serde_json::from_slice(&body).map_err(|_| MailerError::NotJson)?;
        let blob_id = parsed
            .get("blobId")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                MailerError::Method("Stalwart blob upload did not return a blobId".into())
            })?;
        Ok(json!({
            "blobId": blob_id,
            "type": kind,
            "name": attachment.filename,
            "size": parsed.get("size").and_then(Value::as_u64).unwrap_or(size as u64),
            "disposition": "attachment",
        }))
    }
}

async fn upload_all(
    client: &Jmap<'_>,
    session: &Discovered,
    attachments: &[Attachment],
) -> Result<Vec<Value>, MailerError> {
    let mut uploaded = Vec::with_capacity(attachments.len());
    for attachment in attachments {
        uploaded.push(client.upload(session, attachment).await?);
    }
    Ok(uploaded)
}

#[allow(clippy::too_many_arguments)]
fn send_calls(
    session: &Discovered,
    drafts: &str,
    sent: Option<&str>,
    identity: &str,
    config: &MailerConfig,
    to: &str,
    message: &Message,
    attachments: &[Value],
) -> Value {
    let mut submission = json!({
        "accountId": session.submission_account,
        "create": {"s1": {
            "emailId": "#draft1",
            "identityId": identity,
            "envelope": {"mailFrom": {"email": config.from}, "rcptTo": [{"email": to}]},
        }},
    });
    if let Some(sent) = sent {
        submission["onSuccessUpdateEmail"] = json!({"#s1": {
            format!("mailboxIds/{sent}"): true,
            format!("mailboxIds/{drafts}"): null,
            "keywords/$draft": null,
        }});
    }
    let mut draft = json!({
        "mailboxIds": {drafts: true},
        "keywords": {"$seen": true, "$draft": true},
        "from": [{"name": config.from_name, "email": config.from}],
        "to": [{"email": to}],
        "subject": message.subject,
        "bodyValues": {"text": {"value": message.text}, "html": {"value": message.html}},
        "textBody": [{"partId": "text", "type": "text/plain"}],
        "htmlBody": [{"partId": "html", "type": "text/html"}],
    });
    if !attachments.is_empty() {
        draft["attachments"] = Value::Array(attachments.to_vec());
    }
    json!([
        ["Email/set", {"accountId": session.mail_account, "create": {"draft1": draft}}, "c1"],
        ["EmailSubmission/set", submission, "c2"],
    ])
}

/// Method errors and the first `notCreated`/`notUpdated`/`notDestroyed` entry fail the send, naming only the method and error type.
fn assert_success(envelope: &Value, context: &str) -> Result<(), MailerError> {
    let responses = envelope
        .get("methodResponses")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if responses.is_empty() {
        return Err(MailerError::Method(format!(
            "{context}: empty JMAP response"
        )));
    }
    for response in &responses {
        let name = response.get(0).and_then(Value::as_str).unwrap_or_default();
        let result = response.get(1).cloned().unwrap_or(Value::Null);
        let describe = |method: &str, error: &Value| {
            let hint = error
                .get("type")
                .and_then(Value::as_str)
                .map(|t| format!(" [{t}]"))
                .unwrap_or_default();
            MailerError::Method(format!("Failed during {method}{hint}"))
        };
        if name == "error" || name.ends_with("/error") {
            return Err(describe(
                if name == "error" { context } else { name },
                &result,
            ));
        }
        for key in ["notCreated", "notUpdated", "notDestroyed"] {
            if let Some(error) = result
                .get(key)
                .and_then(Value::as_object)
                .and_then(|m| m.values().next())
            {
                return Err(describe(name, error));
            }
        }
    }
    Ok(())
}

fn method_result<'a>(envelope: &'a Value, method: &str) -> Result<&'a Value, MailerError> {
    envelope
        .get("methodResponses")
        .and_then(Value::as_array)
        .and_then(|responses| {
            responses
                .iter()
                .find(|r| r.get(0).and_then(Value::as_str) == Some(method))
        })
        .and_then(|r| r.get(1))
        .ok_or_else(|| MailerError::Method(format!("Expected {method} in JMAP response")))
}

/// A mailbox by role, else by name, case-insensitively.
fn pick_mailbox(mailboxes: &[Value], role: &str) -> Option<String> {
    let field = |mailbox: &Value, key: &str| {
        mailbox
            .get(key)
            .and_then(Value::as_str)
            .map(str::to_lowercase)
    };
    mailboxes
        .iter()
        .find(|m| field(m, "role").as_deref() == Some(role))
        .or_else(|| {
            mailboxes
                .iter()
                .find(|m| field(m, "name").as_deref() == Some(role))
        })
        .and_then(|m| m.get("id").and_then(Value::as_str))
        .map(str::to_owned)
}

fn pick_identity(identities: &[Value], from: &str) -> Option<String> {
    let needle = from.trim().to_lowercase();
    identities
        .iter()
        .find(|identity| {
            identity
                .get("email")
                .and_then(Value::as_str)
                .map(|e| e.trim().to_lowercase())
                == Some(needle.clone())
        })
        .and_then(|identity| identity.get("id").and_then(Value::as_str))
        .map(str::to_owned)
}

/// Stalwart advertises internal hosts; calls go to the configured origin, keeping JMAP's `{accountId}` template braces.
pub fn rewrite_to_public_origin(url: Option<&str>, public_base: &str) -> String {
    let fallback = format!("{public_base}/jmap/");
    let (Some(url), Ok(base)) = (url, url::Url::parse(public_base)) else {
        return fallback;
    };
    let Ok(mut parsed) = url::Url::parse(url) else {
        return fallback;
    };
    if parsed.set_scheme(base.scheme()).is_err()
        || parsed.set_host(base.host_str()).is_err()
        || parsed.set_port(base.port()).is_err()
    {
        return fallback;
    }
    parsed.to_string().replace("%7B", "{").replace("%7D", "}")
}

pub fn resolve_upload_url(template: &str, account_id: &str) -> String {
    let encoded = crate::auth::cookies::encode_uri_component(account_id);
    template
        .replace("{accountId}", &encoded)
        .replace("%7BaccountId%7D", &encoded)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::Json;
    use axum::extract::State;
    use axum::http::{HeaderMap, StatusCode};
    use std::sync::{Arc, Mutex};

    #[test]
    fn rewrites_internal_hosts_onto_the_public_origin() {
        assert_eq!(
            rewrite_to_public_origin(
                Some("http://stalwart.internal:8080/jmap/"),
                "https://mail.solace.test"
            ),
            "https://mail.solace.test/jmap/"
        );
        assert_eq!(
            rewrite_to_public_origin(None, "https://mail.solace.test"),
            "https://mail.solace.test/jmap/"
        );
    }

    #[test]
    fn keeps_upload_template_braces_after_origin_rewrite() {
        assert_eq!(
            rewrite_to_public_origin(
                Some("http://internal:8080/jmap/upload/{accountId}/"),
                "https://mail.solace.test"
            ),
            "https://mail.solace.test/jmap/upload/{accountId}/"
        );
    }

    #[test]
    fn resolves_percent_encoded_upload_templates() {
        assert_eq!(
            resolve_upload_url("https://m/jmap/upload/{accountId}/", "a b"),
            "https://m/jmap/upload/a%20b/"
        );
        assert_eq!(
            resolve_upload_url("https://m/jmap/upload/%7BaccountId%7D/", "c"),
            "https://m/jmap/upload/c/"
        );
    }

    #[test]
    fn picks_drafts_and_identity_case_insensitively() {
        let mailboxes = [
            json!({"id": "1", "role": "Inbox"}),
            json!({"id": "2", "name": "DRAFTS"}),
            json!({"id": "3", "role": "SENT"}),
        ];
        assert_eq!(pick_mailbox(&mailboxes, "drafts").as_deref(), Some("2"));
        assert_eq!(pick_mailbox(&mailboxes, "sent").as_deref(), Some("3"));
        let identities = [json!({"id": "i1", "email": " NoReply@Solace.test "})];
        assert_eq!(
            pick_identity(&identities, "noreply@solace.test").as_deref(),
            Some("i1")
        );
        assert_eq!(pick_identity(&identities, "other@solace.test"), None);
    }

    /// A local JMAP server: records each request's gate header and answers like Stalwart, first refusing calls listed in `refusals`.
    #[derive(Clone, Default)]
    struct Fake {
        identities: Arc<Vec<Value>>,
        gate_headers: Arc<Mutex<Vec<Option<String>>>>,
        calls: Arc<Mutex<Vec<Value>>>,
        refusals: Arc<Mutex<Vec<(&'static str, Value)>>>,
        submitted: Arc<Mutex<usize>>,
    }

    /// Stalwart's answer past its per-account `maxConcurrentRequests`.
    fn concurrency_limit() -> Value {
        json!({"type": "urn:ietf:params:jmap:error:limit", "status": 400, "detail": "The request exceeds the maximum number of concurrent requests.", "limit": "maxConcurrentRequests"})
    }

    async fn fake_server(fake: Fake) -> String {
        async fn record(fake: &Fake, headers: &HeaderMap) {
            let gate = headers
                .get(super::super::gate::GATE_HEADER)
                .and_then(|v| v.to_str().ok())
                .map(str::to_owned);
            fake.gate_headers.lock().unwrap().push(gate);
        }
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let api = format!("{base}/jmap/");
        let app = axum::Router::new()
            .route(
                "/jmap/session",
                axum::routing::get(move |State(fake): State<Fake>, headers: HeaderMap| {
                    let api = api.clone();
                    async move {
                        record(&fake, &headers).await;
                        Json(json!({"apiUrl": api, "uploadUrl": "", "primaryAccounts": {"urn:ietf:params:jmap:mail": "acc"}}))
                    }
                }),
            )
            .route(
                "/jmap/",
                axum::routing::post(|State(fake): State<Fake>, headers: HeaderMap, Json(body): Json<Value>| async move {
                    record(&fake, &headers).await;
                    fake.calls.lock().unwrap().push(body.clone());
                    let first = body["methodCalls"][0][0].as_str().unwrap_or_default().to_owned();
                    let refusal = {
                        let mut refusals = fake.refusals.lock().unwrap();
                        let next = refusals.first().is_some_and(|(method, _)| *method == first);
                        next.then(|| refusals.remove(0).1)
                    };
                    if let Some(problem) = refusal {
                        (StatusCode::BAD_REQUEST, Json(problem))
                    } else if first == "Mailbox/get" {
                        (StatusCode::OK, Json(json!({"methodResponses": [
                            ["Mailbox/get", {"list": [{"id": "d", "role": "drafts"}, {"id": "s", "role": "sent"}]}, "m"],
                            ["Identity/get", {"list": fake.identities.as_ref()}, "i"],
                        ]})))
                    } else {
                        *fake.submitted.lock().unwrap() += 1;
                        (StatusCode::OK, Json(json!({"methodResponses": [
                            ["Email/set", {"created": {"draft1": {"id": "e1"}}}, "c1"],
                            ["EmailSubmission/set", {"created": {"s1": {"id": "sub1"}}}, "c2"],
                        ]})))
                    }
                }),
            )
            .with_state(fake);
        tokio::spawn(async move { axum::serve(listener, app).await });
        base
    }

    fn config(base: &str) -> MailerConfig {
        MailerConfig {
            base_url: base.to_owned(),
            username: "noreply@solace.test".into(),
            password: "solace-test-noreply".into(),
            from: "noreply@solace.test".into(),
            from_name: "Solace".into(),
        }
    }

    fn message() -> Message {
        Message {
            subject: "Hi".into(),
            text: "Text".into(),
            html: "<p>HTML</p>".into(),
            attachments: Vec::new(),
        }
    }

    #[tokio::test]
    async fn sends_through_session_identity_and_submission() {
        let fake = Fake {
            identities: Arc::new(vec![json!({"id": "id1", "email": "noreply@solace.test"})]),
            ..Default::default()
        };
        let base = fake_server(fake.clone()).await;
        let gate = StalwartGate::new(&base, None);
        let id = send(
            &Client::new(),
            &gate,
            &config(&base),
            "friend@example.com",
            &message(),
        )
        .await
        .unwrap();
        assert_eq!(id, "sub1");
        let calls = fake.calls.lock().unwrap().clone();
        let submit = &calls[1]["methodCalls"];
        assert_eq!(submit[0][0], json!("Email/set"));
        assert_eq!(
            submit[0][1]["create"]["draft1"]["mailboxIds"],
            json!({"d": true})
        );
        assert_eq!(submit[1][1]["create"]["s1"]["identityId"], json!("id1"));
        assert_eq!(
            submit[1][1]["onSuccessUpdateEmail"]["#s1"]["mailboxIds/s"],
            json!(true)
        );
    }

    fn noreply() -> Fake {
        Fake {
            identities: Arc::new(vec![json!({"id": "id1", "email": "noreply@solace.test"})]),
            ..Default::default()
        }
    }

    async fn send_with(fake: &Fake) -> Result<String, MailerError> {
        let base = fake_server(fake.clone()).await;
        send(
            &Client::new(),
            &StalwartGate::new(&base, None),
            &config(&base),
            "friend@example.com",
            &message(),
        )
        .await
    }

    #[tokio::test]
    async fn resends_calls_refused_at_the_concurrency_limit_and_submits_once() {
        let fake = noreply();
        *fake.refusals.lock().unwrap() = vec![
            ("Mailbox/get", concurrency_limit()),
            ("Email/set", concurrency_limit()),
            ("Email/set", concurrency_limit()),
        ];
        assert_eq!(send_with(&fake).await.unwrap(), "sub1");
        assert_eq!(fake.calls.lock().unwrap().len(), 5);
        assert_eq!(*fake.submitted.lock().unwrap(), 1);
    }

    #[tokio::test]
    async fn gives_up_after_bounded_retries_at_the_concurrency_limit() {
        let fake = noreply();
        let attempts = usize::try_from(super::super::LIMIT_RETRIES).unwrap() + 1;
        *fake.refusals.lock().unwrap() = vec![("Mailbox/get", concurrency_limit()); attempts + 1];
        let started = std::time::Instant::now();
        let error = send_with(&fake).await;
        assert!(matches!(error, Err(MailerError::Request(400))), "{error:?}");
        assert!(
            started.elapsed() < Duration::from_secs(4),
            "{:?}",
            started.elapsed()
        );
        assert_eq!(fake.calls.lock().unwrap().len(), attempts);
        assert_eq!(*fake.submitted.lock().unwrap(), 0);
    }

    #[tokio::test]
    async fn other_request_errors_are_not_resent() {
        let fake = noreply();
        let too_big = json!({"type": "urn:ietf:params:jmap:error:limit", "status": 400, "limit": "maxSizeRequest"});
        let not_request = json!({"type": "urn:ietf:params:jmap:error:notRequest", "status": 400});
        for problem in [too_big, not_request] {
            fake.calls.lock().unwrap().clear();
            *fake.refusals.lock().unwrap() = vec![("Email/set", problem)];
            let error = send_with(&fake).await;
            assert!(matches!(error, Err(MailerError::Request(400))), "{error:?}");
            assert_eq!(fake.calls.lock().unwrap().len(), 2, "sent once");
        }
        assert_eq!(*fake.submitted.lock().unwrap(), 0);
    }

    #[tokio::test]
    async fn fails_closed_without_an_identity() {
        let fake = Fake::default();
        let base = fake_server(fake.clone()).await;
        let error = send(
            &Client::new(),
            &StalwartGate::new(&base, None),
            &config(&base),
            "friend@example.com",
            &message(),
        )
        .await;
        assert!(matches!(error, Err(MailerError::NoIdentity)), "{error:?}");
        assert_eq!(fake.calls.lock().unwrap().len(), 1, "nothing was submitted");
    }

    #[tokio::test]
    async fn sends_the_gate_key_when_configured() {
        let fake = Fake {
            identities: Arc::new(vec![json!({"id": "id1", "email": "noreply@solace.test"})]),
            ..Default::default()
        };
        let base = fake_server(fake.clone()).await;
        // The gate only applies to https; over http the key must never be sent.
        let gate = StalwartGate::new(&base, Some("solace-test-gate"));
        send(
            &Client::new(),
            &gate,
            &config(&base),
            "friend@example.com",
            &message(),
        )
        .await
        .unwrap();
        assert!(
            fake.gate_headers
                .lock()
                .unwrap()
                .iter()
                .all(Option::is_none)
        );
        let https_gate = StalwartGate::new("https://mail.solace.test", Some("solace-test-gate"));
        assert_eq!(
            https_gate.key_for("https://mail.solace.test/jmap/"),
            Some("solace-test-gate")
        );
    }
}
