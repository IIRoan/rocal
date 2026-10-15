//! Mail fixtures shared by the mail modules: provisioned mailboxes, JMAP through the proxy, Stalwart admin calls and webhook signatures.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use base64::engine::DecodePaddingMode;
use base64::engine::general_purpose::{
    GeneralPurpose, GeneralPurposeConfig, STANDARD, URL_SAFE_NO_PAD,
};
use base64::{Engine, alphabet};
use hmac::{Hmac, KeyInit, Mac};
use serde_json::{Value, json};
use sha2::Sha256;
use solace_api_tests::client::ApiResponse;
use solace_api_tests::seed::fake_envelope;
use solace_api_types::mail::{
    MailAccessToken, MailBootstrapRequest, MailSignup, MailSyncResult, MailVaultKdfParams,
};

use crate::helpers::{Backend, TestApp, TestUser, hex, ok};

pub const JMAP_MAIL: [&str; 3] = [
    "urn:ietf:params:jmap:core",
    "urn:ietf:params:jmap:mail",
    "urn:ietf:params:jmap:submission",
];

pub struct Mailbox {
    pub user: TestUser,
    pub signup: MailSignup,
}

/// One of the four fixture keys: armored public key and fingerprint.
pub fn pgp_key(index: usize) -> (String, String) {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/fixtures/pgp");
    let keys: Value = serde_json::from_str(
        &std::fs::read_to_string(format!("{dir}/keys.json")).expect("keys.json"),
    )
    .expect("keys.json is JSON");
    let entry = &keys[index % 4];
    let file = entry["file"].as_str().expect("key file");
    let armored = std::fs::read_to_string(format!("{dir}/{file}")).expect("armored key");
    let fingerprint = entry["fingerprint"]
        .as_str()
        .expect("fingerprint")
        .to_owned();
    (armored, fingerprint)
}

pub fn kdf_params() -> MailVaultKdfParams {
    MailVaultKdfParams {
        salt_b64: STANDARD.encode(rand::random::<[u8; 16]>()),
        memory_kib: 65_536,
        iterations: 3,
        parallelism: 1,
    }
}

pub fn bootstrap_request(index: usize) -> MailBootstrapRequest {
    let (public_key_armored, fingerprint) = pgp_key(index);
    MailBootstrapRequest {
        public_key_armored,
        fingerprint,
        algorithm: "openpgp".into(),
        created_at: "2026-10-14T13:08:35.000Z".into(),
        vault_version: 1,
        encrypted_vault_b64: STANDARD.encode(rand::random::<[u8; 48]>()),
        kdf: "argon2id".into(),
        kdf_params: kdf_params(),
        wrapped_secret: Some(Some(fake_envelope())),
        wrap_algorithm: Some(Some("RSA-OAEP-256".into())),
    }
}

pub fn to_json<T: serde::Serialize>(value: &T) -> Value {
    serde_json::to_value(value).expect("serializable")
}

/// Stalwart limits concurrent JMAP requests per account, every backend provisions through one shared account, and only Rust resends what the limit refuses.
static PROVISIONING: AtomicBool = AtomicBool::new(false);
const STALWART_BUSY: &str = "Stalwart admin JMAP request failed with status 400.";

pub struct ProvisioningTurn;

impl Drop for ProvisioningTurn {
    fn drop(&mut self) {
        PROVISIONING.store(false, Ordering::Release);
    }
}

/// Serializes this suite's provisioning on TypeScript so it does not trip that limit itself.
pub async fn provisioning_turn(app: &TestApp) -> Option<ProvisioningTurn> {
    if app.backend == Backend::Rust {
        return None;
    }
    while PROVISIONING
        .compare_exchange(false, true, Ordering::Acquire, Ordering::Relaxed)
        .is_err()
    {
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    Some(ProvisioningTurn)
}

/// Whether TypeScript answered with Stalwart refusing a provisioning call under load (other backends share the account).
fn stalwart_busy(app: &TestApp, response: &ApiResponse) -> bool {
    app.backend == Backend::TypeScript
        && matches!(response.status.as_u16(), 400 | 503)
        && response
            .value()
            .is_ok_and(|body| body["message"] == json!(STALWART_BUSY))
}

/// `POST /api/mail/account/bootstrap`, retried on TypeScript while Stalwart is busy; call it holding a [`ProvisioningTurn`].
pub async fn bootstrap(
    app: &TestApp,
    user: &mut TestUser,
    request: &MailBootstrapRequest,
) -> ApiResponse {
    let mut attempt = 0;
    loop {
        let response = user
            .post("/api/mail/account/bootstrap", to_json(request))
            .await;
        attempt += 1;
        if !stalwart_busy(app, &response) || attempt == 8 {
            return response;
        }
        tokio::time::sleep(Duration::from_millis(250 * attempt)).await;
    }
}

/// Bootstraps the user's mailbox, sets its bridge password so the backend's first login is not a failed one, and warms the mail token.
pub async fn provision(
    app: &TestApp,
    user: &mut TestUser,
    request: &MailBootstrapRequest,
) -> MailSignup {
    let _turn = provisioning_turn(app).await;
    let signup: MailSignup = ok(bootstrap(app, user, request)
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    set_bridge_password(app, &signup.stalwart_account_id.0, &user.id, &user.email).await;
    access_token(app, user).await;
    signup
}

/// A fresh invited user with a provisioned mailbox.
pub async fn mailbox(app: &TestApp) -> Mailbox {
    let mut user = app.user().await;
    let signup = provision(
        app,
        &mut user,
        &bootstrap_request(rand::random::<u8>().into()),
    )
    .await;
    Mailbox { user, signup }
}

const STALWART_ADMIN: [&str; 2] = ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"];

/// Stalwart's failed-login ban counts every rejected bridge login against the backend's address, so tests avoid them.
pub async fn set_bridge_password(app: &TestApp, account_id: &str, user_id: &str, email: &str) {
    let secret = bridge_secret(&app.env.mail_bridge_hmac_key, user_id, email);
    let reply = app
        .stalwart_admin(
            &STALWART_ADMIN,
            json!([["x:Account/set", {"update": {account_id: {"credentials/0": {
                "@type": "Password", "secret": secret, "expiresAt": null, "allowedIps": {}
            }}}}, "p"]]),
        )
        .await;
    assert!(
        reply["methodResponses"][0][1]["updated"]
            .get(account_id)
            .is_some(),
        "bridge password set: {reply}"
    );
}

/// `deriveMailBridgeSecret`: HMAC-SHA-256 of `userId:email:mail-bridge:v1`, keyed by the leniently base64-decoded bridge key.
pub fn bridge_secret(hmac_key: &str, user_id: &str, email: &str) -> String {
    let key = lenient_base64(hmac_key.trim());
    let message = format!("{user_id}:{}:mail-bridge:v1", email.trim().to_lowercase());
    URL_SAFE_NO_PAD.encode(hmac_sha256(&key, message.as_bytes()))
}

/// Node and Bun `Buffer.from(s, "base64")`: both alphabets, other characters skipped, stops at `=`, leftover bits dropped.
pub fn lenient_base64(input: &str) -> Vec<u8> {
    let mut normalized: String = input
        .chars()
        .take_while(|c| *c != '=')
        .filter_map(|c| match c {
            '-' => Some('+'),
            '_' => Some('/'),
            c if c.is_ascii_alphanumeric() || c == '+' || c == '/' => Some(c),
            _ => None,
        })
        .collect();
    if normalized.len() % 4 == 1 {
        normalized.pop();
    }
    let lenient = GeneralPurpose::new(
        &alphabet::STANDARD,
        GeneralPurposeConfig::new()
            .with_decode_allow_trailing_bits(true)
            .with_decode_padding_mode(DecodePaddingMode::RequireNone),
    );
    lenient.decode(normalized).expect("normalized base64")
}

pub fn hmac_sha256(key: &[u8], message: &[u8]) -> Vec<u8> {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("HMAC accepts any key length");
    mac.update(message);
    mac.finalize().into_bytes().to_vec()
}

/// The Stalwart account as its admin sees it, or `None` once it is gone.
pub async fn stalwart_account(app: &TestApp, account_id: &str) -> Option<Value> {
    let reply = app
        .stalwart_admin(
            &STALWART_ADMIN,
            json!([["x:Account/get", {"ids": [account_id], "properties": ["id", "name", "emailAddress", "encryptionAtRest"]}, "a"]]),
        )
        .await;
    reply["methodResponses"][0][1]["list"].get(0).cloned()
}

/// `GET /api/mail/oauth/access-token`, retried on TypeScript while Stalwart is busy: a first mint makes admin calls.
pub async fn access_token(app: &TestApp, user: &mut TestUser) -> MailAccessToken {
    let mut attempt = 0;
    loop {
        let response = user.get("/api/mail/oauth/access-token").await;
        attempt += 1;
        if !stalwart_busy(app, &response) || attempt == 8 {
            return ok(response.expect_status(200).and_then(|r| r.dto()));
        }
        tokio::time::sleep(Duration::from_millis(250 * attempt)).await;
    }
}

/// The arguments of the method response with this call id.
pub fn method<'a>(envelope: &'a Value, call_id: &str) -> &'a Value {
    envelope["methodResponses"]
        .as_array()
        .and_then(|responses| responses.iter().find(|r| r[2] == json!(call_id)))
        .map(|response| &response[1])
        .unwrap_or_else(|| panic!("no method response {call_id}: {envelope}"))
}

pub async fn sync(user: &mut TestUser, account_id: &str) -> MailSyncResult {
    ok(user
        .get(&format!("/api/mail/sync?accountId={account_id}"))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()))
}

impl Mailbox {
    pub fn account_id(&self) -> &str {
        &self.signup.stalwart_account_id.0
    }

    /// JMAP through the backend proxy, authorized by the session alone.
    pub async fn jmap(&mut self, method_calls: Value) -> Value {
        ok(self
            .user
            .post(
                "/api/mail/jmap/jmap/",
                json!({"using": JMAP_MAIL, "methodCalls": method_calls}),
            )
            .await
            .expect_status(200)
            .and_then(|r| r.value()))
    }

    pub async fn mailbox_id(&mut self, role: &str) -> String {
        let account = self.account_id().to_owned();
        let reply = self
            .jmap(
                json!([["Mailbox/get", {"accountId": account, "properties": ["id", "role"]}, "m"]]),
            )
            .await;
        method(&reply, "m")["list"]
            .as_array()
            .and_then(|list| list.iter().find(|m| m["role"] == json!(role)))
            .and_then(|m| m["id"].as_str())
            .unwrap_or_else(|| panic!("no {role} mailbox: {reply}"))
            .to_owned()
    }

    /// Submits a plain-text mail from this mailbox; returns the sender's copy.
    pub async fn send(&mut self, to: &str, subject: &str) -> String {
        let account = self.account_id().to_owned();
        let drafts = self.mailbox_id("drafts").await;
        let identities = self
            .jmap(json!([["Identity/get", {"accountId": account}, "i"]]))
            .await;
        let identity = method(&identities, "i")["list"][0]["id"].clone();
        let reply = self
            .jmap(json!([
                ["Email/set", {"accountId": account, "create": {"draft": {
                    "mailboxIds": {drafts: true},
                    "keywords": {"$draft": true, "$seen": true},
                    "from": [{"email": self.user.email}],
                    "to": [{"email": to}],
                    "subject": subject,
                    "bodyValues": {"t": {"value": "Sent by the API suite."}},
                    "textBody": [{"partId": "t", "type": "text/plain"}],
                }}}, "e"],
                ["EmailSubmission/set", {"accountId": account, "create": {"send": {"identityId": identity, "emailId": "#draft"}}}, "s"],
            ]))
            .await;
        assert!(
            method(&reply, "s")["created"].get("send").is_some(),
            "submitted: {reply}"
        );
        method(&reply, "e")["created"]["draft"]["id"]
            .as_str()
            .expect("draft id")
            .to_owned()
    }

    /// Stores a message straight into one of this account's mailboxes, as a client appending it would.
    pub async fn append(&mut self, role: &str, mut email: Value) -> String {
        let account = self.account_id().to_owned();
        let target = self.mailbox_id(role).await;
        email["mailboxIds"] = json!({target: true});
        let reply = self
            .jmap(json!([["Email/set", {"accountId": account, "create": {"m": email}}, "e"]]))
            .await;
        method(&reply, "e")["created"]["m"]["id"]
            .as_str()
            .unwrap_or_else(|| panic!("appended: {reply}"))
            .to_owned()
    }

    /// Waits until a message with this subject is in the inbox; returns its id.
    pub async fn wait_for_inbox(&mut self, subject: &str) -> String {
        let account = self.account_id().to_owned();
        let inbox = self.mailbox_id("inbox").await;
        for _ in 0..100 {
            let reply = self
                .jmap(json!([["Email/query", {"accountId": account, "filter": {"inMailbox": inbox, "subject": subject}}, "q"]]))
                .await;
            if let Some(id) = method(&reply, "q")["ids"][0].as_str() {
                return id.to_owned();
            }
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
        panic!("no delivery of {subject:?} to {}", self.user.email);
    }
}

pub fn unique_subject(label: &str) -> String {
    format!("{label} {}", hex(6))
}

/// Stalwart's `X-Signature`: base64 HMAC-SHA-256 of the raw body.
pub fn webhook_signature(secret: &str, body: &[u8]) -> String {
    STANDARD.encode(hmac_sha256(secret.as_bytes(), body))
}

/// Posts a raw webhook body as Stalwart would, from a fresh documentation-range address.
pub async fn post_webhook(app: &TestApp, body: &[u8], signature: Option<&str>) -> ApiResponse {
    post_webhook_from(app, &format!("2001:db8:5::{}", hex(2)), body, signature).await
}

pub async fn post_webhook_from(
    app: &TestApp,
    address: &str,
    body: &[u8],
    signature: Option<&str>,
) -> ApiResponse {
    let mut request = reqwest::Client::new()
        .post(format!("{}/api/internal/stalwart/webhook", app.base_url))
        .header("content-type", "application/json")
        .header("x-forwarded-for", address)
        .body(body.to_vec());
    if let Some(signature) = signature {
        request = request.header("X-Signature", signature);
    }
    let response = request.send().await.expect("webhook request");
    let status = response.status();
    let headers = response.headers().clone();
    let body = response.bytes().await.expect("webhook body").to_vec();
    ApiResponse {
        status,
        headers,
        body,
    }
}

/// A correctly signed webhook post.
pub async fn post_signed(app: &TestApp, payload: &Value) -> ApiResponse {
    let body = serde_json::to_vec(payload).expect("payload");
    let signature = webhook_signature(&app.env.stalwart_webhook_secret, &body);
    post_webhook(app, &body, Some(&signature)).await
}

/// One row as JSON, from a query whose single column is `to_jsonb(...)`.
pub async fn row_json(db: &sqlx::PgPool, sql: &str, bind: &str) -> Value {
    let text: String = sqlx::query_scalar(&format!("SELECT row::text FROM ({sql}) AS q(row)"))
        .bind(bind)
        .fetch_one(db)
        .await
        .unwrap_or_else(|e| panic!("{sql}: {e}"));
    serde_json::from_str(&text).expect("row JSON")
}

/// Expected values computed with Bun, which runs the TypeScript backend.
#[test]
fn bridge_secrets_match_the_typescript_derivation() {
    let cases: [(&str, &[u8]); 10] = [
        ("ab$cd", &[0x69, 0xb7, 0x1d]),
        ("a b-c_d", &[0x69, 0xbf, 0x9c, 0xfd]),
        ("QUJD=RA==", b"ABC"),
        ("QU\nJD", b"ABC"),
        ("Zm9v.YmFy", b"foobar"),
        ("Q", b""),
        ("QQ", b"A"),
        ("QUI", b"AB"),
        ("-_-_", &[0xfb, 0xff, 0xbf]),
        ("Zm9vYg==Zm9v", b"foob"),
    ];
    for (input, expected) in cases {
        assert_eq!(lenient_base64(input), expected, "{input:?}");
    }
    assert_eq!(
        bridge_secret(
            "solace-test-mail-bridge-hmac-local-0001",
            "ar4Ag8MmriHudJFR5kZyWvOB0VqoiWSy",
            " Probe4@solace.test"
        ),
        "6ANM1pRRqlml0QlZnkIJh5Pt_0zbBzvmSgmd71DtVH4"
    );
}
