//! `/api/e2ee`: device and password key envelopes stored as sent, bootstrap metadata and the reset snapshot.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde_json::{Value, json};
use solace_api_tests::seed::fake_envelope;
use solace_api_types::Timestamp;
use solace_api_types::e2ee::{
    E2eeAlgorithms, E2eeBootstrap, EncryptionDevice, PasswordEnvelope, PasswordEnvelopeRequest,
    RegisterDeviceRequest, ResetSnapshot,
};

use crate::helpers::{
    TestApp, TestUser, count, expect_field_error, expect_invalid, expect_unauthorized,
    expect_unknown_field, hex, json_body, ok,
};

/// Random bytes as standard base64, the shape of real wrapped keys (`+`, `/` and `=` included).
fn blob(len: usize) -> String {
    STANDARD.encode((0..len).map(|_| rand::random::<u8>()).collect::<Vec<_>>())
}

fn device(device_id: &str) -> RegisterDeviceRequest {
    RegisterDeviceRequest {
        device_id: device_id.into(),
        device_label: Some("Work laptop".into()),
        public_key: blob(550),
        public_key_algorithm: None,
        wrapped_account_key: blob(512),
        wrapped_search_key: blob(512),
        wrap_algorithm: None,
        key_version: None,
    }
}

fn envelope() -> PasswordEnvelopeRequest {
    PasswordEnvelopeRequest {
        kdf_algorithm: None,
        kdf_salt: blob(16),
        kdf_iterations: None,
        wrapped_account_key: blob(60),
        wrapped_search_key: blob(60),
        wrap_algorithm: None,
        key_version: None,
    }
}

async fn register(user: &mut TestUser, body: &RegisterDeviceRequest) -> EncryptionDevice {
    ok(user
        .put("/api/e2ee/device", json_body(body))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()))
}

async fn bootstrap(user: &mut TestUser) -> E2eeBootstrap {
    ok(user
        .get("/api/e2ee/bootstrap")
        .await
        .expect_status(200)
        .and_then(|r| r.dto()))
}

/// `(device_label, public_key, public_key_algorithm, wrapped_account_key, wrapped_search_key, wrap_algorithm, key_version)`.
type DeviceRow = (Option<String>, String, String, String, String, String, i32);

async fn device_row(app: &TestApp, user: &TestUser, device_id: &str) -> DeviceRow {
    sqlx::query_as(
        "SELECT device_label, public_key, public_key_algorithm, wrapped_account_key, wrapped_search_key, wrap_algorithm, key_version \
         FROM user_encryption_device WHERE user_id = $1 AND device_id = $2",
    )
    .bind(&user.id)
    .bind(device_id)
    .fetch_one(&app.db)
    .await
    .expect("device row")
}

#[tokio::test]
async fn anonymous_callers_are_refused() {
    let app = TestApp::spawn().await;
    let mut anon = app.anonymous();
    expect_unauthorized(&ok(anon.get("/api/e2ee/bootstrap").await));
    expect_unauthorized(&ok(anon.get("/api/e2ee/reset-snapshot").await));
    expect_unauthorized(&ok(anon
        .put("/api/e2ee/device", json_body(&device("anon-device")))
        .await));
    expect_unauthorized(&ok(anon
        .put("/api/e2ee/password", json_body(&envelope()))
        .await));
}

#[tokio::test]
async fn a_new_account_has_no_key_material() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let state = bootstrap(&mut user).await;
    assert_eq!(
        state,
        E2eeBootstrap {
            enabled: true,
            rollout_stage: "encrypted".into(),
            algorithms: E2eeAlgorithms {
                content: "AES-GCM-256".into(),
                blind_index: "HMAC-SHA-256".into(),
                wrapping: "RSA-OAEP-256".into(),
                password_wrapping: "AES-GCM-256".into(),
            },
            devices: vec![],
            password_envelope: None,
            calendars: vec![],
        }
    );
    let snapshot: ResetSnapshot = ok(user
        .get("/api/e2ee/reset-snapshot")
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        snapshot,
        ResetSnapshot {
            calendars: vec![],
            categories: vec![],
            events: vec![]
        }
    );
}

#[tokio::test]
async fn device_key_material_is_stored_byte_for_byte() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let mut body = device("phone-1");
    body.public_key = format!("{}+/=", "A".repeat(32765));
    body.public_key_algorithm = Some("RSA-OAEP-256".into());
    body.wrap_algorithm = Some("RSA-OAEP-256".into());
    body.key_version = Some(7);

    let stored = register(&mut user, &body).await;
    assert_eq!(stored.user_id.0, user.id);
    assert_eq!(stored.device_id, "phone-1");
    assert_eq!(stored.public_key.len(), 32768);
    assert_eq!(
        (
            &stored.public_key,
            &stored.wrapped_account_key,
            &stored.wrapped_search_key
        ),
        (
            &body.public_key,
            &body.wrapped_account_key,
            &body.wrapped_search_key
        )
    );
    assert_eq!(stored.key_version, 7);
    assert_eq!(
        device_row(&app, &user, "phone-1").await,
        (
            Some("Work laptop".into()),
            body.public_key.clone(),
            "RSA-OAEP-256".into(),
            body.wrapped_account_key.clone(),
            body.wrapped_search_key.clone(),
            "RSA-OAEP-256".into(),
            7
        )
    );
    let (created_at, last_seen_at): (String, String) = sqlx::query_as(
        "SELECT to_char(created_at, 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'), to_char(last_seen_at, 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') \
         FROM user_encryption_device WHERE id = $1",
    )
    .bind(&stored.id)
    .fetch_one(&app.db)
    .await
    .expect("device times");
    assert_eq!(
        (stored.created_at.clone(), stored.last_seen_at.clone()),
        (Timestamp(created_at), Timestamp(last_seen_at))
    );
    assert_eq!(bootstrap(&mut user).await.devices, [stored]);
}

#[tokio::test]
async fn device_registration_trims_values_and_applies_defaults() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    // JavaScript's trim, which also strips U+FEFF, NBSP and line separators.
    let stored = register(
        &mut user,
        &RegisterDeviceRequest {
            device_id: "\u{feff}  device-1 \u{a0}".into(),
            device_label: Some("\u{2028}  ".into()),
            public_key: "\n public-key \r".into(),
            public_key_algorithm: Some("   ".into()),
            wrapped_account_key: "\t wrapped-account ".into(),
            wrapped_search_key: " wrapped-search\u{feff}".into(),
            wrap_algorithm: Some(" RSA-OAEP-512 ".into()),
            key_version: None,
        },
    )
    .await;
    assert_eq!(stored.device_id, "device-1");
    assert_eq!(stored.device_label, None, "a blank label is stored as null");
    assert_eq!(
        (
            stored.public_key.as_str(),
            stored.wrapped_account_key.as_str(),
            stored.wrapped_search_key.as_str()
        ),
        ("public-key", "wrapped-account", "wrapped-search")
    );
    assert_eq!(
        (
            stored.public_key_algorithm.as_str(),
            stored.wrap_algorithm.as_str(),
            stored.key_version
        ),
        ("RSA-OAEP-256", "RSA-OAEP-512", 1)
    );
    assert_eq!(
        device_row(&app, &user, "device-1").await,
        (
            None,
            "public-key".into(),
            "RSA-OAEP-256".into(),
            "wrapped-account".into(),
            "wrapped-search".into(),
            "RSA-OAEP-512".into(),
            1
        )
    );

    let labelled = register(
        &mut user,
        &RegisterDeviceRequest {
            device_label: Some("\u{feff} Laptop\u{a0}".into()),
            ..device("device-2")
        },
    )
    .await;
    assert_eq!(labelled.device_label.as_deref(), Some("Laptop"));
}

#[tokio::test]
async fn re_registering_a_device_updates_it_in_place() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let first = register(&mut user, &device("tablet")).await;
    let mut rotated = device("  tablet  ");
    rotated.device_label = None;
    rotated.key_version = Some(2);
    rotated.wrap_algorithm = Some("RSA-OAEP-384".into());

    let second = register(&mut user, &rotated).await;
    assert_eq!(second.id, first.id);
    assert_eq!(second.created_at, first.created_at);
    assert!(second.last_seen_at >= first.last_seen_at);
    assert!(second.updated_at >= first.updated_at);
    assert_eq!(
        second.device_label, None,
        "omitting the label on refresh clears it"
    );
    assert_eq!(
        (
            second.public_key.as_str(),
            second.key_version,
            second.wrap_algorithm.as_str()
        ),
        (rotated.public_key.as_str(), 2, "RSA-OAEP-384")
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM user_encryption_device WHERE user_id = $1",
            &user.id
        )
        .await,
        1
    );
}

#[tokio::test]
async fn bootstrap_lists_devices_most_recently_seen_first() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let laptop = register(&mut user, &device("laptop")).await;
    let phone = register(&mut user, &device("phone")).await;
    let ids = |state: &E2eeBootstrap| -> Vec<String> {
        state.devices.iter().map(|d| d.device_id.clone()).collect()
    };
    assert_eq!(ids(&bootstrap(&mut user).await), ["phone", "laptop"]);
    sqlx::query("UPDATE user_encryption_device SET last_seen_at = now() + interval '1 minute' WHERE id = $1")
        .bind(&laptop.id)
        .execute(&app.db)
        .await
        .expect("touch laptop");
    assert_eq!(ids(&bootstrap(&mut user).await), ["laptop", "phone"]);
    assert_ne!(laptop.id, phone.id);
}

#[tokio::test]
async fn device_fields_are_validated() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let valid = json_body(&device("validated"));
    let with = |field: &str, value: Value| {
        let mut body = valid.clone();
        body[field] = value;
        body
    };
    let cases = [
        (
            with("deviceId", json!("")),
            "String must contain at least 1 character(s)",
            "deviceId",
        ),
        (
            with("deviceId", json!("d".repeat(129))),
            "String must contain at most 128 character(s)",
            "deviceId",
        ),
        (
            with("deviceLabel", json!("x".repeat(121))),
            "String must contain at most 120 character(s)",
            "deviceLabel",
        ),
        (
            with("deviceLabel", json!("\u{1F600}".repeat(61))),
            "String must contain at most 120 character(s)",
            "deviceLabel",
        ),
        (
            with("deviceLabel", Value::Null),
            "Expected string, received null",
            "deviceLabel",
        ),
        (
            with("publicKey", json!("k".repeat(32769))),
            "String must contain at most 32768 character(s)",
            "publicKey",
        ),
        (
            with("wrappedAccountKey", json!("")),
            "String must contain at least 1 character(s)",
            "wrappedAccountKey",
        ),
        (
            with("wrappedSearchKey", json!("s".repeat(32769))),
            "String must contain at most 32768 character(s)",
            "wrappedSearchKey",
        ),
        (
            with("publicKeyAlgorithm", json!("a".repeat(65))),
            "String must contain at most 64 character(s)",
            "publicKeyAlgorithm",
        ),
        (
            with("wrapAlgorithm", json!("a".repeat(65))),
            "String must contain at most 64 character(s)",
            "wrapAlgorithm",
        ),
        (
            with("keyVersion", json!(0)),
            "Number must be greater than or equal to 1",
            "keyVersion",
        ),
        (
            with("keyVersion", json!(1001)),
            "Number must be less than or equal to 1000",
            "keyVersion",
        ),
        (
            with("keyVersion", json!(1.5)),
            "Expected integer, received float",
            "keyVersion",
        ),
        (
            with("keyVersion", json!("2")),
            "Expected number, received string",
            "keyVersion",
        ),
    ];
    for (body, message, path) in cases {
        expect_invalid(
            &user.put("/api/e2ee/device", body.clone()).await,
            message,
            path,
        );
    }
    let missing = ok(user.put("/api/e2ee/device", json!({})).await.expect_error(
        400,
        "Validation Error",
        "Required",
    ));
    let paths: Vec<&Value> = missing["details"]["issues"]
        .as_array()
        .expect("issues")
        .iter()
        .map(|issue| &issue["path"])
        .collect();
    assert_eq!(
        paths,
        [
            "deviceId",
            "publicKey",
            "wrappedAccountKey",
            "wrappedSearchKey"
        ]
    );
    expect_unknown_field(
        &user
            .put("/api/e2ee/device", with("unexpected", json!(true)))
            .await,
        "unexpected",
    );
    expect_unknown_field(
        &user
            .put("/api/e2ee/device", with("userId", json!(user.id)))
            .await,
        "userId",
    );
    for (field, message) in [
        ("deviceId", "Device ID is required"),
        ("publicKey", "Public key is required"),
        ("wrappedAccountKey", "Wrapped account key is required"),
        ("wrappedSearchKey", "Wrapped search key is required"),
    ] {
        expect_field_error(
            &user
                .put("/api/e2ee/device", with(field, json!(" \u{a0} ")))
                .await,
            message,
            field,
        );
    }
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM user_encryption_device WHERE user_id = $1",
            &user.id
        )
        .await,
        0
    );

    let longest = register(
        &mut user,
        &RegisterDeviceRequest {
            device_label: Some("\u{1F600}".repeat(60)),
            ..device(&"d".repeat(128))
        },
    )
    .await;
    assert_eq!(
        longest.device_label.map(|label| label.chars().count()),
        Some(60),
        "limits count UTF-16 code units"
    );
}

#[tokio::test]
async fn the_password_envelope_is_created_then_rotated_in_place() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let first_body = PasswordEnvelopeRequest {
        kdf_salt: format!("  {}  ", blob(16)),
        ..envelope()
    };
    let first: PasswordEnvelope = ok(user
        .put("/api/e2ee/password", json_body(&first_body))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(first.user_id.0, user.id);
    assert_eq!(first.kdf_salt, first_body.kdf_salt.trim());
    assert_eq!(
        (
            first.kdf_algorithm.as_str(),
            first.kdf_iterations,
            first.wrap_algorithm.as_str(),
            first.key_version
        ),
        ("PBKDF2-SHA-256", 310_000, "AES-GCM-256", 1)
    );
    assert_eq!(
        (&first.wrapped_account_key, &first.wrapped_search_key),
        (
            &first_body.wrapped_account_key,
            &first_body.wrapped_search_key
        )
    );

    let rotated_body = PasswordEnvelopeRequest {
        kdf_algorithm: Some(" PBKDF2-SHA-512 ".into()),
        kdf_iterations: Some(600_000),
        wrap_algorithm: Some("AES-GCM-256".into()),
        key_version: Some(2),
        ..envelope()
    };
    let rotated: PasswordEnvelope = ok(user
        .put("/api/e2ee/password", json_body(&rotated_body))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(rotated.id, first.id);
    assert_eq!(rotated.created_at, first.created_at);
    assert_eq!(
        (
            rotated.kdf_algorithm.as_str(),
            rotated.kdf_iterations,
            rotated.key_version
        ),
        ("PBKDF2-SHA-512", 600_000, 2)
    );
    assert_eq!(rotated.kdf_salt, rotated_body.kdf_salt);

    let row: (String, String, i32, String, String, String, i32) = sqlx::query_as(
        "SELECT kdf_algorithm, kdf_salt, kdf_iterations, wrapped_account_key, wrapped_search_key, wrap_algorithm, key_version \
         FROM user_encryption_password WHERE user_id = $1",
    )
    .bind(&user.id)
    .fetch_one(&app.db)
    .await
    .expect("password envelope");
    assert_eq!(
        row,
        (
            "PBKDF2-SHA-512".into(),
            rotated_body.kdf_salt.clone(),
            600_000,
            rotated_body.wrapped_account_key.clone(),
            rotated_body.wrapped_search_key.clone(),
            "AES-GCM-256".into(),
            2
        )
    );
    assert_eq!(bootstrap(&mut user).await.password_envelope, Some(rotated));
}

#[tokio::test]
async fn password_envelope_fields_are_validated() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let valid = json_body(&envelope());
    let with = |field: &str, value: Value| {
        let mut body = valid.clone();
        body[field] = value;
        body
    };
    let cases = [
        (
            with("kdfIterations", json!(99_999)),
            "Number must be greater than or equal to 100000",
            "kdfIterations",
        ),
        (
            with("kdfIterations", json!(5_000_001)),
            "Number must be less than or equal to 5000000",
            "kdfIterations",
        ),
        (
            with("kdfIterations", json!(100_000.5)),
            "Expected integer, received float",
            "kdfIterations",
        ),
        (
            with("kdfSalt", json!("s".repeat(513))),
            "String must contain at most 512 character(s)",
            "kdfSalt",
        ),
        (
            with("kdfSalt", json!("")),
            "String must contain at least 1 character(s)",
            "kdfSalt",
        ),
        (
            with("kdfAlgorithm", json!("a".repeat(65))),
            "String must contain at most 64 character(s)",
            "kdfAlgorithm",
        ),
        (
            with("wrappedAccountKey", json!("k".repeat(32769))),
            "String must contain at most 32768 character(s)",
            "wrappedAccountKey",
        ),
        (
            with("keyVersion", json!(0)),
            "Number must be greater than or equal to 1",
            "keyVersion",
        ),
    ];
    for (body, message, path) in cases {
        expect_invalid(
            &user.put("/api/e2ee/password", body.clone()).await,
            message,
            path,
        );
    }
    let missing = ok(user
        .put("/api/e2ee/password", json!({}))
        .await
        .expect_error(400, "Validation Error", "Required"));
    assert_eq!(
        missing["details"]["issues"],
        json!([
            {"path": "kdfSalt", "message": "Required"},
            {"path": "wrappedAccountKey", "message": "Required"},
            {"path": "wrappedSearchKey", "message": "Required"},
        ])
    );
    expect_unknown_field(
        &user
            .put("/api/e2ee/password", with("userId", json!(user.id)))
            .await,
        "userId",
    );
    for (field, message) in [
        ("kdfSalt", "KDF salt is required"),
        ("wrappedAccountKey", "Wrapped account key is required"),
        ("wrappedSearchKey", "Wrapped search key is required"),
    ] {
        expect_field_error(
            &user
                .put("/api/e2ee/password", with(field, json!("\u{a0} ")))
                .await,
            message,
            field,
        );
    }
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM user_encryption_password WHERE user_id = $1",
            &user.id
        )
        .await,
        0
    );
}

async fn insert_calendar(
    app: &TestApp,
    user: &TestUser,
    name: &str,
    kind: &str,
    default: bool,
    tokens: Option<&str>,
) -> String {
    let id = format!("suitecal{}", hex(8));
    sqlx::query(
        "INSERT INTO calendar (id, name, encrypted_name, blind_index_tokens, encryption_state, color, kind, is_default, user_id, created_at, updated_at) \
         VALUES ($1, $2, $3, $4, 'encrypted', 'blue', $5, $6, $7, now(), now())",
    )
    .bind(&id)
    .bind(name)
    .bind(fake_envelope())
    .bind(tokens)
    .bind(kind)
    .bind(default)
    .bind(&user.id)
    .execute(&app.db)
    .await
    .expect("insert calendar");
    id
}

async fn insert_category(
    app: &TestApp,
    user: &TestUser,
    name: &str,
    active: bool,
    tokens: &str,
) -> String {
    let id = format!("suitecat{}", hex(8));
    sqlx::query(
        "INSERT INTO event_category (id, name, encrypted_name, blind_index_tokens, encryption_state, color, is_active, user_id, created_at, updated_at) \
         VALUES ($1, $2, $3, $4, 'encrypted', 'violet', $5, $6, now(), now())",
    )
    .bind(&id)
    .bind(name)
    .bind(fake_envelope())
    .bind(tokens)
    .bind(active)
    .bind(&user.id)
    .execute(&app.db)
    .await
    .expect("insert category");
    id
}

async fn insert_event(
    app: &TestApp,
    user: &TestUser,
    calendar_id: &str,
    synced: bool,
    updated_minutes_ago: i32,
) -> (String, String) {
    let id = format!("suiteevt{}", hex(8));
    let content = fake_envelope();
    sqlx::query(
        "INSERT INTO calendar_event (id, title, encrypted_content, blind_index_tokens, encryption_state, encryption_key_version, start, \"end\", \
         timezone, user_id, calendar_id, is_synced, reminder, created_at, updated_at) \
         VALUES ($1, '', $2, '[\"tok\"]', 'encrypted', 2, '2026-11-01 09:00:00', '2026-11-01 10:00:00', 'Europe/Amsterdam', $3, $4, $5, 15, \
         now() - interval '1 hour', now() - make_interval(mins => $6))",
    )
    .bind(&id)
    .bind(&content)
    .bind(&user.id)
    .bind(calendar_id)
    .bind(synced)
    .bind(updated_minutes_ago)
    .execute(&app.db)
    .await
    .expect("insert event");
    (id, content)
}

#[tokio::test]
async fn the_reset_snapshot_returns_raw_owned_records_for_re_encryption() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let work = insert_calendar(&app, &user, "", "owned", false, Some("[\"w1\",\"w2\"]")).await;
    let default = insert_calendar(&app, &user, "Zeta", "owned", true, None).await;
    let feed = insert_calendar(&app, &user, "Alpha feed", "subscribed", false, None).await;
    let focus = insert_category(&app, &user, "B", true, "[\"c1\"]").await;
    let errands = insert_category(&app, &user, "A", true, "[]").await;
    insert_category(&app, &user, "C retired", false, "[]").await;
    let (newer, _) = insert_event(&app, &user, &work, false, 1).await;
    let (older, older_content) = insert_event(&app, &user, &default, false, 30).await;
    insert_event(&app, &user, &feed, true, 5).await;

    let snapshot: ResetSnapshot = ok(user
        .get("/api/e2ee/reset-snapshot")
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    let calendar_ids: Vec<&str> = snapshot.calendars.iter().map(|c| c.id.0.as_str()).collect();
    assert_eq!(
        calendar_ids,
        [default.as_str(), work.as_str()],
        "owned only, default first, then by name"
    );
    assert_eq!(snapshot.calendars[1].blind_index_tokens, ["w1", "w2"]);
    assert_eq!(snapshot.calendars[1].encryption_state, "encrypted");
    let category_ids: Vec<&str> = snapshot
        .categories
        .iter()
        .map(|c| c.id.0.as_str())
        .collect();
    assert_eq!(
        category_ids,
        [errands.as_str(), focus.as_str()],
        "active only, by name"
    );
    assert_eq!(snapshot.categories[1].blind_index_tokens, ["c1"]);
    let event_ids: Vec<&str> = snapshot.events.iter().map(|e| e.id.0.as_str()).collect();
    assert_eq!(
        event_ids,
        [older.as_str(), newer.as_str()],
        "unsynced only, least recently updated first"
    );
    let event = &snapshot.events[0];
    assert_eq!(
        event.encrypted_content.as_deref(),
        Some(older_content.as_str())
    );
    assert_eq!(
        (
            event.title.as_str(),
            event.blind_index_tokens.as_slice(),
            event.encryption_key_version
        ),
        ("", ["tok".to_owned()].as_slice(), 2)
    );
    assert_eq!(
        (
            event.start.0.as_str(),
            event.end.0.as_str(),
            event.timezone.as_deref()
        ),
        (
            "2026-11-01T09:00:00.000Z",
            "2026-11-01T10:00:00.000Z",
            Some("Europe/Amsterdam")
        )
    );
    assert_eq!(
        (event.reminder, event.calendar_id.0.as_str()),
        (Some(15), default.as_str())
    );

    let state = bootstrap(&mut user).await;
    let bootstrap_ids: Vec<&str> = state.calendars.iter().map(|c| c.id.0.as_str()).collect();
    assert_eq!(
        bootstrap_ids,
        [default.as_str(), work.as_str(), feed.as_str()],
        "bootstrap lists every kind: default first, then by name"
    );
}

#[tokio::test]
async fn unreadable_blind_index_tokens_become_an_empty_list() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let cases = [
        (Some("not json"), vec![]),
        (Some("{\"a\":1}"), vec![]),
        (Some("[\"a\",1,null,\"b\"]"), vec!["a", "b"]),
        (Some(""), vec![]),
        (None, vec![]),
    ];
    let mut expected = Vec::new();
    for (index, (tokens, parsed)) in cases.into_iter().enumerate() {
        let id =
            insert_calendar(&app, &user, &format!("Cal {index}"), "owned", false, tokens).await;
        expected.push((id, parsed));
    }
    let state = bootstrap(&mut user).await;
    for (id, parsed) in expected {
        let calendar = state
            .calendars
            .iter()
            .find(|c| c.id.0 == id)
            .expect("calendar in bootstrap");
        assert_eq!(calendar.blind_index_tokens, parsed, "{id}");
    }
}

#[tokio::test]
async fn key_material_is_scoped_to_its_owner() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut other = app.user().await;
    let owned = register(&mut owner, &device("shared-name")).await;
    ok(owner
        .put("/api/e2ee/password", json_body(&envelope()))
        .await
        .expect_status(200));
    let calendar = insert_calendar(&app, &owner, "Private", "owned", true, None).await;

    let theirs = register(&mut other, &device("shared-name")).await;
    assert_ne!(
        theirs.id, owned.id,
        "the same device id makes a separate row per user"
    );
    let state = bootstrap(&mut other).await;
    assert_eq!(state.devices, [theirs]);
    assert_eq!(state.password_envelope, None);
    assert!(state.calendars.is_empty());
    let snapshot: ResetSnapshot = ok(other.get("/api/e2ee/reset-snapshot").await.dto());
    assert!(snapshot.calendars.iter().all(|c| c.id.0 != calendar));

    let mine = bootstrap(&mut owner).await;
    assert_eq!(mine.devices, [owned]);
    assert!(mine.password_envelope.is_some());

    for path in ["/api/e2ee/bootstrap", "/api/e2ee/reset-snapshot"] {
        let forged = ok(other
            .get(&format!("{path}?userId={}", owner.id))
            .await
            .expect_status(200)
            .and_then(|r| r.value()));
        assert!(
            !forged.to_string().contains(&owner.id),
            "a userId in the query is ignored: {forged}"
        );
    }
}
