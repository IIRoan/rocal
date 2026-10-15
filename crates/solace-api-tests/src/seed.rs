//! Synthetic test data created through a running backend, so auth rows are exactly what that backend writes.

use std::path::Path;

use base64::Engine;
use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sqlx::{Connection, PgConnection};

use crate::client::{Agent, ClientKind};
use crate::webauthn::SoftPasskey;
use crate::{Error, Result};

const SEED_USERS: [(&str, &str); 3] = [
    ("alice", "Alice Test"),
    ("bob", "Bob Test"),
    ("carol", "Carol Test"),
];
const ROOT_USER_ID: &str = "seedroot000000000000000000";

/// What a later run needs to act as the seeded users: credentials, cookies, passkeys and ids.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeedManifest {
    pub api_base_url: String,
    pub origin: String,
    pub users: Vec<SeededUser>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeededUser {
    pub id: String,
    pub email: String,
    pub name: String,
    pub password: String,
    /// Session cookies issued by the seeding backend, one per sign-in.
    pub session_cookies: Vec<(String, String)>,
    pub passkey: Option<SoftPasskey>,
    pub calendar_ids: Vec<String>,
    pub event_ids: Vec<String>,
    pub has_mailbox: bool,
}

pub struct SeedConfig<'a> {
    pub api_base_url: &'a str,
    pub origin: &'a str,
    pub database_url: &'a str,
    pub mail_domain: &'a str,
    pub fixtures_dir: &'a Path,
}

pub async fn seed(config: &SeedConfig<'_>) -> Result<SeedManifest> {
    let mut db = PgConnection::connect(config.database_url).await?;
    let invite_tokens = insert_root_and_invites(&mut db).await?;

    let mut users = Vec::new();
    for (index, ((handle, name), token)) in SEED_USERS.iter().zip(invite_tokens).enumerate() {
        let email = format!("{handle}@{}", config.mail_domain);
        let password = format!("solace-test-{handle}-password");
        let mut agent = Agent::new(config.api_base_url, config.origin, ClientKind::Browser)?;

        agent
            .post(
                "/api/account/invite/claim",
                json!({"token": token, "chosenEmail": email}),
            )
            .await?
            .expect_status(200)?;
        let signed_up = agent
            .post(
                "/api/auth/sign-up/email",
                json!({"email": email, "password": password, "name": name}),
            )
            .await?
            .expect_status(200)?
            .value()?;
        let id = signed_up["user"]["id"]
            .as_str()
            .ok_or_else(|| Error::Unexpected(format!("sign-up returned no user id: {signed_up}")))?
            .to_owned();

        let mut user = SeededUser {
            id,
            email: email.clone(),
            name: (*name).to_owned(),
            password: password.clone(),
            session_cookies: session_cookies(&agent),
            passkey: None,
            calendar_ids: Vec::new(),
            event_ids: Vec::new(),
            has_mailbox: false,
        };

        // A second session from a separate sign-in, as a second device would have.
        let mut second = Agent::new(config.api_base_url, config.origin, ClientKind::Browser)?;
        second
            .post(
                "/api/auth/sign-in/email",
                json!({"email": email, "password": password}),
            )
            .await?
            .expect_status(200)?;
        user.session_cookies.extend(session_cookies(&second));

        if index < 2 {
            user.passkey = Some(register_passkey(&mut agent, config.origin, index == 1).await?);
        }
        seed_e2ee(&mut agent).await?;
        seed_calendar_data(&mut agent, &mut user).await?;
        seed_settings_and_push(&mut agent, index).await?;
        if index == 0 {
            let image = STANDARD.encode(std::fs::read(config.fixtures_dir.join("avatar.png"))?);
            agent
                .put("/api/profiles/me/avatar", json!({"image": image}))
                .await?
                .expect_status(200)?;
        }
        if index < 2 {
            bootstrap_mailbox(&mut agent, config.fixtures_dir, index + 1).await?;
            user.has_mailbox = true;
        }
        users.push(user);
    }

    // Alice signs in with her passkey (which also passes step-up), invites someone outside Solace and invites Bob to an event.
    let mut agent = Agent::new(config.api_base_url, config.origin, ClientKind::Browser)?;
    let passkey = users[0]
        .passkey
        .as_mut()
        .ok_or_else(|| Error::Unexpected("alice has no passkey".into()))?;
    passkey_sign_in(&mut agent, passkey, config.origin).await?;
    users[0].session_cookies.extend(session_cookies(&agent));
    let alice = &users[0];
    agent
        .post("/api/invites", json!({"email": "dave@example.com"}))
        .await?
        .expect_status(200)?;
    let calendar_id = alice.calendar_ids.first().cloned().unwrap_or_default();
    agent
        .post(
            "/api/events",
            json!({
                "start": "2026-11-02T09:00:00.000Z",
                "end": "2026-11-02T10:00:00.000Z",
                "calendarId": calendar_id,
                "timezone": "Europe/Amsterdam",
                "encryptedContent": fake_envelope(),
                "blindIndexTokens": [fake_token(), fake_token()],
                "encryptionKeyVersion": 1,
                "participants": [{"email": users[1].email, "role": "attendee"}],
                "invitationContent": {"title": "Planning sync"},
            }),
        )
        .await?
        .expect_status(200)?;

    Ok(SeedManifest {
        api_base_url: config.api_base_url.to_owned(),
        origin: config.origin.to_owned(),
        users,
    })
}

/// Sign-up is invite-gated, so a credential-less root user sends the first invites directly in the database.
async fn insert_root_and_invites(db: &mut PgConnection) -> Result<Vec<String>> {
    sqlx::query(
        "INSERT INTO \"user\" (id, name, email, email_verified, created_at, updated_at) \
         VALUES ($1, 'Seed Root', 'root@example.com', true, now(), now()) ON CONFLICT DO NOTHING",
    )
    .bind(ROOT_USER_ID)
    .execute(&mut *db)
    .await?;
    let mut tokens = Vec::new();
    for (handle, _) in SEED_USERS {
        let token = URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>());
        insert_invite(
            &mut *db,
            &format!("seedinvite{handle}{}", hex(8)),
            &token,
            ROOT_USER_ID,
            &format!("{handle}@example.com"),
        )
        .await?;
        tokens.push(token);
    }
    Ok(tokens)
}

/// A pending invite with this token from `inviter`, written straight to the database.
pub async fn insert_invite<'e>(
    db: impl sqlx::PgExecutor<'e>,
    id: &str,
    token: &str,
    inviter: &str,
    email: &str,
) -> Result<()> {
    sqlx::query(
        "INSERT INTO invite (id, token, invited_by_id, email, status, expires_at, created_at, updated_at) \
         VALUES ($1, $2, $3, $4, 'pending', now() + interval '7 days', now(), now())",
    )
    .bind(id)
    .bind(token)
    .bind(inviter)
    .bind(email)
    .execute(db)
    .await?;
    Ok(())
}

/// Alice's passkey is a single-device key with a counter; Bob's is a synced one like iCloud Keychain's.
async fn register_passkey(agent: &mut Agent, origin: &str, synced: bool) -> Result<SoftPasskey> {
    let rp_id = url::Url::parse(origin)
        .ok()
        .and_then(|url| url.host_str().map(str::to_owned))
        .unwrap_or_else(|| "localhost".into());
    let mut passkey = if synced {
        SoftPasskey::new_synced(&rp_id)?
    } else {
        SoftPasskey::new(&rp_id)?
    };
    let options = agent
        .get("/api/auth/passkey/generate-register-options")
        .await?
        .expect_status(200)?
        .value()?;
    let response = passkey.register(&options, origin)?;
    agent
        .post(
            "/api/auth/passkey/verify-registration",
            json!({"response": response, "name": "Seed passkey"}),
        )
        .await?
        .expect_status(200)?;
    Ok(passkey)
}

pub async fn passkey_sign_in(
    agent: &mut Agent,
    passkey: &mut SoftPasskey,
    origin: &str,
) -> Result<Value> {
    let options = agent
        .get("/api/auth/passkey/generate-authenticate-options")
        .await?
        .expect_status(200)?
        .value()?;
    let response = passkey.authenticate(&options, origin)?;
    agent
        .post(
            "/api/auth/passkey/verify-authentication",
            json!({"response": response}),
        )
        .await?
        .expect_status(200)?
        .value()
}

async fn seed_e2ee(agent: &mut Agent) -> Result<()> {
    agent
        .put(
            "/api/e2ee/device",
            json!({
                "deviceId": format!("seed-device-{}", hex(6)),
                "deviceLabel": "Seed device",
                "publicKey": fake_blob(550),
                "publicKeyAlgorithm": "RSA-OAEP-256",
                "wrappedAccountKey": fake_blob(512),
                "wrappedSearchKey": fake_blob(512),
                "wrapAlgorithm": "RSA-OAEP-256",
                "keyVersion": 1,
            }),
        )
        .await?
        .expect_status(200)?;
    agent
        .put(
            "/api/e2ee/password",
            json!({
                "kdfAlgorithm": "PBKDF2-SHA-256",
                "kdfSalt": fake_blob(16),
                "kdfIterations": 310_000,
                "wrappedAccountKey": fake_blob(60),
                "wrappedSearchKey": fake_blob(60),
                "wrapAlgorithm": "AES-GCM-256",
                "keyVersion": 1,
            }),
        )
        .await?
        .expect_status(200)?;
    Ok(())
}

async fn seed_calendar_data(agent: &mut Agent, user: &mut SeededUser) -> Result<()> {
    let created = agent
        .post(
            "/api/calendars",
            json!({
                "color": "#4f46e5",
                "encryptedName": fake_envelope(),
                "blindIndexTokens": [fake_token()],
                "encryptionKeyVersion": 1,
            }),
        )
        .await?
        .expect_status(200)?
        .value()?;
    let calendar_id = id_of(&created)?;
    user.calendar_ids.push(calendar_id.clone());
    agent
        .post(
            "/api/categories",
            json!({"color": "#16a34a", "encryptedName": fake_envelope(), "blindIndexTokens": [fake_token()], "encryptionKeyVersion": 1}),
        )
        .await?
        .expect_status(200)?;

    let events = [
        json!({"start": "2026-11-03T08:00:00.000Z", "end": "2026-11-03T09:00:00.000Z", "reminder": 15}),
        json!({"start": "2026-11-04T00:00:00.000Z", "end": "2026-11-05T00:00:00.000Z", "allDay": true}),
        json!({"start": "2026-11-05T12:00:00.000Z", "end": "2026-11-05T12:30:00.000Z", "recurrence": r#"{"frequency":"weekly","interval":1,"count":6}"#}),
    ];
    for mut event in events {
        if let Some(fields) = event.as_object_mut() {
            fields.insert("calendarId".into(), json!(calendar_id));
            fields.insert("timezone".into(), json!("Europe/Amsterdam"));
            fields.insert("encryptedContent".into(), json!(fake_envelope()));
            fields.insert(
                "blindIndexTokens".into(),
                json!([fake_token(), fake_token()]),
            );
            fields.insert("encryptionKeyVersion".into(), json!(1));
        }
        let created = agent
            .post("/api/events", event)
            .await?
            .expect_status(200)?
            .value()?;
        user.event_ids.push(id_of(&created)?);
    }

    let reminder_event = user.event_ids.first().cloned().unwrap_or_default();
    agent
        .put(
            &format!("/api/notifications/event/{reminder_event}"),
            json!({
                "notifications": [
                    {"notificationType": "email", "minutesBefore": 30, "isEnabled": true},
                    {"notificationType": "browser", "minutesBefore": 10, "isEnabled": true},
                ],
                "encryptedDisplayTitle": format!("v1.{}.{}", fake_b64url(12), fake_b64url(40)),
            }),
        )
        .await?
        .expect_status(200)?;
    Ok(())
}

async fn seed_settings_and_push(agent: &mut Agent, index: usize) -> Result<()> {
    agent
        .put(
            "/api/settings",
            json!({"timezone": "Europe/Amsterdam", "weekStartDay": 1, "defaultView": "week"}),
        )
        .await?
        .expect_status(200)?;
    let bundle = if index == 0 {
        "onl.solace.calendar"
    } else {
        "onl.solace.mail"
    };
    agent
        .put(
            "/api/push/devices",
            json!({"token": hex(32), "platform": "ios", "bundleId": bundle, "environment": "sandbox"}),
        )
        .await?
        .expect_status(200)?;
    Ok(())
}

async fn bootstrap_mailbox(agent: &mut Agent, fixtures_dir: &Path, key: usize) -> Result<()> {
    let keys: Value = serde_json::from_str(&std::fs::read_to_string(
        fixtures_dir.join("pgp/keys.json"),
    )?)?;
    let entry = &keys[key - 1];
    let file = entry["file"].as_str().unwrap_or_default();
    let armored = std::fs::read_to_string(fixtures_dir.join("pgp").join(file))?;
    agent
        .post(
            "/api/mail/account/bootstrap",
            json!({
                "publicKeyArmored": armored,
                "fingerprint": entry["fingerprint"],
                "algorithm": entry["algorithm"],
                "createdAt": entry["createdAt"],
                "vaultVersion": 1,
                "encryptedVaultB64": fake_blob(800),
                "kdf": "argon2id",
                "kdfParams": {"saltB64": fake_blob(16), "memoryKiB": 65536, "iterations": 3, "parallelism": 1},
                "wrappedSecret": fake_envelope(),
                "wrapAlgorithm": "AES-GCM-256",
            }),
        )
        .await?
        .expect_status(200)?;
    Ok(())
}

fn session_cookies(agent: &Agent) -> Vec<(String, String)> {
    agent
        .cookies()
        .iter()
        .filter(|(name, _)| name.ends_with("session_token"))
        .map(|(name, value)| (name.clone(), value.clone()))
        .collect()
}

fn id_of(value: &Value) -> Result<String> {
    value["id"]
        .as_str()
        .map(str::to_owned)
        .ok_or_else(|| Error::Unexpected(format!("response has no id: {value}")))
}

/// An AES-GCM envelope of random bytes: shaped like real client ciphertext, decrypts to nothing.
pub fn fake_envelope() -> String {
    json!({
        "version": 1,
        "algorithm": "AES-GCM",
        "iv": STANDARD.encode(rand::random::<[u8; 12]>()),
        "ciphertext": fake_blob(96),
    })
    .to_string()
}

pub fn fake_token() -> String {
    fake_b64url(32)
}

fn fake_blob(len: usize) -> String {
    let bytes: Vec<u8> = (0..len).map(|_| rand::random::<u8>()).collect();
    STANDARD.encode(bytes)
}

fn fake_b64url(len: usize) -> String {
    let bytes: Vec<u8> = (0..len).map(|_| rand::random::<u8>()).collect();
    URL_SAFE_NO_PAD.encode(bytes)
}

/// `len` random bytes as lowercase hex.
pub fn hex(len: usize) -> String {
    (0..len)
        .map(|_| format!("{:02x}", rand::random::<u8>()))
        .collect()
}
