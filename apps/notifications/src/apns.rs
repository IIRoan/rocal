//! APNs over HTTP/2 with token auth. Alerts are generic with `mutable-content`; the NSE fills them in on-device.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use p256::ecdsa::signature::Signer;
use p256::ecdsa::{Signature, SigningKey};
use p256::pkcs8::DecodePrivateKey;
use serde_json::{Value, json};

/// The APNs limit for alert notifications.
pub const MAX_PAYLOAD_BYTES: usize = 4096;
/// Apple accepts a provider token for an hour; it is renewed a little earlier.
const TOKEN_LIFETIME: Duration = Duration::from_secs(50 * 60);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
const PRODUCTION_HOST: &str = "https://api.push.apple.com";
const SANDBOX_HOST: &str = "https://api.sandbox.push.apple.com";

#[derive(Debug, thiserror::Error)]
pub enum ApnsError {
    #[error("APNs auth key is not a PKCS#8 P-256 key")]
    Key,
    #[error("APNs payload exceeds {MAX_PAYLOAD_BYTES} bytes")]
    TooLarge,
    #[error("APNs request failed")]
    Transport(#[from] reqwest::Error),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    EventReminder,
    NewMail,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::EventReminder => "event_reminder",
            Self::NewMail => "new_mail",
        }
    }
}

/// A push with no user content in the clear.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Notification {
    pub kind: Kind,
    pub title: &'static str,
    pub body: String,
    pub collapse_id: String,
    pub event_id: String,
    pub email_id: String,
    pub account_id: String,
    pub encrypted_title: String,
    pub encrypted_lead: String,
    /// When the worker sent it; Apple sees that anyway, and the extension adds the sealed lead to it.
    pub sent_at: i64,
}

/// A generic reminder: the title and lead travel sealed, so the visible text names no time.
pub fn event_reminder(
    event_id: &str,
    encrypted_title: &str,
    encrypted_lead: &str,
    sent_at: i64,
) -> Notification {
    Notification {
        kind: Kind::EventReminder,
        title: "Event reminder",
        body: "You have an upcoming event".into(),
        collapse_id: collapse_id("event:", event_id),
        event_id: event_id.to_owned(),
        email_id: String::new(),
        account_id: String::new(),
        encrypted_title: encrypted_title.trim().to_owned(),
        encrypted_lead: encrypted_lead.trim().to_owned(),
        sent_at,
    }
}

/// A generic new-mail alert; the NSE fetches sender, subject and preview over JMAP.
pub fn new_mail(count: i64, email_id: &str, account_id: &str) -> Notification {
    let email_id = email_id.trim();
    Notification {
        kind: Kind::NewMail,
        title: "New mail",
        body: if count > 1 {
            format!("{count} new messages")
        } else {
            "You have a new message".into()
        },
        collapse_id: collapse_id("mail:", email_id),
        event_id: String::new(),
        email_id: email_id.to_owned(),
        account_id: account_id.trim().to_owned(),
        encrypted_title: String::new(),
        encrypted_lead: String::new(),
        sent_at: 0,
    }
}

/// `prefix` plus the id, cut to the 64 bytes APNs allows in a collapse id.
fn collapse_id(prefix: &str, id: &str) -> String {
    let mut value = format!("{prefix}{}", id.trim());
    if value.len() > 64 {
        let mut end = 64;
        while !value.is_char_boundary(end) {
            end -= 1;
        }
        value.truncate(end);
    }
    value
}

/// The APNs body; `body` keeps the `t`/`eid`/`mid` tap keys older app builds read.
pub fn payload(notification: &Notification) -> Value {
    let mut aps = json!({
        "alert": {"title": notification.title, "body": notification.body},
        "sound": "default",
        "mutable-content": 1,
    });
    if !notification.collapse_id.is_empty() {
        aps["thread-id"] = json!(notification.collapse_id);
    }
    let mut payload = json!({"aps": aps, "type": notification.kind.as_str(), "body": {}});
    match notification.kind {
        Kind::EventReminder => {
            payload["body"]["t"] = json!("event");
            if !notification.event_id.is_empty() {
                payload["body"]["eid"] = json!(notification.event_id);
                payload["eventId"] = json!(notification.event_id);
            }
            if !notification.encrypted_title.is_empty() {
                payload["enc"] = json!(notification.encrypted_title);
            }
            if !notification.encrypted_lead.is_empty() {
                payload["encl"] = json!(notification.encrypted_lead);
                payload["sent"] = json!(notification.sent_at);
            }
        }
        Kind::NewMail => {
            payload["body"]["t"] = json!("mail");
            if !notification.email_id.is_empty() {
                payload["body"]["mid"] = json!(notification.email_id);
                payload["emailId"] = json!(notification.email_id);
            }
            if !notification.account_id.is_empty() {
                payload["accountId"] = json!(notification.account_id);
            }
        }
    }
    payload
}

/// The encoded body, without the ciphertext when it would push it over the APNs limit.
pub fn encode(notification: &Notification) -> Result<Vec<u8>, ApnsError> {
    let body = payload(notification).to_string();
    if body.len() <= MAX_PAYLOAD_BYTES {
        return Ok(body.into_bytes());
    }
    let without_title = Notification {
        encrypted_title: String::new(),
        ..notification.clone()
    };
    let body = payload(&without_title).to_string();
    if body.len() > MAX_PAYLOAD_BYTES {
        return Err(ApnsError::TooLarge);
    }
    Ok(body.into_bytes())
}

pub struct Device<'a> {
    pub token: &'a str,
    pub bundle_id: &'a str,
    pub environment: &'a str,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Delivery {
    pub status: u16,
    pub reason: String,
    pub unregistered: bool,
}

pub fn alternate_environment(environment: &str) -> &'static str {
    if environment.trim().eq_ignore_ascii_case("sandbox") {
        "production"
    } else {
        "sandbox"
    }
}

pub struct Apns {
    key_id: String,
    team_id: String,
    key: SigningKey,
    http: reqwest::Client,
    hosts: (String, String),
    token: Mutex<Option<(String, Instant)>>,
}

impl Apns {
    pub fn new(key_id: &str, team_id: &str, pem: &str) -> Result<Self, ApnsError> {
        let http = reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()?;
        Self::with_hosts(key_id, team_id, pem, http, PRODUCTION_HOST, SANDBOX_HOST)
    }

    fn with_hosts(
        key_id: &str,
        team_id: &str,
        pem: &str,
        http: reqwest::Client,
        production: &str,
        sandbox: &str,
    ) -> Result<Self, ApnsError> {
        Ok(Self {
            key_id: key_id.to_owned(),
            team_id: team_id.to_owned(),
            key: SigningKey::from_pkcs8_pem(pem).map_err(|_| ApnsError::Key)?,
            http,
            hosts: (production.to_owned(), sandbox.to_owned()),
            token: Mutex::new(None),
        })
    }

    /// The ES256 provider token, reused until it nears Apple's one-hour limit.
    fn bearer(&self) -> String {
        let mut cached = self
            .token
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if let Some((token, issued)) = cached.as_ref()
            && issued.elapsed() < TOKEN_LIFETIME
        {
            return token.clone();
        }
        let header =
            URL_SAFE_NO_PAD.encode(json!({"alg": "ES256", "kid": self.key_id}).to_string());
        let claims = URL_SAFE_NO_PAD.encode(
            json!({"iss": self.team_id, "iat": jiff::Timestamp::now().as_second()}).to_string(),
        );
        let input = format!("{header}.{claims}");
        let signature: Signature = self.key.sign(input.as_bytes());
        let token = format!("{input}.{}", URL_SAFE_NO_PAD.encode(signature.to_bytes()));
        *cached = Some((token.clone(), Instant::now()));
        token
    }

    pub async fn send(
        &self,
        device: &Device<'_>,
        notification: &Notification,
    ) -> Result<Delivery, ApnsError> {
        let host = if device.environment == "sandbox" {
            &self.hosts.1
        } else {
            &self.hosts.0
        };
        let mut request = self
            .http
            .post(format!("{host}/3/device/{}", device.token))
            .header("authorization", format!("bearer {}", self.bearer()))
            .header("apns-topic", device.bundle_id)
            .header("apns-push-type", "alert")
            .header("apns-priority", "10")
            .body(encode(notification)?);
        if !notification.collapse_id.is_empty() {
            request = request.header("apns-collapse-id", &notification.collapse_id);
        }
        let response = request.send().await?;
        let status = response.status().as_u16();
        let body = response.bytes().await.unwrap_or_default();
        let reason = serde_json::from_slice::<Value>(&body[..body.len().min(2048)])
            .ok()
            .and_then(|value| value.get("reason")?.as_str().map(str::to_owned))
            .unwrap_or_default();
        Ok(Delivery {
            status,
            unregistered: status == 410 || reason.eq_ignore_ascii_case("Unregistered"),
            reason,
        })
    }

    /// Sends to the device's environment, then once to the other on `BadDeviceToken`; returns the environment used.
    pub async fn send_preferring(
        &self,
        device: &Device<'_>,
        notification: &Notification,
    ) -> Result<(Delivery, String), ApnsError> {
        let delivery = self.send(device, notification).await?;
        if delivery.status < 400 || !delivery.reason.eq_ignore_ascii_case("BadDeviceToken") {
            return Ok((delivery, device.environment.to_owned()));
        }
        let environment = alternate_environment(device.environment);
        let retry = Device {
            environment,
            ..*device
        };
        Ok((self.send(&retry, notification).await?, environment.into()))
    }
}

#[cfg(test)]
mod tests {
    use p256::ecdsa::VerifyingKey;
    use p256::ecdsa::signature::Verifier;
    use p256::pkcs8::{EncodePrivateKey, LineEnding};
    use solace_server::integrations::stalwart::fake::{FakeStalwart, Reply};

    use super::*;

    fn test_key() -> (String, VerifyingKey) {
        let key = SigningKey::from_slice(&[7; 32]).unwrap();
        let pem = key.to_pkcs8_pem(LineEnding::LF).unwrap().to_string();
        (pem, *key.verifying_key())
    }

    #[test]
    fn reminders_are_generic_and_carry_only_ciphertext() {
        let reminder = event_reminder("evt1", " v1.iv.ct ", " v1.iv.lead ", 1_700_000_000);
        let body = payload(&reminder);
        assert_eq!(
            body["aps"]["alert"],
            json!({"title": "Event reminder", "body": "You have an upcoming event"})
        );
        assert_eq!(body["aps"]["mutable-content"], json!(1));
        assert_eq!(body["aps"]["thread-id"], json!("event:evt1"));
        assert_eq!(body["type"], json!("event_reminder"));
        assert_eq!(body["eventId"], json!("evt1"));
        assert_eq!(body["enc"], json!("v1.iv.ct"));
        assert_eq!(body["encl"], json!("v1.iv.lead"));
        assert_eq!(body["sent"], json!(1_700_000_000));
        assert_eq!(body["body"], json!({"t": "event", "eid": "evt1"}));
    }

    #[test]
    fn reminders_without_ciphertext_name_no_time() {
        let reminder = event_reminder("e", "", "", 1_700_000_000);
        assert_eq!(reminder.body, "You have an upcoming event");
        let body = payload(&reminder);
        assert_eq!(body.get("enc"), None);
        assert_eq!(body.get("encl"), None);
        assert_eq!(body.get("sent"), None);
    }

    #[test]
    fn new_mail_is_generic_with_opaque_refs() {
        let mail = new_mail(1, " m1 ", "acc");
        let body = payload(&mail);
        assert_eq!(
            body["aps"]["alert"],
            json!({"title": "New mail", "body": "You have a new message"})
        );
        assert_eq!(body["emailId"], json!("m1"));
        assert_eq!(body["accountId"], json!("acc"));
        assert_eq!(body["body"], json!({"t": "mail", "mid": "m1"}));
        assert_eq!(new_mail(3, "m1", "acc").body, "3 new messages");
        assert_ne!(
            new_mail(1, "m1", "").collapse_id,
            new_mail(1, "m2", "").collapse_id
        );
        assert_eq!(new_mail(1, "", "").collapse_id, "mail:");
    }

    #[test]
    fn collapse_ids_fit_apns() {
        assert_eq!(collapse_id("event:", &"x".repeat(100)).len(), 64);
    }

    #[test]
    fn oversized_ciphertext_is_dropped_not_the_push() {
        let reminder = event_reminder("e1", &"c".repeat(MAX_PAYLOAD_BYTES), "", 0);
        let body: Value = serde_json::from_slice(&encode(&reminder).unwrap()).unwrap();
        assert_eq!(body.get("enc"), None);
        assert_eq!(body["eventId"], json!("e1"));
        let small = event_reminder("e1", "ct", "", 0);
        let body: Value = serde_json::from_slice(&encode(&small).unwrap()).unwrap();
        assert_eq!(body["enc"], json!("ct"));
    }

    #[test]
    fn provider_tokens_are_es256_signed_and_reused() {
        let (pem, verifying) = test_key();
        let apns = Apns::new("KEY123", "TEAM45", &pem).unwrap();
        let token = apns.bearer();
        let parts: Vec<&str> = token.split('.').collect();
        let header: Value =
            serde_json::from_slice(&URL_SAFE_NO_PAD.decode(parts[0]).unwrap()).unwrap();
        let claims: Value =
            serde_json::from_slice(&URL_SAFE_NO_PAD.decode(parts[1]).unwrap()).unwrap();
        assert_eq!(header, json!({"alg": "ES256", "kid": "KEY123"}));
        assert_eq!(claims["iss"], json!("TEAM45"));
        let signature = Signature::from_slice(&URL_SAFE_NO_PAD.decode(parts[2]).unwrap()).unwrap();
        verifying
            .verify(format!("{}.{}", parts[0], parts[1]).as_bytes(), &signature)
            .unwrap();
        assert_eq!(apns.bearer(), token);
        assert!(matches!(
            Apns::new("K", "T", "not a key"),
            Err(ApnsError::Key)
        ));
    }

    async fn apns_answering(
        reply: impl Fn(&str) -> Reply + Send + Sync + 'static,
    ) -> (FakeStalwart, Apns) {
        let fake = FakeStalwart::start(move |request| reply(&request.path)).await;
        let (pem, _) = test_key();
        let production = format!("{}/production", fake.base_url);
        let sandbox = format!("{}/sandbox", fake.base_url);
        let apns =
            Apns::with_hosts("K", "T", &pem, fake.http.clone(), &production, &sandbox).unwrap();
        (fake, apns)
    }

    const DEVICE: Device<'static> = Device {
        token: "tok",
        bundle_id: "onl.solace.calendar",
        environment: "production",
    };

    #[tokio::test]
    async fn gone_tokens_are_unregistered() {
        let (fake, apns) = apns_answering(|_| {
            Reply::status_json(410, serde_json::json!({"reason": "Unregistered"}))
        })
        .await;
        let delivery = apns
            .send(&DEVICE, &event_reminder("e1", "", "", 0))
            .await
            .unwrap();
        assert!(delivery.unregistered);
        let request = &fake.requests()[0];
        assert_eq!(request.path, "/production/3/device/tok");
        let body: Value = serde_json::from_str(&request.body).unwrap();
        assert_eq!(body["type"], json!("event_reminder"));
    }

    #[tokio::test]
    async fn bad_device_tokens_retry_the_other_environment_once() {
        let (fake, apns) = apns_answering(|path| {
            if path.starts_with("/production") {
                Reply::status_json(400, serde_json::json!({"reason": "BadDeviceToken"}))
            } else {
                Reply::json(serde_json::json!({}))
            }
        })
        .await;
        let (delivery, environment) = apns
            .send_preferring(&DEVICE, &new_mail(1, "m1", "a1"))
            .await
            .unwrap();
        assert_eq!((delivery.status, delivery.unregistered), (200, false));
        assert_eq!(environment, "sandbox");
        assert_eq!(fake.requests().len(), 2);
    }
}
