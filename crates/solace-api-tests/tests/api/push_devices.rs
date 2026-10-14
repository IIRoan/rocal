//! `/api/push`: APNs token registration and removal, token-free listing, and the test push outbox row.

use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use solace_api_types::push_devices::{
    PushDeviceList, PushDeviceRegistration, PushDeviceUnregistration, PushTestResult,
    RegisterPushDeviceRequest, UnregisterPushDeviceRequest,
};

use crate::helpers::{
    TestApp, TestUser, count, expect_invalid, expect_unauthorized, expect_unknown_field, hex,
    json_body, ok,
};

const NO_DEVICE: &str =
    "No iPhone is registered for push yet. Open Solace on your phone with notifications allowed.";

fn registration(token: &str) -> RegisterPushDeviceRequest {
    RegisterPushDeviceRequest {
        token: token.into(),
        platform: "ios".into(),
        bundle_id: "onl.solace.calendar".into(),
        environment: "sandbox".into(),
    }
}

async fn register(user: &mut TestUser, body: &RegisterPushDeviceRequest) -> PushDeviceRegistration {
    ok(user
        .put("/api/push/devices", json_body(body))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()))
}

async fn unregister(
    user: &mut TestUser,
    body: &UnregisterPushDeviceRequest,
) -> PushDeviceUnregistration {
    let response = ok(user
        .agent
        .send(
            reqwest::Method::DELETE,
            "/api/push/devices",
            Some(json_body(body)),
            &[],
        )
        .await);
    ok(response.expect_status(200).and_then(|r| r.dto()))
}

async fn list(user: &mut TestUser) -> PushDeviceList {
    ok(user
        .get("/api/push/devices")
        .await
        .expect_status(200)
        .and_then(|r| r.dto()))
}

fn sha256_hex(value: &str) -> String {
    Sha256::digest(value.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

/// `(user_id, token, token_hash, platform, bundle_id, environment, is_enabled)`.
type DeviceRow = (String, String, String, String, String, String, bool);
/// `(user_id, kind, channel, event_id, payload, status, attempts, unclaimed, last_error, available)` of an outbox row.
type JobRow = (
    String,
    String,
    String,
    Option<String>,
    String,
    String,
    i32,
    bool,
    Option<String>,
    bool,
);

async fn device_row(app: &TestApp, device_id: &str) -> Option<DeviceRow> {
    sqlx::query_as(
        "SELECT user_id, token, token_hash, platform, bundle_id, environment, is_enabled FROM push_device WHERE id = $1",
    )
    .bind(device_id)
    .fetch_optional(&app.db)
    .await
    .expect("push device row")
}

async fn device_count(app: &TestApp, user: &TestUser) -> i64 {
    count(
        &app.db,
        "SELECT count(*) FROM push_device WHERE user_id = $1",
        &user.id,
    )
    .await
}

async fn job_count(app: &TestApp, user: &TestUser) -> i64 {
    count(
        &app.db,
        "SELECT count(*) FROM notification_job WHERE user_id = $1",
        &user.id,
    )
    .await
}

fn token() -> String {
    hex(32)
}

#[tokio::test]
async fn anonymous_callers_are_refused() {
    let app = TestApp::spawn().await;
    let mut anon = app.anonymous();
    expect_unauthorized(&ok(anon.get("/api/push/devices").await));
    expect_unauthorized(&ok(anon
        .put("/api/push/devices", json_body(&registration(&token())))
        .await));
    expect_unauthorized(&ok(anon
        .send(
            reqwest::Method::DELETE,
            "/api/push/devices",
            Some(json!({})),
            &[],
        )
        .await));
    expect_unauthorized(&ok(anon.post("/api/push/test", json!({})).await));
}

#[tokio::test]
async fn registering_stores_the_trimmed_token_and_its_hash() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let raw = token();
    let registered = register(&mut user, &registration(&format!("  {raw}\n"))).await;
    assert!(registered.success);
    assert_eq!(
        device_row(&app, &registered.device_id.0).await,
        Some((
            user.id.clone(),
            raw.clone(),
            sha256_hex(&raw),
            "ios".into(),
            "onl.solace.calendar".into(),
            "sandbox".into(),
            true
        ))
    );
    let listed = list(&mut user).await;
    assert_eq!(listed.devices.len(), 1);
    let device = &listed.devices[0];
    assert_eq!(device.id, registered.device_id);
    assert_eq!(
        (
            device.platform.as_str(),
            device.bundle_id.as_str(),
            device.environment.as_str(),
            device.is_enabled
        ),
        ("ios", "onl.solace.calendar", "sandbox", true)
    );
    let raw_list = ok(user.get("/api/push/devices").await.value());
    assert!(
        !raw_list.to_string().contains(&raw),
        "the token never leaves the server: {raw_list}"
    );
}

#[tokio::test]
async fn listing_shows_only_enabled_devices_most_recently_seen_first() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let mut other = app.user().await;
    let older = register(&mut user, &registration(&token())).await;
    let newer = register(
        &mut user,
        &RegisterPushDeviceRequest {
            bundle_id: "onl.solace.mail".into(),
            ..registration(&token())
        },
    )
    .await;
    let disabled = register(&mut user, &registration(&token())).await;
    sqlx::query("UPDATE push_device SET is_enabled = false WHERE id = $1")
        .bind(&disabled.device_id.0)
        .execute(&app.db)
        .await
        .expect("disable device");
    register(&mut other, &registration(&token())).await;

    let ids: Vec<String> = list(&mut user)
        .await
        .devices
        .into_iter()
        .map(|d| d.id.0)
        .collect();
    assert_eq!(ids, [newer.device_id.0, older.device_id.0]);
    assert_eq!(
        list(&mut app.user().await).await,
        PushDeviceList { devices: vec![] }
    );
}

#[tokio::test]
async fn re_registering_keeps_the_learned_environment() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let raw = token();
    let first = register(&mut user, &registration(&raw)).await;
    let before = list(&mut user).await.devices[0].clone();
    sqlx::query("UPDATE push_device SET is_enabled = false WHERE id = $1")
        .bind(&first.device_id.0)
        .execute(&app.db)
        .await
        .expect("disable device");

    let again = register(
        &mut user,
        &RegisterPushDeviceRequest {
            token: raw.clone(),
            platform: "android".into(),
            bundle_id: "onl.solace.mail.dev".into(),
            environment: "production".into(),
        },
    )
    .await;
    assert_eq!(again.device_id, first.device_id);
    assert_eq!(
        device_row(&app, &first.device_id.0).await,
        Some((
            user.id.clone(),
            raw.clone(),
            sha256_hex(&raw),
            "android".into(),
            "onl.solace.mail.dev".into(),
            "sandbox".into(),
            true
        )),
        "platform and bundle follow the client, the environment stays, and the device is re-enabled"
    );
    let after = list(&mut user).await.devices[0].clone();
    assert_eq!(after.created_at, before.created_at);
    assert!(after.last_seen_at >= before.last_seen_at);
}

#[tokio::test]
async fn a_token_moves_to_the_user_who_registers_it_last() {
    let app = TestApp::spawn().await;
    let mut first = app.user().await;
    let mut second = app.user().await;
    let raw = token();
    let original = register(&mut first, &registration(&raw)).await;

    let moved = register(&mut second, &registration(&format!(" {raw} "))).await;
    assert_ne!(moved.device_id, original.device_id);
    assert_eq!(device_row(&app, &original.device_id.0).await, None);
    assert_eq!(
        device_row(&app, &moved.device_id.0).await.map(|row| row.0),
        Some(second.id.clone())
    );
    assert!(list(&mut first).await.devices.is_empty());
    assert_eq!(list(&mut second).await.devices.len(), 1);
}

#[tokio::test]
async fn registration_is_validated() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let valid = json_body(&registration(&token()));
    let with = |field: &str, value: Value| {
        let mut body = valid.clone();
        body[field] = value;
        body
    };
    let cases = [
        (
            with("token", json!(format!("  {}  ", "a".repeat(15)))),
            "String must contain at least 16 character(s)",
            "token",
        ),
        (
            with("token", json!("a".repeat(4097))),
            "String must contain at most 4096 character(s)",
            "token",
        ),
        (
            with("platform", json!("web")),
            "Invalid enum value. Expected 'ios' | 'android', received 'web'",
            "platform",
        ),
        (
            with("bundleId", json!("com.example.app")),
            "Invalid enum value. Expected 'onl.solace.calendar' | 'onl.solace.calendar.dev' | 'onl.solace.mail' | 'onl.solace.mail.dev', received 'com.example.app'",
            "bundleId",
        ),
        (
            with("environment", json!("development")),
            "Invalid enum value. Expected 'sandbox' | 'production', received 'development'",
            "environment",
        ),
        (
            with("token", json!(12345)),
            "Expected string, received number",
            "token",
        ),
    ];
    for (body, message, path) in cases {
        expect_invalid(
            &user.put("/api/push/devices", body.clone()).await,
            message,
            path,
        );
    }
    let missing = ok(user.put("/api/push/devices", json!({})).await.expect_error(
        400,
        "Validation Error",
        "Required",
    ));
    assert_eq!(
        missing["details"]["issues"].as_array().map(Vec::len),
        Some(4)
    );
    expect_unknown_field(
        &user
            .put("/api/push/devices", with("userId", json!(user.id)))
            .await,
        "userId",
    );
    assert_eq!(device_count(&app, &user).await, 0);

    let longest = register(&mut user, &registration(&"t".repeat(4096))).await;
    assert!(longest.success);
}

#[tokio::test]
async fn unregistering_deletes_one_token_or_every_device() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let mut other = app.user().await;
    let kept_elsewhere = register(&mut other, &registration(&token())).await;
    let first = token();
    register(&mut user, &registration(&first)).await;
    register(&mut user, &registration(&token())).await;
    register(&mut user, &registration(&token())).await;

    let one = unregister(
        &mut user,
        &UnregisterPushDeviceRequest {
            token: Some(format!(" {first} ")),
        },
    )
    .await;
    assert_eq!(
        one,
        PushDeviceUnregistration {
            success: true,
            deleted_count: 1
        }
    );
    let unknown = unregister(
        &mut user,
        &UnregisterPushDeviceRequest {
            token: Some(token()),
        },
    )
    .await;
    assert_eq!(unknown.deleted_count, 0);
    let all = unregister(&mut user, &UnregisterPushDeviceRequest::default()).await;
    assert_eq!(all.deleted_count, 2);
    let none = unregister(&mut user, &UnregisterPushDeviceRequest::default()).await;
    assert_eq!(none.deleted_count, 0);
    assert_eq!(device_count(&app, &user).await, 0);
    assert!(
        device_row(&app, &kept_elsewhere.device_id.0)
            .await
            .is_some()
    );
}

#[tokio::test]
async fn another_users_token_cannot_be_unregistered() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut other = app.user().await;
    let raw = token();
    let device = register(&mut owner, &registration(&raw)).await;
    let attempt = unregister(
        &mut other,
        &UnregisterPushDeviceRequest { token: Some(raw) },
    )
    .await;
    assert_eq!(attempt.deleted_count, 0);
    assert!(device_row(&app, &device.device_id.0).await.is_some());
}

#[tokio::test]
async fn unregistering_needs_a_valid_json_body() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    register(&mut user, &registration(&token())).await;
    let no_body = ok(user
        .agent
        .send(reqwest::Method::DELETE, "/api/push/devices", None, &[])
        .await);
    expect_invalid(&no_body, "Required", "root");
    let send = |body: Value| {
        let mut agent = user.agent.clone();
        async move {
            ok(agent
                .send(
                    reqwest::Method::DELETE,
                    "/api/push/devices",
                    Some(body),
                    &[],
                )
                .await)
        }
    };
    expect_invalid(
        &send(json!({"token": "short"})).await,
        "String must contain at least 16 character(s)",
        "token",
    );
    expect_invalid(
        &send(json!({"token": null})).await,
        "Expected string, received null",
        "token",
    );
    expect_unknown_field(&send(json!({"userId": user.id})).await, "userId");
    assert_eq!(device_count(&app, &user).await, 1);
}

#[tokio::test]
async fn the_test_push_queues_an_opaque_reminder_job() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let raw = token();
    register(&mut user, &registration(&raw)).await;

    let queued: PushTestResult = ok(user
        .post("/api/push/test", json!({}))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert!(queued.success);

    let job: JobRow = sqlx::query_as(
        "SELECT user_id, kind, channel, event_id, payload::text, status, attempts, claimed_at IS NULL, last_error, available_at <= now() \
         FROM notification_job WHERE id = $1",
    )
    .bind(&queued.job_id)
    .fetch_one(&app.db)
    .await
    .expect("outbox row");
    let payload: Value = serde_json::from_str(&job.4).expect("payload json");
    assert_eq!(
        payload,
        json!({"kind": "event_reminder", "eventId": "test-notification", "minutesBefore": 15}),
        "only opaque references go into the outbox"
    );
    assert_eq!(
        (
            job.0.as_str(),
            job.1.as_str(),
            job.2.as_str(),
            job.3.as_deref(),
            job.5.as_str(),
            job.6,
            job.7,
            job.8.as_deref(),
            job.9
        ),
        (
            user.id.as_str(),
            "event_reminder",
            "push",
            Some("test-notification"),
            "pending",
            0,
            true,
            None,
            true
        )
    );
    assert!(!job.4.contains(&raw) && !job.4.contains(&user.email));
    assert_eq!(job_count(&app, &user).await, 1);
}

#[tokio::test]
async fn the_test_push_needs_notifications_on_and_an_enabled_device() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let no_device = ok(user.post("/api/push/test", json!({})).await.expect_error(
        400,
        "Validation Error",
        NO_DEVICE,
    ));
    assert!(no_device.get("details").is_none(), "{no_device}");

    let device = register(&mut user, &registration(&token())).await;
    sqlx::query("UPDATE push_device SET is_enabled = false WHERE id = $1")
        .bind(&device.device_id.0)
        .execute(&app.db)
        .await
        .expect("disable device");
    ok(user.post("/api/push/test", json!({})).await.expect_error(
        400,
        "Validation Error",
        NO_DEVICE,
    ));

    register(&mut user, &registration(&token())).await;
    ok(user
        .put("/api/settings", json!({"pushNotifications": false}))
        .await
        .expect_status(200));
    let off = ok(user.post("/api/push/test", json!({})).await.expect_error(
        400,
        "Validation Error",
        "App notifications are turned off. Enable them before sending a test.",
    ));
    assert!(off.get("details").is_none(), "{off}");
    assert_eq!(job_count(&app, &user).await, 0);
}

#[tokio::test]
async fn the_test_push_is_rate_limited_per_user_and_url() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let mut other = app.user().await;
    register(&mut user, &registration(&token())).await;
    register(&mut other, &registration(&token())).await;
    for _ in 0..5 {
        ok(user
            .post("/api/push/test", json!({}))
            .await
            .expect_status(200));
    }
    let limited = user.post("/api/push/test", json!({})).await;
    assert_eq!(limited.status.as_u16(), 429, "{}", limited.text());
    let error = ok(limited.value());
    assert_eq!(error["error"], "Too Many Requests", "{error}");
    let message = error["message"].as_str().expect("message");
    assert!(
        message.starts_with("Rate limit exceeded. Try again in ") && message.ends_with(" seconds."),
        "{message}"
    );
    let retry_after: u64 = limited
        .headers
        .get("retry-after")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse().ok())
        .expect("Retry-After");
    assert!((1..=60).contains(&retry_after), "{retry_after}");
    assert_eq!(job_count(&app, &user).await, 5);

    ok(other
        .post("/api/push/test", json!({}))
        .await
        .expect_status(200));
    // Pinned as is: the limiter keys on the full request URL, so a query string starts a fresh budget.
    ok(user
        .post("/api/push/test?again=1", json!({}))
        .await
        .expect_status(200));
    assert_eq!(job_count(&app, &user).await, 6);
}
