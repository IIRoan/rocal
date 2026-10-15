//! `/api/subscriptions`: SSRF refusals, feed CRUD, manual sync and ICS imports; feeds are inserted directly because no local feed is fetchable.

use serde_json::{Value, json};
use solace_api_tests::seed::{fake_envelope, fake_token};
use solace_api_types::Timestamp;
use solace_api_types::events::ParticipantInput;
use solace_api_types::subscriptions::{
    CalendarSubscription, CreateSubscriptionRequest, DeleteSubscriptionResponse, EncryptedIcsEvent,
    EncryptedIcsImportRequest, ImportIcsRequest, ImportIcsResponse, LegacyIcsImportRequest,
    UpdateSubscriptionRequest,
};

use crate::helpers::{
    Backend, TestApp, TestUser, count, expect_field_error, expect_invalid, expect_unauthorized,
    expect_unknown_field, hex, json_body, ok,
};

const PRIVATE_NETWORK: &str = "URLs pointing to internal or private networks are not allowed";
const UNSUPPORTED_SCHEME: &str = "Only HTTP, HTTPS and webcal URLs are supported";
const INVALID_URL: &str = "Calendar URL is invalid";
const COLOR_MESSAGE: &str = "Color must be one of: blue, orange, violet, rose, emerald, red, cyan, lime, amber, indigo, pink, teal or a valid hex color (e.g., #FF0000)";
const NAMED_COLORS: [&str; 12] = [
    "blue", "orange", "violet", "rose", "emerald", "red", "cyan", "lime", "amber", "indigo",
    "pink", "teal",
];

/// The create flow wraps every fetch failure in this prefix.
fn create_error(reason: &str) -> String {
    format!("Unable to fetch or parse calendar from URL: {reason}")
}

/// `toISOString()` of a `TIMESTAMP(3)` column, for comparing database values with the wire.
fn iso(column: &str) -> String {
    format!("to_char({column}, 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')")
}

struct Feed {
    subscription_id: String,
    calendar_id: String,
}

/// `(status, error, added, updated, deleted, http status, completed, timed)` of a sync log.
type SyncLogRow = (
    String,
    Option<String>,
    i32,
    i32,
    i32,
    Option<i32>,
    bool,
    bool,
);
/// `(email, display name, status, role, user id)` of a participant.
type AttendeeRow = (String, Option<String>, String, String, Option<String>);

/// A sync-only calendar and its subscription; `last_sync_at = now()` keeps the 15-minute scheduler away from it.
async fn insert_feed(app: &TestApp, user: &TestUser, url: &str, age_minutes: i32) -> Feed {
    let feed = Feed {
        subscription_id: format!("suitesub{}", hex(8)),
        calendar_id: format!("suitecal{}", hex(8)),
    };
    sqlx::query(
        "INSERT INTO calendar (id, name, color, kind, is_sync_only, user_id, created_at, updated_at) \
         VALUES ($1, 'Feed', '#6366f1', 'subscribed', true, $2, now(), now())",
    )
    .bind(&feed.calendar_id)
    .bind(&user.id)
    .execute(&app.db)
    .await
    .expect("insert feed calendar");
    sqlx::query(
        "INSERT INTO calendar_subscription (id, name, url, user_id, calendar_id, last_sync_at, created_at, updated_at) \
         VALUES ($1, 'Feed', $2, $3, $4, now(), now() - make_interval(mins => $5), now())",
    )
    .bind(&feed.subscription_id)
    .bind(url)
    .bind(&user.id)
    .bind(&feed.calendar_id)
    .bind(age_minutes)
    .execute(&app.db)
    .await
    .expect("insert subscription");
    feed
}

async fn insert_synced_event(app: &TestApp, user: &TestUser, feed: &Feed) -> String {
    let event_id = format!("suiteevt{}", hex(8));
    sqlx::query(
        "INSERT INTO calendar_event (id, title, start, \"end\", user_id, calendar_id, is_synced, external_id, subscription_id, synced_at, created_at, updated_at) \
         VALUES ($1, 'Feed event', now(), now() + interval '1 hour', $2, $3, true, $4, $5, now(), now(), now())",
    )
    .bind(&event_id)
    .bind(&user.id)
    .bind(&feed.calendar_id)
    .bind(format!("{}@example.com", hex(6)))
    .bind(&feed.subscription_id)
    .execute(&app.db)
    .await
    .expect("insert synced event");
    event_id
}

async fn own_subscription_count(app: &TestApp, user: &TestUser) -> i64 {
    count(
        &app.db,
        "SELECT count(*) FROM calendar_subscription WHERE user_id = $1",
        &user.id,
    )
    .await
}

async fn own_calendar_count(app: &TestApp, user: &TestUser) -> i64 {
    count(
        &app.db,
        "SELECT count(*) FROM calendar WHERE user_id = $1",
        &user.id,
    )
    .await
}

/// `(name, is_active, sync_interval_minutes, last_sync_status, last_error_message)`.
async fn subscription_state(
    app: &TestApp,
    subscription_id: &str,
) -> (String, bool, i32, String, Option<String>) {
    sqlx::query_as(
        "SELECT name, is_active, sync_interval_minutes, last_sync_status, last_error_message \
         FROM calendar_subscription WHERE id = $1",
    )
    .bind(subscription_id)
    .fetch_one(&app.db)
    .await
    .expect("subscription row")
}

async fn calendar_state(app: &TestApp, calendar_id: &str) -> (String, String, String, bool) {
    sqlx::query_as("SELECT name, color, kind, is_sync_only FROM calendar WHERE id = $1")
        .bind(calendar_id)
        .fetch_one(&app.db)
        .await
        .expect("calendar row")
}

async fn create(user: &mut TestUser, url: &str) -> solace_api_tests::client::ApiResponse {
    user.post(
        "/api/subscriptions",
        json_body(&CreateSubscriptionRequest {
            name: "Holidays".into(),
            url: url.into(),
            color: None,
        }),
    )
    .await
}

async fn owned_calendar(user: &mut TestUser) -> String {
    let calendar = ok(user
        .post(
            "/api/calendars",
            json!({"name": "Imports", "color": "#3b82f6"}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    calendar["id"].as_str().expect("calendar id").to_owned()
}

#[tokio::test]
async fn anonymous_callers_are_refused() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let feed = insert_feed(&app, &owner, "https://example.com/feed.ics", 0).await;
    let calendar_id = owned_calendar(&mut owner).await;
    let mut anon = app.anonymous();
    let path = format!("/api/subscriptions/{}", feed.subscription_id);

    expect_unauthorized(&ok(anon.get("/api/subscriptions").await));
    expect_unauthorized(&ok(anon
        .post(
            "/api/subscriptions",
            json!({"name": "X", "url": "https://example.com/x.ics"}),
        )
        .await));
    expect_unauthorized(&ok(anon.put(&path, json!({"name": "Mine"})).await));
    expect_unauthorized(&ok(anon.delete(&path).await));
    expect_unauthorized(&ok(anon.post(&format!("{path}/sync"), json!({})).await));
    expect_unauthorized(&ok(anon
        .post(
            "/api/subscriptions/import-ics",
            json!({"calendarId": calendar_id, "icsContent": "BEGIN:VCALENDAR"}),
        )
        .await));

    assert_eq!(
        subscription_state(&app, &feed.subscription_id).await.0,
        "Feed"
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM calendar_sync_log WHERE subscription_id = $1",
            &feed.subscription_id
        )
        .await,
        0
    );
}

#[tokio::test]
async fn create_refuses_private_and_loopback_literals_before_connecting() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let urls = [
        "http://127.0.0.1/",
        "http://127.1/",
        "http://2130706433/",
        "http://0x7f000001/",
        "http://0x7f.1/",
        "http://0177.0.0.1/",
        "http://0.0.0.0/",
        "http://0.1.2.3/",
        "http://10.0.0.1/",
        "http://100.64.0.1/",
        "http://100.127.255.254/",
        "http://169.254.169.254/latest/meta-data",
        "http://172.16.0.1/",
        "http://192.168.0.1/",
        "http://198.18.0.1/",
        "http://192.0.2.10/feed.ics",
        "http://198.51.100.10/feed.ics",
        "http://203.0.113.10/feed.ics",
        "http://224.0.0.1/",
        "http://255.255.255.255/",
        "http://[::]/",
        "http://[::1]/",
        "http://[::ffff:127.0.0.1]/",
        "http://[::ffff:10.0.0.1]/",
        "http://[::ffff:169.254.169.254]/",
        "http://[::ffff:a9fe:a9fe]/",
        "http://[0:0:0:0:0:ffff:a9fe:a9fe]/",
        "http://[::127.0.0.1]/",
        "http://[64:ff9b::7f00:1]/",
        "http://[64:ff9b::a00:1]/",
        "http://[fc00::1]/",
        "http://[fd00::1]/",
        "http://[fd12:3456::1]/",
        "http://[fe80::1]/",
        "http://[ff02::1]/",
        "http://[2001:db8::1]/",
        "http://[2002:7f00:1::]/",
        "http://[2001:0:4136:e378::1]/",
        "http://localhost/",
        "http://LOCALHOST./",
        "http://foo.localhost/",
        "http://printer.local/",
        "http://metadata.google.internal/",
        "http://solace-api.railway.internal/",
        "https://127.0.0.1:58080/jmap/session",
        "http://localhost:4131/api/health",
        "webcal://169.254.169.254/feed.ics",
        "webcal://localhost/feed.ics",
        "  http://127.0.0.1/padded.ics  ",
    ];
    for url in urls {
        let response = create(&mut user, url).await;
        expect_field_error(&response, &create_error(PRIVATE_NETWORK), "url");
    }
    assert_eq!(own_subscription_count(&app, &user).await, 0);
    assert_eq!(
        own_calendar_count(&app, &user).await,
        0,
        "no calendar is created for a refused feed"
    );
}

/// A plain DNS name the backend's host resolves to loopback, so only the connect-time check catches it; Railway's containers know `ip6-localhost` instead.
fn loopback_feed() -> String {
    let host =
        std::env::var("TEST_LOOPBACK_DNS_NAME").unwrap_or_else(|_| "localhost.localdomain".into());
    format!("http://{host}/feed.ics")
}

#[tokio::test]
async fn create_refuses_hosts_that_resolve_to_loopback_at_connect_time() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let response = create(&mut user, &loopback_feed()).await;
    expect_field_error(&response, &create_error(PRIVATE_NETWORK), "url");
    assert_eq!(own_subscription_count(&app, &user).await, 0);
}

#[tokio::test]
async fn create_rejects_unsupported_schemes_and_credentials() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let cases = [
        ("ftp://example.com/feed.ics", UNSUPPORTED_SCHEME),
        ("file:///etc/passwd", UNSUPPORTED_SCHEME),
        ("gopher://example.com/", UNSUPPORTED_SCHEME),
        ("javascript:alert(1)", UNSUPPORTED_SCHEME),
        ("data:text/calendar,BEGIN:VCALENDAR", UNSUPPORTED_SCHEME),
        ("http://user:secret@example.com/feed.ics", INVALID_URL),
        ("https://user@example.com/feed.ics", INVALID_URL),
        ("webcal://user:secret@example.com/feed.ics", INVALID_URL),
    ];
    for (url, reason) in cases {
        let response = create(&mut user, url).await;
        expect_field_error(&response, &create_error(reason), "url");
    }
    assert_eq!(own_subscription_count(&app, &user).await, 0);
}

#[tokio::test]
async fn create_validates_the_body() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let url = "https://example.com/feed.ics";
    let cases = [
        (
            json!({"name": "", "url": url}),
            "String must contain at least 1 character(s)",
            "name",
        ),
        (
            json!({"name": "X", "url": "not a url"}),
            "Invalid url",
            "url",
        ),
        (
            json!({"name": "X", "url": "http://[fe80::1%25eth0]/"}),
            "Invalid url",
            "url",
        ),
        (
            json!({"name": 7, "url": url}),
            "Expected string, received number",
            "name",
        ),
        (
            json!({"name": "X", "url": url, "color": "navy"}),
            COLOR_MESSAGE,
            "color",
        ),
        (
            json!({"name": "X", "url": url, "color": "#12345"}),
            COLOR_MESSAGE,
            "color",
        ),
    ];
    for (body, message, path) in cases {
        expect_invalid(
            &user.post("/api/subscriptions", body.clone()).await,
            message,
            path,
        );
    }

    let missing = ok(user
        .post("/api/subscriptions", json!({}))
        .await
        .expect_error(400, "Validation Error", "Required"));
    assert_eq!(
        missing["details"]["issues"],
        json!([
            {"path": "name", "message": "Required"},
            {"path": "url", "message": "Required"},
        ])
    );
    expect_unknown_field(
        &user
            .post(
                "/api/subscriptions",
                json!({"name": "X", "url": url, "userId": user.id}),
            )
            .await,
        "userId",
    );
    assert_eq!(own_subscription_count(&app, &user).await, 0);
}

#[tokio::test]
async fn create_requires_a_non_blank_name_before_fetching() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let response = user
        .post(
            "/api/subscriptions",
            json!({"name": "   ", "url": "http://127.0.0.1/feed.ics"}),
        )
        .await;
    expect_field_error(&response, "Calendar name is required", "name");
}

#[tokio::test]
async fn create_refuses_a_url_the_user_already_follows() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut other = app.user().await;
    let url = format!("http://127.0.0.1/{}.ics", hex(4));
    insert_feed(&app, &owner, &url, 0).await;

    expect_field_error(
        &create(&mut owner, &url).await,
        "You are already subscribed to this calendar URL",
        "url",
    );
    // Uniqueness is per user, so someone else reaches the fetch (and its refusal) instead.
    expect_field_error(
        &create(&mut other, &url).await,
        &create_error(PRIVATE_NETWORK),
        "url",
    );
    assert_eq!(own_subscription_count(&app, &owner).await, 1);
    assert_eq!(own_subscription_count(&app, &other).await, 0);
}

#[tokio::test]
async fn list_returns_own_feeds_newest_first_with_calendar_and_sync_log_count() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let other = app.user().await;
    let older = insert_feed(&app, &owner, "https://example.com/older.ics", 30).await;
    let newer = insert_feed(&app, &owner, "https://example.com/newer.ics", 5).await;
    insert_feed(&app, &other, "https://example.com/other.ics", 0).await;
    for status in ["success", "error"] {
        sqlx::query(
            "INSERT INTO calendar_sync_log (id, subscription_id, status) VALUES ($1, $2, $3)",
        )
        .bind(format!("suitelog{}", hex(8)))
        .bind(&older.subscription_id)
        .bind(status)
        .execute(&app.db)
        .await
        .expect("insert sync log");
    }

    let list: Vec<CalendarSubscription> = ok(owner
        .get("/api/subscriptions")
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));

    let ids: Vec<&str> = list.iter().map(|s| s.id.0.as_str()).collect();
    assert_eq!(
        ids,
        [
            newer.subscription_id.as_str(),
            older.subscription_id.as_str()
        ]
    );
    let first = &list[1];
    assert_eq!(first.url, "https://example.com/older.ics");
    assert_eq!(first.user_id.0, owner.id);
    assert_eq!(first.calendar_id.0, older.calendar_id);
    assert_eq!(
        (
            first.is_active,
            first.sync_interval_minutes,
            first.last_sync_status.as_str()
        ),
        (true, 15, "pending")
    );
    assert_eq!(
        (&first.last_error_message, &first.etag, &first.last_modified),
        (&None, &None, &None)
    );
    assert_eq!(first.count.as_ref().map(|c| c.sync_logs), Some(2));
    assert_eq!(list[0].count.as_ref().map(|c| c.sync_logs), Some(0));
    let calendar = &first.calendar;
    assert_eq!(calendar.id.0, older.calendar_id);
    assert_eq!(
        (
            calendar.kind.as_str(),
            calendar.is_sync_only,
            calendar.color.as_str()
        ),
        ("subscribed", true, "#6366f1")
    );
    assert_eq!(calendar.blind_index_tokens, None);
    let (last_sync_at, created_at): (String, String) = sqlx::query_as(&format!(
        "SELECT {}, {} FROM calendar_subscription WHERE id = $1",
        iso("last_sync_at"),
        iso("created_at")
    ))
    .bind(&older.subscription_id)
    .fetch_one(&app.db)
    .await
    .expect("subscription times");
    assert_eq!(first.last_sync_at, Some(Timestamp(last_sync_at)));
    assert_eq!(first.created_at, Timestamp(created_at));

    let forged: Vec<CalendarSubscription> = ok(owner
        .get(&format!("/api/subscriptions?userId={}", other.id))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(forged, list, "a userId in the query is ignored");

    let empty: Vec<CalendarSubscription> = ok(app
        .user()
        .await
        .get("/api/subscriptions")
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert!(empty.is_empty());
}

#[tokio::test]
async fn update_changes_the_feed_and_its_mirrored_calendar() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let feed = insert_feed(&app, &user, "https://example.com/feed.ics", 0).await;

    let updated: CalendarSubscription = ok(user
        .put(
            &format!("/api/subscriptions/{}", feed.subscription_id),
            json_body(&UpdateSubscriptionRequest {
                name: Some("  Team holidays  ".into()),
                color: Some("teal".into()),
                is_active: Some(false),
                sync_interval_minutes: Some(60),
            }),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));

    assert_eq!(updated.name, "Team holidays");
    assert_eq!(
        (updated.is_active, updated.sync_interval_minutes),
        (false, 60)
    );
    assert_eq!(
        (
            updated.calendar.name.as_str(),
            updated.calendar.color.as_str()
        ),
        ("Team holidays", "teal")
    );
    assert_eq!(updated.count, None, "only the list carries _count");
    assert_eq!(
        subscription_state(&app, &feed.subscription_id).await,
        ("Team holidays".into(), false, 60, "pending".into(), None)
    );
    assert_eq!(
        calendar_state(&app, &feed.calendar_id).await,
        (
            "Team holidays".into(),
            "teal".into(),
            "subscribed".into(),
            true
        )
    );

    let paused_only: CalendarSubscription = ok(user
        .put(
            &format!("/api/subscriptions/{}", feed.subscription_id),
            json!({"isActive": true}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert!(paused_only.is_active);
    assert_eq!(
        (
            paused_only.name.as_str(),
            paused_only.calendar.color.as_str()
        ),
        ("Team holidays", "teal"),
        "omitted fields stay"
    );
}

#[tokio::test]
async fn update_accepts_every_named_color_and_hex_colors() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let feed = insert_feed(&app, &user, "https://example.com/feed.ics", 0).await;
    let path = format!("/api/subscriptions/{}", feed.subscription_id);
    for color in NAMED_COLORS.into_iter().chain(["#FF5733", "#abc"]) {
        let updated: CalendarSubscription = ok(user
            .put(&path, json!({"color": color}))
            .await
            .expect_status(200)
            .and_then(|r| r.dto()));
        assert_eq!(updated.calendar.color, color);
        assert_eq!(calendar_state(&app, &feed.calendar_id).await.1, color);
    }
    let renamed: CalendarSubscription = ok(user
        .put(&path, json!({"name": "Updated"}))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        renamed.calendar.color, "#abc",
        "an update without color keeps it"
    );
}

#[tokio::test]
async fn update_rejects_invalid_colors_listing_every_allowed_one() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let feed = insert_feed(&app, &user, "https://example.com/feed.ics", 0).await;
    let path = format!("/api/subscriptions/{}", feed.subscription_id);
    for color in [
        "chartreuse",
        "BLUE",
        "navy",
        "#GGG",
        "#12345",
        "rgb(0,0,0)",
        "invalid",
    ] {
        let error = expect_invalid(
            &user.put(&path, json!({"color": color})).await,
            COLOR_MESSAGE,
            "color",
        );
        for allowed in NAMED_COLORS {
            assert!(
                error["message"]
                    .as_str()
                    .is_some_and(|m| m.contains(allowed)),
                "{error}"
            );
        }
    }
    assert_eq!(calendar_state(&app, &feed.calendar_id).await.1, "#6366f1");
}

#[tokio::test]
async fn update_validates_names_intervals_and_fields() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let feed = insert_feed(&app, &user, "https://example.com/feed.ics", 0).await;
    let path = format!("/api/subscriptions/{}", feed.subscription_id);

    expect_field_error(
        &user.put(&path, json!({"name": "   "})).await,
        "Calendar name is required",
        "name",
    );
    expect_field_error(
        &user.put(&path, json!({"name": "a".repeat(101)})).await,
        "Calendar name cannot exceed 100 characters",
        "name",
    );
    for (body, message, field) in [
        (
            json!({"syncIntervalMinutes": 4}),
            "Number must be greater than or equal to 5",
            "syncIntervalMinutes",
        ),
        (
            json!({"syncIntervalMinutes": 1441}),
            "Number must be less than or equal to 1440",
            "syncIntervalMinutes",
        ),
        (
            json!({"syncIntervalMinutes": 5.5}),
            "Expected integer, received float",
            "syncIntervalMinutes",
        ),
        (
            json!({"isActive": "yes"}),
            "Expected boolean, received string",
            "isActive",
        ),
        (
            json!({"name": null}),
            "Expected string, received null",
            "name",
        ),
    ] {
        expect_invalid(&user.put(&path, body).await, message, field);
    }
    expect_unknown_field(
        &user
            .put(&path, json!({"name": "X", "userId": user.id}))
            .await,
        "userId",
    );
    expect_unknown_field(
        &user
            .put(&path, json!({"url": "https://example.com/other.ics"}))
            .await,
        "url",
    );
    assert_eq!(
        subscription_state(&app, &feed.subscription_id).await,
        ("Feed".into(), true, 15, "pending".into(), None)
    );

    let longest: CalendarSubscription = ok(user
        .put(
            &path,
            json!({"name": "b".repeat(100), "syncIntervalMinutes": 1440}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        (longest.name.len(), longest.sync_interval_minutes),
        (100, 1440)
    );
}

#[tokio::test]
async fn missing_and_foreign_feeds_are_not_found() {
    let app = TestApp::spawn().await;
    let owner = app.user().await;
    let mut other = app.user().await;
    let feed = insert_feed(&app, &owner, "https://example.com/feed.ics", 0).await;
    let event_id = insert_synced_event(&app, &owner, &feed).await;
    let foreign = format!("/api/subscriptions/{}", feed.subscription_id);

    for path in [foreign.as_str(), "/api/subscriptions/does-not-exist"] {
        for response in [
            other.put(path, json!({"color": "rose"})).await,
            other.delete(path).await,
            other.post(&format!("{path}/sync"), json!({})).await,
        ] {
            ok(response.expect_error(404, "Not Found", "Subscription not found"));
        }
    }

    assert_eq!(
        subscription_state(&app, &feed.subscription_id).await,
        ("Feed".into(), true, 15, "pending".into(), None)
    );
    assert_eq!(calendar_state(&app, &feed.calendar_id).await.1, "#6366f1");
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM calendar_event WHERE id = $1 AND is_synced",
            &event_id
        )
        .await,
        1
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM calendar_sync_log WHERE subscription_id = $1",
            &feed.subscription_id
        )
        .await,
        0,
        "a foreign sync never starts"
    );
}

#[tokio::test]
async fn delete_keeps_events_and_turns_the_calendar_into_an_owned_one() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    for query in ["", "?deleteEvents=false", "?deleteEvents="] {
        let feed = insert_feed(
            &app,
            &user,
            &format!("https://example.com/{}.ics", hex(4)),
            0,
        )
        .await;
        let event_id = insert_synced_event(&app, &user, &feed).await;
        sqlx::query("INSERT INTO calendar_sync_log (id, subscription_id, status) VALUES ($1, $2, 'success')")
            .bind(format!("suitelog{}", hex(8)))
            .bind(&feed.subscription_id)
            .execute(&app.db)
            .await
            .expect("insert sync log");

        let deleted: DeleteSubscriptionResponse = ok(user
            .delete(&format!(
                "/api/subscriptions/{}{query}",
                feed.subscription_id
            ))
            .await
            .expect_status(200)
            .and_then(|r| r.dto()));
        assert_eq!(deleted, DeleteSubscriptionResponse { success: true });

        let event: (Option<String>, bool, Option<String>, bool, String) = sqlx::query_as(
            "SELECT subscription_id, is_synced, external_id, synced_at IS NULL, calendar_id FROM calendar_event WHERE id = $1",
        )
        .bind(&event_id)
        .fetch_one(&app.db)
        .await
        .expect("kept event");
        assert_eq!(
            event,
            (None, false, None, true, feed.calendar_id.clone()),
            "{query}"
        );
        let calendar = calendar_state(&app, &feed.calendar_id).await;
        assert_eq!(
            (calendar.2.as_str(), calendar.3),
            ("owned", false),
            "{query}"
        );
        for table in [
            "calendar_subscription WHERE id",
            "calendar_sync_log WHERE subscription_id",
        ] {
            assert_eq!(
                count(
                    &app.db,
                    &format!("SELECT count(*) FROM {table} = $1"),
                    &feed.subscription_id
                )
                .await,
                0,
                "{table} {query}"
            );
        }
    }
}

#[tokio::test]
async fn delete_with_delete_events_removes_events_and_the_calendar() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let feed = insert_feed(&app, &user, "https://example.com/feed.ics", 0).await;
    let event_id = insert_synced_event(&app, &user, &feed).await;
    let unrelated = owned_calendar(&mut user).await;

    let deleted: DeleteSubscriptionResponse = ok(user
        .delete(&format!(
            "/api/subscriptions/{}?deleteEvents=true",
            feed.subscription_id
        ))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert!(deleted.success);
    for (sql, id) in [
        (
            "SELECT count(*) FROM calendar_event WHERE id = $1",
            &event_id,
        ),
        (
            "SELECT count(*) FROM calendar WHERE id = $1",
            &feed.calendar_id,
        ),
        (
            "SELECT count(*) FROM calendar_subscription WHERE id = $1",
            &feed.subscription_id,
        ),
    ] {
        assert_eq!(count(&app.db, sql, id).await, 0, "{sql}");
    }
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM calendar WHERE id = $1",
            &unrelated
        )
        .await,
        1
    );
}

#[tokio::test]
async fn delete_validates_its_query() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let feed = insert_feed(&app, &user, "https://example.com/feed.ics", 0).await;
    let path = format!("/api/subscriptions/{}", feed.subscription_id);
    for (query, message, field) in [
        (
            "?deleteEvents=maybe",
            "Expected boolean, received string",
            "deleteEvents",
        ),
        (
            "?deleteEvents=1",
            "Expected boolean, received string",
            "deleteEvents",
        ),
    ] {
        expect_invalid(
            &user.delete(&format!("{path}{query}")).await,
            message,
            field,
        );
    }
    expect_unknown_field(
        &user.delete(&format!("{path}?userId={}", user.id)).await,
        "userId",
    );
    assert_eq!(own_subscription_count(&app, &user).await, 1);
}

#[tokio::test]
async fn sync_refuses_a_stored_private_url_and_records_the_failure() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let feed = insert_feed(&app, &user, "http://169.254.169.254/latest/meta-data", 0).await;
    let event_id = insert_synced_event(&app, &user, &feed).await;
    let (before,): (String,) = sqlx::query_as(&format!(
        "SELECT {} FROM calendar_subscription WHERE id = $1",
        iso("last_sync_at")
    ))
    .bind(&feed.subscription_id)
    .fetch_one(&app.db)
    .await
    .expect("last sync");

    let response = user
        .post(
            &format!("/api/subscriptions/{}/sync", feed.subscription_id),
            json!({}),
        )
        .await;
    expect_field_error(&response, PRIVATE_NETWORK, "url");

    let logs: Vec<SyncLogRow> = sqlx::query_as(
        "SELECT status, error_message, events_added, events_updated, events_deleted, http_status_code, \
         completed_at IS NOT NULL, sync_duration_ms IS NOT NULL FROM calendar_sync_log WHERE subscription_id = $1",
    )
    .bind(&feed.subscription_id)
    .fetch_all(&app.db)
    .await
    .expect("sync logs");
    assert_eq!(
        logs,
        [(
            "error".into(),
            Some(PRIVATE_NETWORK.into()),
            0,
            0,
            0,
            None,
            true,
            true
        )]
    );
    let state = subscription_state(&app, &feed.subscription_id).await;
    assert_eq!(
        (state.3.as_str(), state.4.as_deref()),
        ("error", Some(PRIVATE_NETWORK))
    );
    let (after,): (String,) = sqlx::query_as(&format!(
        "SELECT {} FROM calendar_subscription WHERE id = $1",
        iso("last_sync_at")
    ))
    .bind(&feed.subscription_id)
    .fetch_one(&app.db)
    .await
    .expect("last sync");
    assert!(after >= before, "a failed sync still stamps last_sync_at");
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM calendar_event WHERE id = $1 AND is_synced",
            &event_id
        )
        .await,
        1,
        "events survive a failed sync"
    );

    let listed: Vec<CalendarSubscription> = ok(user.get("/api/subscriptions").await.dto());
    assert_eq!(listed[0].last_sync_status, "error");
    assert_eq!(
        listed[0].last_error_message.as_deref(),
        Some(PRIVATE_NETWORK)
    );
    assert_eq!(listed[0].count.as_ref().map(|c| c.sync_logs), Some(1));
}

#[tokio::test]
async fn sync_revalidates_every_stored_url() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let loopback = loopback_feed();
    let cases = [
        (loopback.as_str(), PRIVATE_NETWORK),
        ("webcal://[::ffff:10.0.0.1]/feed.ics", PRIVATE_NETWORK),
        ("http://0x7f000001/feed.ics", PRIVATE_NETWORK),
        ("ftp://example.com/feed.ics", UNSUPPORTED_SCHEME),
        ("https://user:secret@example.com/feed.ics", INVALID_URL),
        ("not a url", INVALID_URL),
    ];
    for (url, message) in cases {
        let feed = insert_feed(&app, &user, url, 0).await;
        let response = user
            .post(
                &format!("/api/subscriptions/{}/sync", feed.subscription_id),
                json!({}),
            )
            .await;
        expect_field_error(&response, message, "url");
        let state = subscription_state(&app, &feed.subscription_id).await;
        assert_eq!(
            (state.3.as_str(), state.4.as_deref()),
            ("error", Some(message)),
            "{url}"
        );
    }
}

#[tokio::test]
async fn manual_sync_also_runs_for_paused_feeds() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let feed = insert_feed(&app, &user, "http://10.0.0.1/feed.ics", 0).await;
    sqlx::query("UPDATE calendar_subscription SET is_active = false WHERE id = $1")
        .bind(&feed.subscription_id)
        .execute(&app.db)
        .await
        .expect("pause feed");
    let path = format!("/api/subscriptions/{}/sync", feed.subscription_id);
    expect_field_error(&user.post(&path, json!({})).await, PRIVATE_NETWORK, "url");
    // The route reads no body.
    let no_body = ok(user
        .agent
        .send(reqwest::Method::POST, &path, None, &[])
        .await);
    expect_field_error(&no_body, PRIVATE_NETWORK, "url");
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM calendar_sync_log WHERE subscription_id = $1 AND status = 'error'",
            &feed.subscription_id
        )
        .await,
        2
    );
}

fn legacy_ics() -> String {
    [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Solace suite//EN",
        "X-WR-CALNAME:Team Cal",
        "BEGIN:VEVENT",
        "UID:evt-1@example.com",
        "DTSTAMP:20261001T000000Z",
        "DTSTART:20261101T090000Z",
        "DTEND:20261101T100000Z",
        "SUMMARY:Planning",
        "LOCATION:Room 1",
        "DESCRIPTION:Agenda",
        "ATTENDEE;CN=Guest;PARTSTAT=ACCEPTED:mailto:guest@example.com",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:evt-2@example.com",
        "DTSTAMP:20261001T000000Z",
        "DTSTART;VALUE=DATE:20261105",
        "DTEND;VALUE=DATE:20261106",
        "SUMMARY:Offsite",
        "RRULE:FREQ=WEEKLY;COUNT=3",
        "END:VEVENT",
        "END:VCALENDAR",
        "",
    ]
    .join("\r\n")
}

fn legacy_import(calendar_id: &str, file_name: Option<&str>) -> Value {
    json_body(&ImportIcsRequest::Legacy(LegacyIcsImportRequest {
        calendar_id: calendar_id.to_owned().into(),
        ics_content: legacy_ics(),
        file_name: file_name.map(str::to_owned),
    }))
}

type LegacyRow = (
    String,
    Option<String>,
    Option<String>,
    String,
    String,
    bool,
    bool,
    Option<String>,
    String,
    String,
    String,
);

#[tokio::test]
async fn legacy_ics_import_stores_the_parsed_events_and_attendees() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar_id = owned_calendar(&mut user).await;

    let imported: ImportIcsResponse = ok(user
        .post(
            "/api/subscriptions/import-ics",
            legacy_import(&calendar_id, Some("team.ics")),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        imported,
        ImportIcsResponse {
            success: true,
            events_created: 2,
            events_total: 2,
            file_name: Some("team.ics".into()),
            calendar_name: Some("Team Cal".into()),
            errors: None,
        }
    );

    // The legacy contract stores plaintext; shipped clients still send it.
    let rows: Vec<LegacyRow> = sqlx::query_as(&format!(
        "SELECT title, description, location, encryption_state, external_id, is_synced, all_day, recurrence, timezone, {}, {} \
         FROM calendar_event WHERE calendar_id = $1 ORDER BY external_id",
        iso("start"),
        iso("\"end\"")
    ))
    .bind(&calendar_id)
    .fetch_all(&app.db)
    .await
    .expect("imported events");
    assert_eq!(
        rows,
        [
            (
                "Planning".into(),
                Some("Agenda".into()),
                Some("Room 1".into()),
                "plaintext".into(),
                "evt-1@example.com".into(),
                false,
                false,
                None,
                "Etc/UTC".into(),
                "2026-11-01T09:00:00.000Z".into(),
                "2026-11-01T10:00:00.000Z".into(),
            ),
            (
                "Offsite".into(),
                None,
                None,
                "plaintext".into(),
                "evt-2@example.com".into(),
                false,
                true,
                Some(r#"{"frequency":"weekly","interval":1,"count":3,"timezone":"UTC"}"#.into()),
                "UTC".into(),
                "2026-11-05T00:00:00.000Z".into(),
                "2026-11-05T23:59:59.999Z".into(),
            ),
        ]
    );
    let attendees: Vec<AttendeeRow> = sqlx::query_as(
        "SELECT p.email, p.display_name, p.status, p.role, p.user_id FROM event_participant p \
         JOIN calendar_event e ON e.id = p.event_id WHERE e.calendar_id = $1",
    )
    .bind(&calendar_id)
    .fetch_all(&app.db)
    .await
    .expect("attendees");
    assert_eq!(
        attendees,
        [(
            "guest@example.com".into(),
            Some("Guest".into()),
            "accepted".into(),
            "attendee".into(),
            None
        )]
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM notification_job WHERE user_id = $1",
            &user.id
        )
        .await,
        0,
        "imports send no invitations"
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM user_settings WHERE user_id = $1",
            &user.id
        )
        .await,
        1,
        "reading the import timezone creates default settings"
    );
}

#[tokio::test]
async fn legacy_ics_import_reports_events_already_in_the_calendar() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar_id = owned_calendar(&mut user).await;
    ok(user
        .post(
            "/api/subscriptions/import-ics",
            legacy_import(&calendar_id, None),
        )
        .await
        .expect_status(200));

    let again: ImportIcsResponse = ok(user
        .post(
            "/api/subscriptions/import-ics",
            legacy_import(&calendar_id, None),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        again,
        ImportIcsResponse {
            success: true,
            events_created: 0,
            events_total: 2,
            file_name: Some("unknown.ics".into()),
            calendar_name: Some("Team Cal".into()),
            errors: Some(match app.backend {
                // TypeScript names each event by title, which is the file's content.
                Backend::TypeScript => vec![
                    "Event \"Planning\" with UID evt-1@example.com already exists in calendar"
                        .into(),
                    "Event \"Offsite\" with UID evt-2@example.com already exists in calendar"
                        .into(),
                ],
                Backend::Rust => vec!["An event already exists in this calendar.".into(); 2],
            }),
        }
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM calendar_event WHERE calendar_id = $1",
            &calendar_id
        )
        .await,
        2
    );
}

#[tokio::test]
async fn an_unreadable_rule_fails_only_its_event() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar_id = owned_calendar(&mut user).await;
    let ics = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:broken@example.com",
        "DTSTART:20261101T090000Z",
        "SUMMARY:Broken",
        "RRULE:FREQ=FORTNIGHTLY",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:yearly@example.com",
        "DTSTART:20260715T090000Z",
        "DTSTART:20260716T090000Z",
        "SUMMARY:Yearly",
        "RRULE:FREQ=YEARLY;BYMONTH=7;BYMONTHDAY=15",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:offset@example.com",
        "DTSTART;TZID=+0100:20261102T090000",
        "SUMMARY:Offset",
        "END:VEVENT",
        "END:VCALENDAR",
        "",
    ]
    .join("\r\n");
    let response = user
        .post(
            "/api/subscriptions/import-ics",
            json!({"calendarId": calendar_id, "icsContent": ics}),
        )
        .await;
    let stored = || async {
        let rows: Vec<(String, Option<String>, String, String)> = sqlx::query_as(&format!(
            "SELECT external_id, recurrence, timezone, {} FROM calendar_event WHERE calendar_id = $1 ORDER BY external_id",
            iso("start")
        ))
        .bind(&calendar_id)
        .fetch_all(&app.db)
        .await
        .expect("imported events");
        rows
    };
    match app.backend {
        // node-ical fails the whole file on one bad RRULE (or a repeated DTSTART).
        Backend::TypeScript => {
            ok(response.expect_error(400, "Validation Error", "No valid events found in ICS file"));
            assert!(stored().await.is_empty());
        }
        Backend::Rust => {
            let imported: ImportIcsResponse = ok(response.expect_status(200).and_then(|r| r.dto()));
            assert_eq!((imported.events_created, imported.events_total), (2, 2));
            assert_eq!(
                imported.errors,
                Some(vec![
                    "Failed to parse event broken@example.com: Invalid FREQ value: FORTNIGHTLY"
                        .into()
                ])
            );
            let rows = stored().await;
            assert_eq!(
                (
                    rows[0].0.as_str(),
                    &rows[0].1,
                    rows[0].2.as_str(),
                    rows[0].3.as_str()
                ),
                (
                    "offset@example.com",
                    &None,
                    "Etc/GMT-1",
                    "2026-11-02T08:00:00.000Z"
                ),
                "an offset TZID is a fixed offset"
            );
            let rule: Value =
                serde_json::from_str(rows[1].1.as_deref().expect("rule")).expect("rule json");
            assert_eq!(
                (rows[1].0.as_str(), rows[1].3.as_str()),
                ("yearly@example.com", "2026-07-15T09:00:00.000Z"),
                "the first DTSTART wins"
            );
            assert_eq!(
                (&rule["byMonth"], &rule["byMonthDay"]),
                (&json!([7]), &json!([15]))
            );
        }
    }
}

#[tokio::test]
async fn legacy_ics_import_without_events_is_rejected() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar_id = owned_calendar(&mut user).await;
    for content in ["BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n", "hello"] {
        let response = user
            .post(
                "/api/subscriptions/import-ics",
                json!({"calendarId": calendar_id, "icsContent": content}),
            )
            .await;
        let error =
            ok(response.expect_error(400, "Validation Error", "No valid events found in ICS file"));
        assert!(error.get("details").is_none(), "{error}");
    }
}

#[tokio::test]
async fn legacy_ics_import_ignores_the_read_only_flag() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let feed = insert_feed(&app, &user, "https://example.com/feed.ics", 0).await;
    // Pinned as is: unlike the encrypted import, the legacy path writes into a sync-only calendar.
    let imported: ImportIcsResponse = ok(user
        .post(
            "/api/subscriptions/import-ics",
            legacy_import(&feed.calendar_id, None),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(imported.events_created, 2);
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
        timezone: "UTC".into(),
        recurrence: None,
        encrypted_content: fake_envelope(),
        blind_index_tokens: None,
        encryption_key_version: None,
        participants: None,
    }
}

fn encrypted_import(calendar_id: &str, events: Vec<EncryptedIcsEvent>) -> Value {
    json_body(&ImportIcsRequest::Encrypted(EncryptedIcsImportRequest {
        calendar_id: calendar_id.to_owned().into(),
        encrypted_events: events,
    }))
}

type EncryptedRow = (
    String,
    String,
    Option<String>,
    Option<String>,
    String,
    Option<String>,
    i32,
    Option<String>,
    Option<String>,
    Option<String>,
    String,
    bool,
);

#[tokio::test]
async fn encrypted_import_stores_ciphertext_as_sent_and_links_overrides() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar_id = owned_calendar(&mut user).await;
    let token = fake_token();
    let mut series = encrypted_event(
        "series-1",
        "2026-11-01T09:00:00.000Z",
        "2026-11-01T10:00:00.000Z",
    );
    series.timezone = "Europe/Amsterdam".into();
    series.recurrence = Some(r#"{"frequency":"daily","interval":1,"count":3}"#.into());
    series.excluded_dates = Some(vec![Timestamp("2026-11-02T09:00:00.000Z".into())]);
    series.blind_index_tokens = Some(vec![token.clone()]);
    series.encryption_key_version = Some(3);
    let mut moved = encrypted_event(
        "override-1",
        "2026-11-03T11:00:00.000Z",
        "2026-11-03T12:00:00.000Z",
    );
    moved.series_external_id = Some("series-1".into());
    moved.occurrence_date = Some(Timestamp("2026-11-03T09:00:00.000Z".into()));
    moved.recurrence = Some(r#"{"frequency":"daily","interval":1}"#.into());
    moved.participants = Some(vec![ParticipantInput {
        email: "guest2@example.com".into(),
        display_name: Some("Guest Two".into()),
        role: None,
        status: None,
    }]);
    let mut orphan = moved.clone();
    orphan.external_id = "override-2".into();
    orphan.series_external_id = Some("missing-series".into());
    orphan.participants = None;
    let series_content = series.encrypted_content.clone();
    let moved_content = moved.encrypted_content.clone();

    // Overrides come first on purpose: the server imports series before their overrides.
    let imported: ImportIcsResponse = ok(user
        .post(
            "/api/subscriptions/import-ics",
            encrypted_import(&calendar_id, vec![moved, orphan, series]),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        imported,
        ImportIcsResponse {
            success: true,
            events_created: 2,
            events_total: 3,
            file_name: None,
            calendar_name: None,
            errors: Some(vec![
                "An occurrence could not be linked to its series.".into()
            ]),
        }
    );

    let rows: Vec<EncryptedRow> = sqlx::query_as(
        "SELECT external_id, title, description, location, encryption_state, encrypted_content, encryption_key_version, \
         blind_index_tokens, recurrence, parent_event_id, timezone, is_synced FROM calendar_event \
         WHERE calendar_id = $1 ORDER BY external_id DESC",
    )
    .bind(&calendar_id)
    .fetch_all(&app.db)
    .await
    .expect("imported events");
    let (series_id,): (String,) = sqlx::query_as(
        "SELECT id FROM calendar_event WHERE calendar_id = $1 AND external_id = 'series-1'",
    )
    .bind(&calendar_id)
    .fetch_one(&app.db)
    .await
    .expect("series id");
    assert_eq!(
        rows,
        [
            (
                "series-1".into(),
                String::new(),
                None,
                None,
                "encrypted".into(),
                Some(series_content),
                3,
                Some(format!("[\"{token}\"]")),
                Some(r#"{"frequency":"daily","interval":1,"count":3}"#.into()),
                None,
                "Europe/Amsterdam".into(),
                false,
            ),
            (
                "override-1".into(),
                String::new(),
                None,
                None,
                "encrypted".into(),
                Some(moved_content),
                1,
                Some("[]".into()),
                None,
                Some(series_id.clone()),
                "UTC".into(),
                false,
            ),
        ]
    );
    let exceptions: Vec<(String, String, Option<String>)> = sqlx::query_as(&format!(
        "SELECT type, {}, modified_event_id FROM recurrence_exception WHERE parent_event_id = $1 ORDER BY exception_date",
        iso("exception_date")
    ))
    .bind(&series_id)
    .fetch_all(&app.db)
    .await
    .expect("exceptions");
    let (override_id,): (String,) = sqlx::query_as(
        "SELECT id FROM calendar_event WHERE calendar_id = $1 AND external_id = 'override-1'",
    )
    .bind(&calendar_id)
    .fetch_one(&app.db)
    .await
    .expect("override id");
    assert_eq!(
        exceptions,
        [
            ("deleted".into(), "2026-11-02T09:00:00.000Z".into(), None),
            (
                "modified".into(),
                "2026-11-03T09:00:00.000Z".into(),
                Some(override_id.clone())
            ),
        ]
    );
    let attendees: Vec<(String, Option<String>)> =
        sqlx::query_as("SELECT email, display_name FROM event_participant WHERE event_id = $1")
            .bind(&override_id)
            .fetch_all(&app.db)
            .await
            .expect("attendees");
    assert_eq!(
        attendees,
        [("guest2@example.com".into(), Some("Guest Two".into()))]
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM notification_job WHERE user_id = $1",
            &user.id
        )
        .await,
        0,
        "imports send no invitations"
    );
}

#[tokio::test]
async fn encrypted_import_reports_events_already_in_the_calendar() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar_id = owned_calendar(&mut user).await;
    let event = encrypted_event(
        "uid-1",
        "2026-11-01T09:00:00.000Z",
        "2026-11-01T10:00:00.000Z",
    );
    ok(user
        .post(
            "/api/subscriptions/import-ics",
            encrypted_import(&calendar_id, vec![event.clone()]),
        )
        .await
        .expect_status(200));

    let again: ImportIcsResponse = ok(user
        .post(
            "/api/subscriptions/import-ics",
            encrypted_import(&calendar_id, vec![event]),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        again,
        ImportIcsResponse {
            success: true,
            events_created: 0,
            events_total: 1,
            file_name: None,
            calendar_name: None,
            errors: Some(vec!["An event already exists in this calendar.".into()]),
        }
    );
}

#[tokio::test]
async fn encrypted_import_refuses_read_only_calendars() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let feed = insert_feed(&app, &user, "https://example.com/feed.ics", 0).await;
    let event = encrypted_event(
        "uid-1",
        "2026-11-01T09:00:00.000Z",
        "2026-11-01T10:00:00.000Z",
    );
    expect_field_error(
        &user
            .post(
                "/api/subscriptions/import-ics",
                encrypted_import(&feed.calendar_id, vec![event]),
            )
            .await,
        "Cannot import events into a read-only calendar.",
        "calendarId",
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM calendar_event WHERE calendar_id = $1",
            &feed.calendar_id
        )
        .await,
        0
    );
}

#[tokio::test]
async fn imports_into_missing_or_foreign_calendars_are_not_found() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut other = app.user().await;
    let calendar_id = owned_calendar(&mut owner).await;
    let event = encrypted_event(
        "uid-1",
        "2026-11-01T09:00:00.000Z",
        "2026-11-01T10:00:00.000Z",
    );
    for target in [calendar_id.as_str(), "does-not-exist"] {
        for body in [
            legacy_import(target, None),
            encrypted_import(target, vec![event.clone()]),
        ] {
            ok(other
                .post("/api/subscriptions/import-ics", body)
                .await
                .expect_error(404, "Not Found", "Calendar not found or not owned by user"));
        }
    }
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM calendar_event WHERE calendar_id = $1",
            &calendar_id
        )
        .await,
        0
    );
}

#[tokio::test]
async fn imports_are_validated() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar_id = owned_calendar(&mut user).await;
    let event = || {
        serde_json::to_value(encrypted_event(
            "uid-1",
            "2026-11-01T09:00:00.000Z",
            "2026-11-01T10:00:00.000Z",
        ))
        .expect("event json")
    };
    let with = |field: &str, value: Value| {
        let mut event = event();
        event[field] = value;
        json!({"calendarId": calendar_id, "encryptedEvents": [event]})
    };
    let cases = [
        (json!({}), "Invalid input", "root"),
        (json!({"calendarId": calendar_id}), "Invalid input", "root"),
        (
            json!({"calendarId": calendar_id, "encryptedEvents": []}),
            "Array must contain at least 1 element(s)",
            "encryptedEvents",
        ),
        (
            json!({"calendarId": calendar_id, "encryptedEvents": vec![event(); 101]}),
            "Array must contain at most 100 element(s)",
            "encryptedEvents",
        ),
        (
            with("end", json!("2026-11-01T08:00:00.000Z")),
            "End must follow start",
            "encryptedEvents.0",
        ),
        (
            with("seriesExternalId", json!("series-1")),
            "An override requires a series and occurrence date",
            "encryptedEvents.0",
        ),
        (
            with("recurrence", json!("{\"frequency\":\"hourly\"}")),
            "Invalid recurrence rule",
            "encryptedEvents.0",
        ),
        (
            with("title", json!("Plaintext title")),
            "Unrecognized key(s) in object: 'title'",
            "encryptedEvents.0",
        ),
    ];
    for (body, message, path) in cases {
        expect_invalid(
            &user
                .post("/api/subscriptions/import-ics", body.clone())
                .await,
            message,
            path,
        );
    }
    expect_unknown_field(
        &user
            .post(
                "/api/subscriptions/import-ics",
                json!({"calendarId": calendar_id, "icsContent": legacy_ics(), "userId": user.id}),
            )
            .await,
        "userId",
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM calendar_event WHERE calendar_id = $1",
            &calendar_id
        )
        .await,
        0
    );
}
