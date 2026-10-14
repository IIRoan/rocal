//! `DELETE /api/account` removes every row, mailbox and avatar object the user owns; plus the public sign-up helpers under `/api/account`.

use std::collections::{BTreeMap, BTreeSet};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde_json::{Value, json};
use solace_api_tests::client::Agent;
use solace_api_tests::seed::{fake_envelope, fake_token, passkey_sign_in};
use solace_api_tests::webauthn::SoftPasskey;
use solace_api_types::Timestamp;
use solace_api_types::account::{
    AuthStatus, DeleteAccountResponse, EmailAvailability, EmailAvailabilityCode, SignupConfig,
};
use solace_api_types::subscriptions::{
    EncryptedIcsEvent, EncryptedIcsImportRequest, ImportIcsRequest, ImportParticipant,
};
use sqlx::PgPool;

use crate::helpers::{
    TestApp, TestUser, expect_invalid, expect_unauthorized, expect_unknown_field, fixture, hex,
    json_body, ok,
};
use crate::profiles::{stored_objects_exist, upload_fixture};

/// `(table, id)` of a database row.
type RowKey = (String, Option<String>);

async fn tables(db: &PgPool) -> Vec<String> {
    sqlx::query_scalar(
        "SELECT table_name::text FROM information_schema.tables \
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations' ORDER BY 1",
    )
    .fetch_all(db)
    .await
    .expect("table list")
}

/// Every row in any table whose text mentions one of the needles, with its full text.
async fn rows_mentioning(db: &PgPool, needles: &BTreeSet<String>) -> BTreeMap<RowKey, String> {
    let needles: Vec<&String> = needles.iter().collect();
    let mut rows = BTreeMap::new();
    for table in tables(db).await {
        let found: Vec<(Option<String>, String)> = sqlx::query_as(&format!(
            "SELECT to_jsonb(x)->>'id', x::text FROM \"{table}\" x \
             WHERE EXISTS (SELECT 1 FROM unnest($1::text[]) n WHERE strpos(x::text, n) > 0)"
        ))
        .bind(&needles)
        .fetch_all(db)
        .await
        .expect("scan table");
        for (id, text) in found {
            rows.insert((table.clone(), id), text);
        }
    }
    rows
}

/// The rows a user owns: everything mentioning their id or email, then everything mentioning those rows.
async fn owned_rows(db: &PgPool, user: &TestUser) -> (BTreeSet<String>, BTreeMap<RowKey, String>) {
    let mut needles = BTreeSet::from([user.id.clone(), user.email.clone()]);
    loop {
        let rows = rows_mentioning(db, &needles).await;
        let before = needles.len();
        needles.extend(rows.keys().filter_map(|(_, id)| id.clone()));
        if needles.len() == before {
            return (needles, rows);
        }
    }
}

/// The deleted user's own row ids are needles too, so a row is "found" if anything still points at it.
async fn remaining(db: &PgPool, needles: &BTreeSet<String>) -> BTreeSet<RowKey> {
    rows_mentioning(db, needles).await.into_keys().collect()
}

async fn admin_jmap(app: &TestApp, method_calls: Value) -> Value {
    let mut request = reqwest::Client::new()
        .post(format!("{}/jmap/", app.env.stalwart_url))
        .basic_auth("admin", Some(&app.env.stalwart_admin_password));
    if let Some(key) = &app.env.stalwart_gate_key {
        request = request.header("X-Solace-Gate", key);
    }
    request
        .json(&json!({
            "using": ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"],
            "methodCalls": method_calls,
        }))
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .expect("test Stalwart admin JMAP")
        .json()
        .await
        .expect("JMAP response")
}

async fn stalwart_account_exists(app: &TestApp, account_id: &str) -> bool {
    let response = admin_jmap(
        app,
        json!([["x:Account/get", {"ids": [account_id], "properties": ["name"]}, "g"]]),
    )
    .await;
    let result = &response["methodResponses"][0][1];
    match (result["list"].as_array(), result["notFound"].as_array()) {
        (Some(list), _) if list.iter().any(|a| a["id"] == json!(account_id)) => true,
        (_, Some(missing)) if missing.contains(&json!(account_id)) => false,
        _ => panic!("unexpected x:Account/get answer: {response}"),
    }
}

/// Provisions the user's Stalwart mailbox the way the apps do; the PGP fixtures may be shared between users.
async fn bootstrap_mailbox(app: &TestApp, user: &mut TestUser) -> String {
    let keys: Value = serde_json::from_slice(&fixture("pgp/keys.json")).expect("pgp fixture index");
    let entry = &keys[rand::random_range(0..4usize)];
    let armored = String::from_utf8(fixture(&format!(
        "pgp/{}",
        entry["file"].as_str().expect("key file")
    )))
    .expect("armored key");
    ok(user
        .post(
            "/api/mail/account/bootstrap",
            json!({
                "publicKeyArmored": armored,
                "fingerprint": entry["fingerprint"],
                "algorithm": entry["algorithm"],
                "createdAt": entry["createdAt"],
                "vaultVersion": 1,
                "encryptedVaultB64": fake_envelope(),
                "kdf": "argon2id",
                "kdfParams": {"saltB64": "c2FsdHNhbHRzYWx0c2FsdA==", "memoryKiB": 65536, "iterations": 3, "parallelism": 1},
                "wrappedSecret": fake_envelope(),
                "wrapAlgorithm": "AES-GCM-256",
            }),
        )
        .await
        .expect_status(200));
    sqlx::query_scalar("SELECT stalwart_account_id FROM mail_directory_entry WHERE user_id = $1")
        .bind(&user.id)
        .fetch_one(&app.db)
        .await
        .expect("directory entry")
}

/// An agent holding only the session token, so the check reads the session row instead of the 5-minute cookie cache.
fn session_token_only(agent: &Agent) -> Agent {
    let mut stripped = agent.clone();
    let token: Vec<(String, String)> = agent
        .cookies()
        .iter()
        .filter(|(name, _)| name.ends_with("session_token"))
        .map(|(name, value)| (name.clone(), value.clone()))
        .collect();
    stripped.clear_cookies();
    for (name, value) in token {
        stripped.set_cookie(&name, &value);
    }
    stripped
}

async fn owned_calendar(user: &mut TestUser, name: &str) -> String {
    let created = ok(user
        .post("/api/calendars", json!({"name": name, "color": "#3b82f6"}))
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    created["id"].as_str().expect("calendar id").to_owned()
}

fn encrypted_event(external_id: &str, start: &str, end: &str) -> EncryptedIcsEvent {
    EncryptedIcsEvent {
        external_id: external_id.into(),
        series_external_id: None,
        occurrence_date: None,
        excluded_dates: None,
        start: Timestamp(start.into()),
        end: Timestamp(end.into()),
        all_day: false,
        timezone: "Europe/Amsterdam".into(),
        recurrence: None,
        encrypted_content: fake_envelope(),
        blind_index_tokens: Some(vec![fake_token()]),
        encryption_key_version: None,
        participants: None,
    }
}

async fn import(user: &mut TestUser, calendar_id: &str, events: Vec<EncryptedIcsEvent>) {
    ok(user
        .post(
            "/api/subscriptions/import-ics",
            json_body(&ImportIcsRequest::Encrypted(EncryptedIcsImportRequest {
                calendar_id: calendar_id.to_owned().into(),
                encrypted_events: events,
            })),
        )
        .await
        .expect_status(200));
}

async fn event_id(db: &PgPool, calendar_id: &str, external_id: &str) -> String {
    sqlx::query_scalar("SELECT id FROM calendar_event WHERE calendar_id = $1 AND external_id = $2")
        .bind(calendar_id)
        .bind(external_id)
        .fetch_one(db)
        .await
        .expect("event id")
}

async fn exec(db: &PgPool, sql: &str, binds: &[&str]) {
    let mut query = sqlx::query(sql);
    for bind in binds {
        query = query.bind(*bind);
    }
    query.execute(db).await.expect(sql);
}

/// Fills an account the way real use does: calendar data, reminders, devices, keys, feeds, mailbox, avatar and auth rows.
async fn fill_account(app: &TestApp, user: &mut TestUser) -> String {
    let db = &app.db;
    ok(user
        .put(
            "/api/settings",
            json!({"timezone": "Europe/Amsterdam", "weekStartDay": 1}),
        )
        .await
        .expect_status(200));
    let calendar = owned_calendar(user, "Work").await;
    ok(user
        .post(
            "/api/categories",
            json!({"color": "#16a34a", "encryptedName": fake_envelope(), "blindIndexTokens": [fake_token()], "encryptionKeyVersion": 1}),
        )
        .await
        .expect_status(200));
    let mut series = encrypted_event(
        "series",
        "2026-11-02T09:00:00.000Z",
        "2026-11-02T10:00:00.000Z",
    );
    series.recurrence = Some(r#"{"frequency":"daily","interval":1,"count":5}"#.into());
    series.excluded_dates = Some(vec![Timestamp("2026-11-03T09:00:00.000Z".into())]);
    let mut moved = encrypted_event(
        "moved",
        "2026-11-04T11:00:00.000Z",
        "2026-11-04T12:00:00.000Z",
    );
    moved.series_external_id = Some("series".into());
    moved.occurrence_date = Some(Timestamp("2026-11-04T09:00:00.000Z".into()));
    moved.participants = Some(vec![ImportParticipant {
        email: "guest@example.com".into(),
        display_name: Some("Guest".into()),
        role: None,
        status: None,
    }]);
    import(user, &calendar, vec![series, moved]).await;
    let series_id = event_id(db, &calendar, "series").await;
    ok(user
        .put(
            &format!("/api/notifications/event/{series_id}"),
            json!({
                "notifications": [{"notificationType": "email", "minutesBefore": 30, "isEnabled": true}],
                "encryptedDisplayTitle": format!(
                    "v1.{}.{}",
                    URL_SAFE_NO_PAD.encode(rand::random::<[u8; 12]>()),
                    URL_SAFE_NO_PAD.encode(rand::random::<[u8; 40]>())
                ),
            }),
        )
        .await
        .expect_status(200));
    ok(user
        .put(
            "/api/push/devices",
            json!({"token": hex(32), "platform": "ios", "bundleId": "onl.solace.calendar", "environment": "sandbox"}),
        )
        .await
        .expect_status(200));
    ok(user
        .post("/api/push/test", json!({}))
        .await
        .expect_status(200));
    ok(user
        .put(
            "/api/e2ee/device",
            json!({"deviceId": format!("device-{}", hex(4)), "publicKey": fake_token(), "wrappedAccountKey": fake_token(), "wrappedSearchKey": fake_token()}),
        )
        .await
        .expect_status(200));
    ok(user
        .put(
            "/api/e2ee/password",
            json!({"kdfSalt": fake_token(), "wrappedAccountKey": fake_token(), "wrappedSearchKey": fake_token()}),
        )
        .await
        .expect_status(200));
    ok(user
        .put(
            "/api/recent-contacts",
            json!({"encryptedContent": fake_envelope()}),
        )
        .await
        .expect_status(200));
    ok(user
        .put(
            "/api/mail-settings",
            json!({"encryptedContent": fake_envelope()}),
        )
        .await
        .expect_status(200));
    let feed_calendar = format!("suitecal{}", hex(8));
    let feed = format!("suitesub{}", hex(8));
    exec(
        db,
        "INSERT INTO calendar (id, name, color, kind, is_sync_only, user_id, created_at, updated_at) \
         VALUES ($1, 'Feed', '#6366f1', 'subscribed', true, $2, now(), now())",
        &[&feed_calendar, &user.id],
    )
    .await;
    exec(
        db,
        "INSERT INTO calendar_subscription (id, name, url, user_id, calendar_id, last_sync_at, created_at, updated_at) \
         VALUES ($1, 'Feed', 'http://10.0.0.1/feed.ics', $2, $3, now(), now(), now())",
        &[&feed, &user.id, &feed_calendar],
    )
    .await;
    assert_eq!(
        user.post(&format!("/api/subscriptions/{feed}/sync"), json!({}))
            .await
            .status
            .as_u16(),
        400,
        "the refused sync still writes a sync log"
    );
    let directory_entry_stalwart = bootstrap_mailbox(app, user).await;
    exec(
        db,
        "INSERT INTO mail_jmap_sync_state (id, directory_entry_id, stalwart_account_id, email_state, mailbox_state, created_at, updated_at) \
         SELECT $1, id, stalwart_account_id, 's1', 'm1', now(), now() FROM mail_directory_entry WHERE user_id = $2",
        &[&format!("suitesync{}", hex(8)), &user.id],
    )
    .await;
    upload_fixture(user, "avatar.png").await;
    // An abandoned passkey registration leaves its challenge behind.
    ok(user
        .get("/api/auth/passkey/generate-register-options")
        .await
        .expect_status(200));
    let suffix = hex(8);
    let client = format!("suiteclient{suffix}");
    exec(
        db,
        "INSERT INTO oauth_client (id, client_id, user_id, redirect_uris, created_at, updated_at) \
         VALUES ($1, $1, $2, '{}', now(), now())",
        &[&client, &user.id],
    )
    .await;
    exec(
        db,
        "INSERT INTO oauth_consent (id, client_id, user_id, created_at, updated_at) VALUES ($1, $2, $3, now(), now())",
        &[&format!("suiteconsent{suffix}"), &client, &user.id],
    )
    .await;
    exec(
        db,
        "INSERT INTO oauth_refresh_token (id, token, client_id, user_id, expires_at) VALUES ($1, $1, $2, $3, now() + interval '1 day')",
        &[&format!("suiterefresh{suffix}"), &client, &user.id],
    )
    .await;
    exec(
        db,
        "INSERT INTO oauth_access_token (id, token, client_id, user_id, expires_at) VALUES ($1, $1, $2, $3, now() + interval '1 hour')",
        &[&format!("suiteaccess{suffix}"), &client, &user.id],
    )
    .await;
    exec(
        db,
        "INSERT INTO notification_log (id, event_id, user_id, notification_type, minutes_before, sent_at, status) \
         VALUES ($1, $2, $3, 'email', 30, now(), 'sent')",
        &[&format!("suitelog{suffix}"), &series_id, &user.id],
    )
    .await;
    exec(
        db,
        "INSERT INTO invite (id, token, invited_by_id, email, status, expires_at, created_at, updated_at) \
         VALUES ($1, $1, $2, 'friend@example.com', 'pending', now() + interval '7 days', now(), now())",
        &[&format!("suitesent{suffix}"), &user.id],
    )
    .await;
    // A second device's session.
    ok(app
        .anonymous()
        .post(
            "/api/auth/sign-in/email",
            json!({"email": user.email, "password": user.password}),
        )
        .await
        .and_then(|r| r.expect_status(200)));
    // Registered last: once a passkey exists every session needs a passkey sign-in (step-up).
    let rp_id = url::Url::parse(&app.origin)
        .ok()
        .and_then(|url| url.host_str().map(str::to_owned))
        .expect("origin host");
    let mut passkey = SoftPasskey::new(&rp_id).expect("soft passkey");
    let options = ok(user
        .get("/api/auth/passkey/generate-register-options")
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    let registration = passkey.register(&options, &app.origin).expect("register");
    ok(user
        .post(
            "/api/auth/passkey/verify-registration",
            json!({"response": registration, "name": "Suite passkey"}),
        )
        .await
        .expect_status(200));
    let mut stepped_up = app.anonymous();
    ok(passkey_sign_in(&mut stepped_up, &mut passkey, &app.origin).await);
    user.agent = stepped_up;
    directory_entry_stalwart
}

#[tokio::test]
async fn anonymous_callers_cannot_delete_an_account() {
    let app = TestApp::spawn().await;
    expect_unauthorized(&ok(app.anonymous().delete("/api/account").await));
}

#[tokio::test]
async fn deleting_an_account_removes_every_row_mailbox_and_avatar_it_owns() {
    let app = TestApp::spawn().await;
    let mut victim = app.user().await;
    let mut bystander = app.user().await;
    let stalwart_account = fill_account(&app, &mut victim).await;
    let (avatar_id,): (String,) = sqlx::query_as("SELECT avatar_id FROM \"user\" WHERE id = $1")
        .bind(&victim.id)
        .fetch_one(&app.db)
        .await
        .expect("avatar id");

    let bystander_calendar = owned_calendar(&mut bystander, "Home").await;
    import(
        &mut bystander,
        &bystander_calendar,
        vec![encrypted_event(
            "meeting",
            "2026-11-05T09:00:00.000Z",
            "2026-11-05T10:00:00.000Z",
        )],
    )
    .await;
    let bystander_event = event_id(&app.db, &bystander_calendar, "meeting").await;
    ok(bystander
        .put(
            "/api/push/devices",
            json!({"token": hex(32), "platform": "ios", "bundleId": "onl.solace.mail", "environment": "production"}),
        )
        .await
        .expect_status(200));
    let (victim_calendar,): (String,) =
        sqlx::query_as("SELECT id FROM calendar WHERE user_id = $1 AND name = 'Work'")
            .bind(&victim.id)
            .fetch_one(&app.db)
            .await
            .expect("victim calendar");
    let participant = format!("suitepart{}", hex(8));
    let shared_out = format!("suiteshare{}", hex(8));
    let shared_in = format!("suiteshare{}", hex(8));
    exec(
        &app.db,
        "INSERT INTO event_participant (id, event_id, user_id, email, display_name, status, role, created_at, updated_at) \
         VALUES ($1, $2, $3, $4, 'Victim', 'accepted', 'attendee', now(), now())",
        &[&participant, &bystander_event, &victim.id, &victim.email],
    )
    .await;
    exec(
        &app.db,
        "INSERT INTO calendar_sharing (id, calendar_id, shared_with, shared_by, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now())",
        &[&shared_out, &victim_calendar, &bystander.id, &victim.id],
    )
    .await;
    exec(
        &app.db,
        "INSERT INTO calendar_sharing (id, calendar_id, shared_with, shared_by, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now())",
        &[&shared_in, &bystander_calendar, &victim.id, &bystander.id],
    )
    .await;

    let (needles, owned) = owned_rows(&app.db, &victim).await;
    let owned_tables: BTreeSet<&str> = owned.keys().map(|(table, _)| table.as_str()).collect();
    for table in [
        "account",
        "calendar",
        "calendar_event",
        "calendar_sharing",
        "calendar_subscription",
        "calendar_sync_log",
        "event_category",
        "event_notification",
        "event_participant",
        "invite",
        "mail_directory_entry",
        "mail_jmap_sync_state",
        "mail_vault_backup",
        "notification_job",
        "notification_log",
        "oauth_access_token",
        "oauth_client",
        "oauth_consent",
        "oauth_refresh_token",
        "passkey",
        "push_device",
        "recurrence_exception",
        "session",
        "user",
        "user_encryption_device",
        "user_encryption_password",
        "user_mail_settings",
        "user_recent_contacts",
        "user_settings",
        "verification",
    ] {
        assert!(
            owned_tables.contains(table),
            "the filled account has a {table} row"
        );
    }
    let (bystander_needles, bystander_before) = owned_rows(&app.db, &bystander).await;
    assert!(stalwart_account_exists(&app, &stalwart_account).await);
    assert_eq!(
        victim
            .get(&format!("/api/profiles/avatars/{avatar_id}"))
            .await
            .status
            .as_u16(),
        200
    );

    let deleted: DeleteAccountResponse = ok(victim
        .delete("/api/account")
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        deleted,
        DeleteAccountResponse {
            success: true,
            message: "Account deleted successfully".into(),
            deleted_user_id: victim.id.clone().into(),
        }
    );

    // Pinned as is: the participant email stays by design; the passkey challenge and FK-less recurrence exceptions outlive the user.
    let expected_leftovers: BTreeSet<RowKey> = owned
        .keys()
        .filter(|(table, id)| {
            table == "verification"
                || table == "recurrence_exception"
                || (table == "event_participant" && id.as_deref() == Some(participant.as_str()))
        })
        .cloned()
        .collect();
    assert_eq!(
        expected_leftovers
            .iter()
            .filter(|(t, _)| t == "recurrence_exception")
            .count(),
        2
    );
    assert_eq!(remaining(&app.db, &needles).await, expected_leftovers);
    let kept: (Option<String>, String) =
        sqlx::query_as("SELECT user_id, email FROM event_participant WHERE id = $1")
            .bind(&participant)
            .fetch_one(&app.db)
            .await
            .expect("bystander's participant row");
    assert_eq!(
        kept,
        (None, victim.email.clone()),
        "the link is cut, the invite email stays"
    );

    let mut bystander_after = rows_mentioning(&app.db, &bystander_needles).await;
    let mut expected_bystander = bystander_before.clone();
    for share in [&shared_out, &shared_in] {
        assert!(
            expected_bystander
                .remove(&("calendar_sharing".to_owned(), Some(share.clone())))
                .is_some()
        );
    }
    let participant_key = ("event_participant".to_owned(), Some(participant.clone()));
    assert!(bystander_after.remove(&participant_key).is_some());
    expected_bystander.remove(&participant_key);
    assert_eq!(
        bystander_after, expected_bystander,
        "the other account's rows are untouched"
    );

    assert!(
        !stalwart_account_exists(&app, &stalwart_account).await,
        "the Stalwart mailbox is deleted"
    );
    assert!(
        !stored_objects_exist(&app, &mut bystander, &avatar_id).await,
        "the avatar objects are deleted"
    );
    let mut stale = session_token_only(&victim.agent);
    expect_unauthorized(&ok(stale.get("/api/settings").await));
    let signed_in = ok(app
        .anonymous()
        .post(
            "/api/auth/sign-in/email",
            json!({"email": victim.email, "password": victim.password}),
        )
        .await);
    assert_eq!(signed_in.status.as_u16(), 401, "{}", signed_in.text());
    let local_part = victim.email.split('@').next().expect("local part");
    let availability: EmailAvailability = ok(app
        .anonymous()
        .get(&format!(
            "/api/account/email-availability?email={local_part}"
        ))
        .await
        .and_then(|r| r.dto()));
    assert!(availability.available, "the address can be used again");
    ok(bystander.get("/api/settings").await.expect_status(200));
}

#[tokio::test]
async fn a_failed_mailbox_deletion_keeps_the_account() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let stalwart_account = bootstrap_mailbox(&app, &mut user).await;
    let (needles, before) = owned_rows(&app.db, &user).await;
    // Stalwart answers a destroy of this malformed id with notDestroyed, which the backend treats as a failure.
    exec(
        &app.db,
        "UPDATE mail_directory_entry SET stalwart_account_id = 'zzzzzzz' WHERE user_id = $1",
        &[&user.id],
    )
    .await;

    let failed = ok(user.delete("/api/account").await.expect_error(
        503,
        "Upstream Service Error",
        "Could not delete the linked Stalwart mailbox. Try again in a moment.",
    ));
    assert!(failed.get("details").is_none(), "{failed}");
    exec(
        &app.db,
        "UPDATE mail_directory_entry SET stalwart_account_id = $1 WHERE user_id = $2",
        &[&stalwart_account, &user.id],
    )
    .await;
    assert_eq!(
        rows_mentioning(&app.db, &needles)
            .await
            .into_keys()
            .collect::<Vec<_>>(),
        before.into_keys().collect::<Vec<_>>(),
        "nothing is deleted when the mailbox cannot be"
    );
    assert!(stalwart_account_exists(&app, &stalwart_account).await);
    ok(user.get("/api/settings").await.expect_status(200));

    let deleted: DeleteAccountResponse = ok(user.delete("/api/account").await.dto());
    assert!(deleted.success, "a retry succeeds");
    assert!(!stalwart_account_exists(&app, &stalwart_account).await);
}

#[tokio::test]
async fn a_stale_mailbox_id_still_removes_the_mailbox_found_by_name() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let stalwart_account = bootstrap_mailbox(&app, &mut user).await;
    // Stalwart 0.16 neither destroys nor refuses this unknown id, so the backend falls back to the mailbox name.
    exec(
        &app.db,
        "UPDATE mail_directory_entry SET stalwart_account_id = 'zz2345' WHERE user_id = $1",
        &[&user.id],
    )
    .await;
    let deleted: DeleteAccountResponse = ok(user
        .delete("/api/account")
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(deleted.deleted_user_id.0, user.id);
    assert!(!stalwart_account_exists(&app, &stalwart_account).await);
    assert_eq!(
        crate::helpers::count(
            &app.db,
            "SELECT count(*) FROM mail_directory_entry WHERE user_id = $1",
            &user.id
        )
        .await,
        0
    );
}

#[tokio::test]
async fn forged_user_ids_are_ignored_and_the_caller_is_deleted() {
    let app = TestApp::spawn().await;
    let mut victim = app.user().await;
    let mut attacker = app.user().await;
    let response = ok(attacker
        .agent
        .send(
            reqwest::Method::DELETE,
            &format!("/api/account?userId={}", victim.id),
            Some(json!({"userId": victim.id})),
            &[],
        )
        .await);
    let deleted: DeleteAccountResponse = ok(response.expect_status(200).and_then(|r| r.dto()));
    assert_eq!(deleted.deleted_user_id.0, attacker.id);
    let users: i64 = sqlx::query_scalar("SELECT count(*) FROM \"user\" WHERE id = ANY($1)")
        .bind(vec![victim.id.clone(), attacker.id.clone()])
        .fetch_one(&app.db)
        .await
        .expect("users");
    assert_eq!(users, 1);
    ok(victim.get("/api/settings").await.expect_status(200));
}

#[tokio::test]
async fn the_signup_config_is_public() {
    let app = TestApp::spawn().await;
    let config: SignupConfig = ok(app
        .anonymous()
        .get("/api/account/signup-config")
        .await
        .and_then(|r| r.expect_status(200))
        .and_then(|r| r.dto()));
    assert_eq!(
        config,
        SignupConfig {
            default_email_domain: app.env.mail_domain.clone()
        }
    );
}

#[tokio::test]
async fn email_availability_normalizes_and_classifies_handles() {
    let app = TestApp::spawn().await;
    let existing = app.user().await;
    let domain = app.env.mail_domain.clone();
    let mut anon = app.anonymous();
    let handle = format!("Suite-Handle-{}", hex(4));
    let check = |email: &str| format!("/api/account/email-availability?email={email}");
    let cases = [
        (
            handle.clone(),
            EmailAvailability {
                email: handle.clone(),
                local_part: Some(handle.to_lowercase()),
                domain: domain.clone(),
                normalized_email: format!("{}@{domain}", handle.to_lowercase()),
                available: true,
                code: EmailAvailabilityCode::Available,
                message: "That email address is available.".into(),
            },
        ),
        (
            "admin".to_owned(),
            EmailAvailability {
                email: "admin".into(),
                local_part: Some("admin".into()),
                domain: domain.clone(),
                normalized_email: format!("admin@{domain}"),
                available: false,
                code: EmailAvailabilityCode::Reserved,
                message: "That email address is reserved.".into(),
            },
        ),
        (
            "a%20b".to_owned(),
            EmailAvailability {
                email: "a b".into(),
                local_part: Some("a b".into()),
                domain: domain.clone(),
                normalized_email: "a b".into(),
                available: false,
                code: EmailAvailabilityCode::InvalidEmail,
                message: "Use only lowercase letters, numbers, dots, underscores, and hyphens in your Solace email.".into(),
            },
        ),
        (
            "x@example.com".to_owned(),
            EmailAvailability {
                email: "x@example.com".into(),
                local_part: Some("x".into()),
                domain: domain.clone(),
                normalized_email: "x@example.com".into(),
                available: false,
                code: EmailAvailabilityCode::InvalidEmail,
                message: format!("Use your @{domain} email address for Solace sign-up."),
            },
        ),
        (
            existing.email.to_uppercase(),
            EmailAvailability {
                email: existing.email.to_uppercase(),
                local_part: existing.email.split('@').next().map(str::to_owned),
                domain: domain.clone(),
                normalized_email: existing.email.clone(),
                available: false,
                code: EmailAvailabilityCode::AlreadyInUse,
                message: "That email address is already in use.".into(),
            },
        ),
    ];
    for (query, expected) in cases {
        let answer: EmailAvailability = ok(anon
            .get(&check(&query))
            .await
            .and_then(|r| r.expect_status(200))
            .and_then(|r| r.dto()));
        assert_eq!(answer, expected, "{query}");
    }
    let alert: EmailAvailability = ok(anon.get(&check("alert")).await.and_then(|r| r.dto()));
    assert_eq!(
        (alert.code, alert.available),
        (EmailAvailabilityCode::Reserved, false)
    );

    expect_invalid(
        &ok(anon.get("/api/account/email-availability").await),
        "Required",
        "email",
    );
    expect_invalid(
        &ok(anon.get(&check(&"a".repeat(321))).await),
        "String must contain at most 320 character(s)",
        "email",
    );
    expect_unknown_field(
        &ok(anon.get(&format!("{}&userId=x", check("someone"))).await),
        "userId",
    );
}

#[tokio::test]
async fn auth_status_reports_the_session_and_is_never_cached() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    for (mut agent, authenticated) in [(app.anonymous(), false), (user.agent.clone(), true)] {
        let response = ok(agent.get("/api/account/auth-status").await);
        assert_eq!(
            response
                .headers
                .get("cache-control")
                .and_then(|v| v.to_str().ok()),
            Some("no-store, max-age=0")
        );
        let status: AuthStatus = ok(response.expect_status(200).and_then(|r| r.dto()));
        assert_eq!(
            status,
            AuthStatus {
                authenticated,
                has_passkeys: false,
                requires_passkey_step_up: false
            }
        );
    }
    ok(user.get("/api/settings").await.expect_status(200));
}
