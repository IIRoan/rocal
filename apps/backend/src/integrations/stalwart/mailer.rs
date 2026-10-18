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
    assert_success(&without_sent_move(&envelope), "Stalwart email send")?;
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
            .unwrap_or("application/octet-stream; charset=utf-8");
        let media = kind
            .split(';')
            .next()
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .unwrap_or("application/octet-stream");
        let (status, body) = super::send_in(
            &super::NOREPLY_LANE,
            self.request(
                reqwest::Method::POST,
                &resolve_upload_url(&session.upload_url, &session.mail_account),
            )
            .header(reqwest::header::CONTENT_TYPE, media)
            .body(attachment.content.clone()),
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
            "size": parsed.get("size").and_then(Value::as_u64).unwrap_or(attachment.content.len() as u64),
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
    if let Some(message_id) = &message.message_id {
        draft["messageId"] = json!([message_id]);
    }
    json!([
        ["Email/set", {"accountId": session.mail_account, "create": {"draft1": draft}}, "c1"],
        ["EmailSubmission/set", submission, "c2"],
    ])
}

/// The envelope without the implicit `Email/set` that answers `onSuccessUpdateEmail` (call id `c2`): once the submission is queued, a failed move to Sent must not fail, and so resend, the mail.
fn without_sent_move(envelope: &Value) -> Value {
    let mut queued = envelope.clone();
    if let Some(responses) = queued
        .get_mut("methodResponses")
        .and_then(Value::as_array_mut)
    {
        responses.retain(|response| {
            !(response.get(0) == Some(&json!("Email/set")) && response.get(2) == Some(&json!("c2")))
        });
    }
    queued
}

/// Method errors and the first `notCreated`/`notUpdated`/`notDestroyed` entry fail the send, naming only the method and error type.
fn assert_success(envelope: &Value, context: &str) -> Result<(), MailerError> {
    let responses = envelope
        .get("methodResponses")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default();
    if responses.is_empty() {
        return Err(MailerError::Method(format!(
            "{context}: empty JMAP response"
        )));
    }
    for response in responses {
        let name = response.get(0).and_then(Value::as_str).unwrap_or_default();
        let result = response.get(1).unwrap_or(&Value::Null);
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
                result,
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
    super::method_response(envelope, method)
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
                .is_some_and(|e| e.trim().to_lowercase() == needle)
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
    use std::collections::VecDeque;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{Arc, Mutex};

    use super::super::fake::{FakeStalwart, Recorded, Reply};
    use super::*;

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

    /// The noreply account's Stalwart, counting submissions; each `(method, reply)` in `refusals` answers the next call to that method, in order.
    async fn stalwart(
        identities: Value,
        refusals: Vec<(&'static str, Reply)>,
    ) -> (FakeStalwart, Arc<AtomicUsize>) {
        let submitted = Arc::new(AtomicUsize::new(0));
        let counted = submitted.clone();
        let refusals = Mutex::new(VecDeque::from(refusals));
        let fake = FakeStalwart::start(move |request| {
            if request.path == "/jmap/session" {
                return Reply::json(
                    json!({"apiUrl": "http://stalwart.internal:8080/jmap/", "uploadUrl": "", "primaryAccounts": {"urn:ietf:params:jmap:mail": "acc"}}),
                );
            }
            let first = request.first_method();
            let mut refusals = refusals.lock().unwrap();
            if refusals.front().is_some_and(|(method, _)| *method == first) {
                return refusals.pop_front().unwrap().1;
            }
            if first == "Mailbox/get" {
                return Reply::json(json!({"methodResponses": [
                    ["Mailbox/get", {"list": [{"id": "d", "role": "drafts"}, {"id": "s", "role": "sent"}]}, "m"],
                    ["Identity/get", {"list": identities}, "i"],
                ]}));
            }
            counted.fetch_add(1, Ordering::SeqCst);
            Reply::json(json!({"methodResponses": [
                ["Email/set", {"created": {"draft1": {"id": "e1"}}}, "c1"],
                ["EmailSubmission/set", {"created": {"s1": {"id": "sub1"}}}, "c2"],
            ]}))
        })
        .await;
        (fake, submitted)
    }

    fn noreply() -> Value {
        json!([{"id": "id1", "email": "noreply@solace.test"}])
    }

    /// The JMAP API calls the fake received.
    fn calls(fake: &FakeStalwart) -> Vec<Value> {
        fake.requests()
            .iter()
            .filter(|r| r.path == "/jmap/")
            .map(Recorded::json)
            .collect()
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
            message_id: None,
        }
    }

    async fn send_with(fake: &FakeStalwart, gate: &StalwartGate) -> Result<String, MailerError> {
        send(
            &fake.http,
            gate,
            &config(&fake.base_url),
            "friend@example.com",
            &message(),
        )
        .await
    }

    #[tokio::test]
    async fn sends_through_session_identity_and_submission() {
        let (fake, _) = stalwart(noreply(), Vec::new()).await;
        let id = send_with(&fake, &fake.gate).await.unwrap();
        assert_eq!(id, "sub1");
        let calls = calls(&fake);
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

    #[tokio::test]
    async fn a_failed_move_to_sent_does_not_fail_queued_mail() {
        let (fake, _) = stalwart(
            noreply(),
            vec![(
                "Email/set",
                Reply::json(json!({"methodResponses": [
                    ["Email/set", {"created": {"draft1": {"id": "e1"}}}, "c1"],
                    ["EmailSubmission/set", {"created": {"s1": {"id": "sub1"}}}, "c2"],
                    ["Email/set", {"notUpdated": {"e1": {"type": "notFound"}}}, "c2"],
                ]})),
            )],
        )
        .await;
        assert_eq!(send_with(&fake, &fake.gate).await.unwrap(), "sub1");
        let (fake, _) = stalwart(
            noreply(),
            vec![(
                "Email/set",
                Reply::json(json!({"methodResponses": [
                    ["Email/set", {"notCreated": {"draft1": {"type": "invalidProperties"}}}, "c1"],
                    ["EmailSubmission/set", {"notCreated": {"s1": {"type": "invalidProperties"}}}, "c2"],
                ]})),
            )],
        )
        .await;
        assert!(send_with(&fake, &fake.gate).await.is_err());
    }

    #[tokio::test]
    async fn sets_the_message_id_only_when_given() {
        let (fake, _) = stalwart(noreply(), Vec::new()).await;
        send_with(&fake, &fake.gate).await.unwrap();
        let tagged = Message {
            message_id: Some("solace-reminder.abc@solace.test".into()),
            ..message()
        };
        send(
            &fake.http,
            &fake.gate,
            &config(&fake.base_url),
            "friend@example.com",
            &tagged,
        )
        .await
        .unwrap();
        let drafts: Vec<Value> = calls(&fake)
            .iter()
            .filter(|call| call["methodCalls"][0][0] == json!("Email/set"))
            .map(|call| call["methodCalls"][0][1]["create"]["draft1"].clone())
            .collect();
        assert_eq!(drafts[0].get("messageId"), None);
        assert_eq!(
            drafts[1]["messageId"],
            json!(["solace-reminder.abc@solace.test"])
        );
    }

    #[tokio::test]
    async fn resends_calls_refused_at_the_concurrency_limit_and_submits_once() {
        let (fake, submitted) = stalwart(
            noreply(),
            vec![
                ("Mailbox/get", Reply::concurrency_limit()),
                ("Email/set", Reply::concurrency_limit()),
                ("Email/set", Reply::concurrency_limit()),
            ],
        )
        .await;
        assert_eq!(send_with(&fake, &fake.gate).await.unwrap(), "sub1");
        assert_eq!(calls(&fake).len(), 5);
        assert_eq!(submitted.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn gives_up_after_bounded_retries_at_the_concurrency_limit() {
        let attempts = usize::try_from(super::super::LIMIT_RETRIES).unwrap() + 1;
        let refusals = std::iter::repeat_with(|| ("Mailbox/get", Reply::concurrency_limit()))
            .take(attempts + 1)
            .collect();
        let (fake, submitted) = stalwart(noreply(), refusals).await;
        let started = std::time::Instant::now();
        let error = send_with(&fake, &fake.gate).await;
        assert!(matches!(error, Err(MailerError::Request(400))), "{error:?}");
        assert!(
            started.elapsed() < Duration::from_secs(4),
            "{:?}",
            started.elapsed()
        );
        assert_eq!(calls(&fake).len(), attempts);
        assert_eq!(submitted.load(Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn other_request_errors_are_not_resent() {
        let too_big = json!({"type": "urn:ietf:params:jmap:error:limit", "status": 400, "limit": "maxSizeRequest"});
        let not_request = json!({"type": "urn:ietf:params:jmap:error:notRequest", "status": 400});
        for problem in [too_big, not_request] {
            let (fake, submitted) =
                stalwart(noreply(), vec![("Email/set", Reply::problem(problem))]).await;
            let error = send_with(&fake, &fake.gate).await;
            assert!(matches!(error, Err(MailerError::Request(400))), "{error:?}");
            assert_eq!(calls(&fake).len(), 2, "sent once");
            assert_eq!(submitted.load(Ordering::SeqCst), 0);
        }
    }

    #[tokio::test]
    async fn fails_closed_without_an_identity() {
        let (fake, _) = stalwart(json!([]), Vec::new()).await;
        let error = send_with(&fake, &fake.gate).await;
        assert!(matches!(error, Err(MailerError::NoIdentity)), "{error:?}");
        assert_eq!(calls(&fake).len(), 1, "nothing was submitted");
    }

    #[tokio::test]
    async fn sends_the_gate_key_when_configured() {
        let (fake, _) = stalwart(noreply(), Vec::new()).await;
        // The gate only applies to https; over http the key must never be sent.
        let gate = StalwartGate::new(&fake.base_url, Some("solace-test-gate"));
        send_with(&fake, &gate).await.unwrap();
        assert!(fake.requests().iter().all(|r| r.gate.is_none()));
        let https_gate = StalwartGate::new("https://mail.solace.test", Some("solace-test-gate"));
        assert_eq!(
            https_gate.key_for("https://mail.solace.test/jmap/"),
            Some("solace-test-gate")
        );
    }
}
