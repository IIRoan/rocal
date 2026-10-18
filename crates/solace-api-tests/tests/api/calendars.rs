//! `/api/calendars`: default calendars, create/update/delete rules, encrypted names, and calendar access for events.

use serde_json::{Value, json};
use solace_api_types::calendars::{
    Calendar, CalendarDeleteResult, CalendarList, CreateCalendarRequest, UpdateCalendarRequest,
};
use sqlx::PgPool;

use crate::helpers::{
    TestApp, TestUser, count, expect_field_error, expect_invalid, expect_plain_error,
    expect_unauthorized, expect_unknown_field, hex, ok,
};

pub const NAMED_COLORS: [&str; 12] = [
    "blue", "orange", "violet", "rose", "emerald", "red", "cyan", "lime", "amber", "indigo",
    "pink", "teal",
];
pub const COLOR_MESSAGE: &str = "Color must be one of: blue, orange, violet, rose, emerald, red, cyan, lime, amber, indigo, pink, teal or a valid hex color (e.g., #FF0000)";
pub const PLAINTEXT_BESIDE_CIPHERTEXT: &str =
    "Plaintext names must not be sent alongside an encrypted name.";
const NOT_FOUND: &str = "Calendar not found or access denied";
const ONLY_OWNED_UPDATE: &str = "Only owned calendars can be updated here. Manage subscribed or public calendars from subscriptions instead.";
const ONLY_OWNED_DELETE: &str = "Only owned calendars can be deleted here. Manage subscribed or public calendars from subscriptions instead.";
/// Fixed `created_at`/`updated_at` of inserted events, so later bumps are visible.
pub const EVENT_STAMP: &str = "2026-10-01T08:00:00";

/// One row as `row_to_json`, with snake_case column names.
pub async fn db_json(db: &PgPool, sql: &str, bind: &str) -> Option<Value> {
    let text: Option<String> = sqlx::query_scalar(sql)
        .bind(bind)
        .fetch_optional(db)
        .await
        .expect("row query");
    text.map(|text| serde_json::from_str(&text).expect("row json"))
}

/// `created_at` and `updated_at` of a row as `toISOString()` writes them.
pub async fn wire_timestamps(db: &PgPool, table: &str, id: &str) -> (String, String) {
    let format = r#"'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'"#;
    sqlx::query_as(&format!(
        "SELECT to_char(created_at, {format}), to_char(updated_at, {format}) FROM {table} WHERE id = $1"
    ))
    .bind(id)
    .fetch_one(db)
    .await
    .expect("timestamps")
}

pub async fn calendar_row(db: &PgPool, id: &str) -> Option<Value> {
    db_json(
        db,
        "SELECT row_to_json(c)::text FROM calendar c WHERE id = $1",
        id,
    )
    .await
}

pub async fn event_row(db: &PgPool, id: &str) -> Option<Value> {
    db_json(
        db,
        "SELECT row_to_json(e)::text FROM calendar_event e WHERE id = $1",
        id,
    )
    .await
}

pub async fn create_calendar(user: &mut TestUser, name: &str, color: &str) -> Calendar {
    let request = CreateCalendarRequest {
        name: Some(name.into()),
        color: color.into(),
        ..Default::default()
    };
    create_calendar_with(user, &request).await
}

pub async fn create_calendar_with(
    user: &mut TestUser,
    request: &CreateCalendarRequest,
) -> Calendar {
    let body = serde_json::to_value(request).expect("request json");
    ok(user
        .post("/api/calendars", body)
        .await
        .expect_status(200)
        .and_then(|r| r.dto()))
}

async fn update_calendar(
    user: &mut TestUser,
    id: &str,
    request: &UpdateCalendarRequest,
) -> Calendar {
    let body = serde_json::to_value(request).expect("request json");
    ok(user
        .put(&format!("/api/calendars/{id}"), body)
        .await
        .expect_status(200)
        .and_then(|r| r.dto()))
}

async fn list_calendars(user: &mut TestUser) -> Vec<Calendar> {
    let list: CalendarList = ok(user
        .get("/api/calendars")
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    list.calendars
}

/// A calendar straight in the database, for kinds the API cannot create.
pub struct CalendarRow<'a> {
    pub name: &'a str,
    pub kind: &'a str,
    pub is_visible: bool,
    pub is_sync_only: bool,
    pub is_default: bool,
    pub stalwart_calendar_id: Option<&'a str>,
    /// Defaults to now.
    pub created_at: Option<&'a str>,
}

impl Default for CalendarRow<'_> {
    fn default() -> Self {
        Self {
            name: "Suite calendar",
            kind: "owned",
            is_visible: true,
            is_sync_only: false,
            is_default: false,
            stalwart_calendar_id: None,
            created_at: None,
        }
    }
}

/// The invitations staging calendar: owned, hidden, named `Invitations`.
pub const STAGING: CalendarRow<'static> = CalendarRow {
    name: "Invitations",
    kind: "owned",
    is_visible: false,
    is_sync_only: false,
    is_default: false,
    stalwart_calendar_id: None,
    created_at: None,
};

pub async fn insert_calendar(db: &PgPool, user_id: &str, row: CalendarRow<'_>) -> String {
    let id = format!("suitecal{}", hex(8));
    sqlx::query(
        "INSERT INTO calendar (id, name, color, kind, is_visible, is_sync_only, is_default, stalwart_calendar_id, user_id, created_at, updated_at) \
         VALUES ($1, $2, '#64748b', $3, $4, $5, $6, $7, $8, COALESCE($9::text::timestamp, now()), COALESCE($9::text::timestamp, now()))",
    )
    .bind(&id)
    .bind(row.name)
    .bind(row.kind)
    .bind(row.is_visible)
    .bind(row.is_sync_only)
    .bind(row.is_default)
    .bind(row.stalwart_calendar_id)
    .bind(user_id)
    .bind(row.created_at)
    .execute(db)
    .await
    .expect("insert calendar");
    id
}

/// An event straight in the database; `None` fields take the column defaults or a fixed slot.
#[derive(Default)]
pub struct EventRow<'a> {
    pub title: &'a str,
    pub description: Option<&'a str>,
    pub location: Option<&'a str>,
    pub encrypted_content: Option<&'a str>,
    pub encryption_state: Option<&'a str>,
    pub start: Option<&'a str>,
    pub end: Option<&'a str>,
    pub all_day: bool,
    pub timezone: Option<&'a str>,
    pub recurrence: Option<&'a str>,
    pub external_id: Option<&'a str>,
    pub parent_event_id: Option<&'a str>,
    pub category_id: Option<&'a str>,
}

pub async fn insert_event(
    db: &PgPool,
    user_id: &str,
    calendar_id: &str,
    row: EventRow<'_>,
) -> String {
    let id = format!("suiteevt{}", hex(8));
    sqlx::query(
        "INSERT INTO calendar_event (id, title, description, location, encrypted_content, encryption_state, start, \"end\", all_day, timezone, recurrence, external_id, parent_event_id, category_id, user_id, calendar_id, created_at, updated_at) \
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'plaintext'), COALESCE($7::text, '2026-11-02 09:00:00')::timestamp, COALESCE($8::text, '2026-11-02 10:00:00')::timestamp, $9, COALESCE($10, 'UTC'), $11, $12, $13, $14, $15, $16, $17::text::timestamp, $17::text::timestamp)",
    )
    .bind(&id)
    .bind(row.title)
    .bind(row.description)
    .bind(row.location)
    .bind(row.encrypted_content)
    .bind(row.encryption_state)
    .bind(row.start)
    .bind(row.end)
    .bind(row.all_day)
    .bind(row.timezone)
    .bind(row.recurrence)
    .bind(row.external_id)
    .bind(row.parent_event_id)
    .bind(row.category_id)
    .bind(user_id)
    .bind(calendar_id)
    .bind(EVENT_STAMP)
    .execute(db)
    .await
    .expect("insert event");
    id
}

/// Registers an E2EE device, which makes plaintext names unacceptable for the account.
pub async fn add_encryption_device(db: &PgPool, user_id: &str) {
    sqlx::query(
        "INSERT INTO user_encryption_device (id, user_id, device_id, public_key, wrapped_account_key, wrapped_search_key, last_seen_at, created_at, updated_at) \
         VALUES ($1, $2, 'suite-device', 'suite-public-key', 'suite-wrapped-account-key', 'suite-wrapped-search-key', now(), now(), now())",
    )
    .bind(format!("suitedev{}", hex(8)))
    .bind(user_id)
    .execute(db)
    .await
    .expect("insert encryption device");
}

async fn calendar_count(db: &PgPool, user_id: &str) -> i64 {
    count(
        db,
        "SELECT count(*) FROM calendar WHERE user_id = $1",
        user_id,
    )
    .await
}

#[tokio::test]
async fn anonymous_callers_are_refused() {
    let app = TestApp::spawn().await;
    let mut anon = app.anonymous();
    expect_unauthorized(&ok(anon.get("/api/calendars").await));
    expect_unauthorized(&ok(anon
        .post("/api/calendars", json!({"name": "Work", "color": "blue"}))
        .await));
    expect_unauthorized(&ok(anon
        .put("/api/calendars/some-id", json!({"isVisible": false}))
        .await));
    expect_unauthorized(&ok(anon.delete("/api/calendars/some-id").await));
}

#[tokio::test]
async fn first_list_creates_the_three_default_calendars() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    assert_eq!(
        calendar_count(&app.db, &user.id).await,
        0,
        "sign-up creates none"
    );

    let calendars = list_calendars(&mut user).await;

    let summary: Vec<(&str, &str, bool)> = calendars
        .iter()
        .map(|c| (c.name.as_str(), c.color.as_str(), c.is_default))
        .collect();
    assert_eq!(
        summary,
        [
            ("Personal", "#10b981", true),
            ("Family", "#f43f5e", false),
            ("Work", "#3b82f6", false)
        ]
    );
    for calendar in &calendars {
        assert_eq!(calendar.user_id.0, user.id);
        assert_eq!(
            (calendar.kind.as_str(), calendar.encryption_state.as_str()),
            ("owned", "plaintext")
        );
        assert!(calendar.is_visible && !calendar.is_public && !calendar.is_sync_only);
        assert!(
            !calendar.force_full_encryption,
            "defaults predate forced encryption"
        );
        assert_eq!(
            (&calendar.encrypted_name, &calendar.blind_index_tokens),
            (&None, &None)
        );
        assert_eq!(calendar.encryption_key_version, 1);
        assert_eq!(
            (&calendar.ics_share_token, calendar.ics_share_enabled),
            (&None, false)
        );
        assert_eq!(
            (
                &calendar.stalwart_account_id,
                &calendar.stalwart_calendar_id,
                &calendar.stalwart_synced_at
            ),
            (&None, &None, &None)
        );
        assert_eq!(calendar.created_at, calendar.updated_at);
    }
    assert_eq!(calendar_count(&app.db, &user.id).await, 3);

    assert_eq!(
        list_calendars(&mut user).await,
        calendars,
        "a second list adds nothing"
    );
    assert_eq!(calendar_count(&app.db, &user.id).await, 3);
}

#[tokio::test]
async fn listing_adds_no_defaults_once_the_user_has_a_calendar() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let created = create_calendar(&mut user, "Only", "blue").await;
    assert_eq!(list_calendars(&mut user).await, [created]);
    assert_eq!(calendar_count(&app.db, &user.id).await, 1);
}

#[tokio::test]
async fn the_list_holds_own_calendars_default_first_then_by_name() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let mut other = app.user().await;
    create_calendar(&mut other, "Foreign", "red").await;
    create_calendar(&mut user, "Mid", "blue").await;
    let default = create_calendar_with(
        &mut user,
        &CreateCalendarRequest {
            name: Some("Zeta".into()),
            color: "teal".into(),
            is_default: Some(true),
            ..Default::default()
        },
    )
    .await;
    create_calendar(&mut user, "Alpha", "rose").await;
    // Remote ids from the Stalwart era are listed as stored, without any sync.
    insert_calendar(
        &app.db,
        &user.id,
        CalendarRow {
            name: "Legacy",
            stalwart_calendar_id: Some("remote-cal-1"),
            ..Default::default()
        },
    )
    .await;

    let calendars = list_calendars(&mut user).await;
    let names: Vec<&str> = calendars.iter().map(|c| c.name.as_str()).collect();
    assert_eq!(names, ["Zeta", "Alpha", "Legacy", "Mid"]);
    assert_eq!(calendars[0], default);
    assert_eq!(
        calendars[2].stalwart_calendar_id.as_deref(),
        Some("remote-cal-1")
    );
    assert_eq!(calendar_count(&app.db, &user.id).await, 4);
}

#[tokio::test]
async fn create_stores_a_trimmed_plaintext_calendar() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let created = create_calendar(&mut user, "  Focus  ", "#abcdef").await;

    assert_eq!(created.name, "Focus");
    assert_eq!(created.color, "#abcdef");
    assert_eq!(created.user_id.0, user.id);
    assert_eq!(
        (created.kind.as_str(), created.encryption_state.as_str()),
        ("owned", "plaintext")
    );
    assert!(
        created.force_full_encryption,
        "new calendars force full encryption"
    );
    assert!(
        created.is_visible && !created.is_default && !created.is_public && !created.is_sync_only
    );
    assert_eq!(
        (&created.encrypted_name, &created.blind_index_tokens),
        (&None, &None)
    );
    assert_eq!(created.encryption_key_version, 1);
    assert_eq!(created.created_at, created.updated_at);

    let row = calendar_row(&app.db, &created.id.0).await.expect("row");
    assert_eq!(row["name"], json!("Focus"));
    assert_eq!(row["user_id"], json!(user.id));
    assert_eq!(row["encryption_state"], json!("plaintext"));
    assert_eq!(row["force_full_encryption"], json!(true));
    assert_eq!(
        wire_timestamps(&app.db, "calendar", &created.id.0).await,
        (created.created_at.0.clone(), created.updated_at.0.clone())
    );
    assert_eq!(list_calendars(&mut user).await, [created]);
}

#[tokio::test]
async fn every_named_and_hex_color_is_accepted() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let target = create_calendar(&mut user, "Target", "blue").await;
    let colors = NAMED_COLORS
        .into_iter()
        .chain(["#FF5733", "#FFF", "#abc123"]);
    for color in colors {
        let created = create_calendar(&mut user, &format!("Cal {color}"), color).await;
        assert_eq!(created.color, color);

        let updated = update_calendar(
            &mut user,
            &target.id.0,
            &UpdateCalendarRequest {
                color: Some(color.into()),
                ..Default::default()
            },
        )
        .await;
        assert_eq!(updated.color, color);
        let row = calendar_row(&app.db, &target.id.0).await.expect("row");
        assert_eq!(row["color"], json!(color));
    }
}

#[tokio::test]
async fn invalid_colors_are_rejected_with_the_allowed_list() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let target = create_calendar(&mut user, "Target", "blue").await;
    for color in [
        "chartreuse",
        "navy",
        "BLUE",
        "rgb(0,0,0)",
        "#GGG",
        "#12345",
        "",
        "invalid",
    ] {
        let created = user
            .post("/api/calendars", json!({"name": "Test", "color": color}))
            .await;
        expect_invalid(&created, COLOR_MESSAGE, "color");
        let updated = user
            .put(
                &format!("/api/calendars/{}", target.id),
                json!({"color": color}),
            )
            .await;
        expect_invalid(&updated, COLOR_MESSAGE, "color");
    }
    assert_eq!(calendar_count(&app.db, &user.id).await, 1);
    let row = calendar_row(&app.db, &target.id.0).await.expect("row");
    assert_eq!(row["color"], json!("blue"));
}

#[tokio::test]
async fn create_validation_reports_zod_messages() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let cases = [
        (json!({"name": "T"}), "Required", "color"),
        (
            json!({"name": "x".repeat(101), "color": "blue"}),
            "String must contain at most 100 character(s)",
            "name",
        ),
        (
            json!({"name": "\u{1F600}".repeat(51), "color": "blue"}),
            "String must contain at most 100 character(s)",
            "name",
        ),
        (
            json!({"name": 1, "color": "blue"}),
            "Expected string, received number",
            "name",
        ),
        (
            json!({"name": "T", "color": 7}),
            "Expected string, received number",
            "color",
        ),
        (
            json!({"name": "T", "color": "blue", "isDefault": "yes"}),
            "Expected boolean, received string",
            "isDefault",
        ),
        (
            json!({"name": "T", "color": "blue", "forceFullEncryption": "true"}),
            "Expected boolean, received string",
            "forceFullEncryption",
        ),
        (
            json!({"name": "T", "color": "blue", "encryptionState": "invalid_state"}),
            "Invalid enum value. Expected 'plaintext' | 'shadow_write' | 'encrypted', received 'invalid_state'",
            "encryptionState",
        ),
        (
            json!({"name": "T", "color": "blue", "encryptionKeyVersion": 0}),
            "Number must be greater than or equal to 1",
            "encryptionKeyVersion",
        ),
        (
            json!({"name": "T", "color": "blue", "encryptionKeyVersion": 1.5}),
            "Expected integer, received float",
            "encryptionKeyVersion",
        ),
        (
            json!({"name": "T", "color": "blue", "blindIndexTokens": [1]}),
            "Expected string, received number",
            "blindIndexTokens.0",
        ),
        (
            json!({"name": "T", "color": "blue", "blindIndexTokens": "idx"}),
            "Expected array, received string",
            "blindIndexTokens",
        ),
        (json!(null), "Expected object, received null", "root"),
        (json!([]), "Expected object, received array", "root"),
    ];
    for (body, message, path) in cases {
        let response = user.post("/api/calendars", body.clone()).await;
        let error = response
            .expect_error(400, "Validation Error", message)
            .unwrap_or_else(|e| panic!("{body}: {e}"));
        assert_eq!(
            error["details"]["issues"][0]["path"],
            json!(path),
            "{body}: {error}"
        );
    }
    assert_eq!(calendar_count(&app.db, &user.id).await, 0);

    // 50 emoji are 100 UTF-16 code units: exactly at the limit.
    let at_limit = create_calendar(&mut user, &"\u{1F600}".repeat(50), "blue").await;
    assert_eq!(at_limit.name.chars().count(), 50);
}

#[tokio::test]
async fn a_plaintext_or_encrypted_name_is_required() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    for body in [
        json!({"color": "blue"}),
        json!({"name": "   ", "color": "blue"}),
        json!({"encryptedName": "  ", "color": "blue"}),
    ] {
        let response = user.post("/api/calendars", body).await;
        expect_invalid(&response, "Calendar name is required.", "encryptedName");
    }
    assert_eq!(calendar_count(&app.db, &user.id).await, 0);
}

#[tokio::test]
async fn every_issue_is_reported_in_schema_order() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let response = user
        .post("/api/calendars", json!({"color": "nope", "userId": "x"}))
        .await;
    let body = expect_invalid(&response, COLOR_MESSAGE, "color");
    assert_eq!(
        body["details"]["issues"],
        json!([
            {"path": "color", "message": COLOR_MESSAGE},
            {"path": "root", "message": "Unrecognized key(s) in object: 'userId'"},
            {"path": "encryptedName", "message": "Calendar name is required."},
        ])
    );
}

#[tokio::test]
async fn plaintext_names_beside_ciphertext_are_rejected() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let target = create_calendar(&mut user, "Target", "blue").await;

    let created = user
        .post(
            "/api/calendars",
            json!({"name": "Therapy", "encryptedName": "ciphertext", "color": "blue"}),
        )
        .await;
    expect_invalid(&created, PLAINTEXT_BESIDE_CIPHERTEXT, "name");
    let updated = user
        .put(
            &format!("/api/calendars/{}", target.id),
            json!({"name": "Therapy", "encryptedName": "ciphertext"}),
        )
        .await;
    expect_invalid(&updated, PLAINTEXT_BESIDE_CIPHERTEXT, "name");

    assert_eq!(calendar_count(&app.db, &user.id).await, 1);
    let row = calendar_row(&app.db, &target.id.0).await.expect("row");
    assert_eq!(
        (&row["name"], &row["encrypted_name"]),
        (&json!("Target"), &json!(null))
    );
}

#[tokio::test]
async fn encrypted_names_are_stored_byte_for_byte_beside_a_blank_name() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let ciphertext = r#"{"version":1,"iv":"AAECAwQFBgcICQoL","ciphertext":"3q2+7w==/é"}"#;

    let created = create_calendar_with(
        &mut user,
        &CreateCalendarRequest {
            color: "#abcdef".into(),
            encrypted_name: Some(ciphertext.into()),
            blind_index_tokens: Some(vec!["idx-1".into(), "idx-2".into()]),
            encryption_state: Some("shadow_write".into()),
            encryption_key_version: Some(2),
            force_full_encryption: Some(true),
            ..Default::default()
        },
    )
    .await;
    assert_eq!(created.name, "");
    assert_eq!(created.encrypted_name.as_deref(), Some(ciphertext));
    assert_eq!(
        created.blind_index_tokens.as_deref(),
        Some(r#"["idx-1","idx-2"]"#)
    );
    assert_eq!(
        created.encryption_state, "encrypted",
        "the sent state is ignored"
    );
    assert_eq!(created.encryption_key_version, 2);
    let row = calendar_row(&app.db, &created.id.0).await.expect("row");
    assert_eq!(row["name"], json!(""));
    assert_eq!(row["encrypted_name"], json!(ciphertext));
    assert_eq!(row["blind_index_tokens"], json!(r#"["idx-1","idx-2"]"#));
    assert_eq!(row["encryption_state"], json!("encrypted"));
    assert_eq!(row["encryption_key_version"], json!(2));

    // A blank plaintext name may ride along; tokens default to [] and the key version to 1.
    let blank = create_calendar_with(
        &mut user,
        &CreateCalendarRequest {
            name: Some("   ".into()),
            color: "blue".into(),
            encrypted_name: Some(ciphertext.into()),
            ..Default::default()
        },
    )
    .await;
    assert_eq!(blank.name, "");
    assert_eq!(blank.blind_index_tokens.as_deref(), Some("[]"));
    assert_eq!(blank.encryption_key_version, 1);
    assert_ne!(
        blank.id, created.id,
        "encrypted names are never checked for duplicates"
    );
}

#[tokio::test]
async fn an_empty_encrypted_name_fails_in_the_service() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let target = create_calendar(&mut user, "Target", "blue").await;
    let created = user
        .post(
            "/api/calendars",
            json!({"name": "T", "color": "blue", "encryptedName": ""}),
        )
        .await;
    expect_field_error(
        &created,
        "Encrypted calendar name cannot be empty",
        "encryptedName",
    );
    let updated = user
        .put(
            &format!("/api/calendars/{}", target.id),
            json!({"encryptedName": ""}),
        )
        .await;
    expect_field_error(
        &updated,
        "Encrypted calendar name cannot be empty",
        "encryptedName",
    );
    assert_eq!(calendar_count(&app.db, &user.id).await, 1);
}

#[tokio::test]
async fn accounts_with_an_e2ee_device_must_encrypt_calendar_names() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let target = create_calendar(&mut user, "Before", "blue").await;
    add_encryption_device(&app.db, &user.id).await;
    let message = "Calendar name encryption requires an active encryption session.";

    let created = user
        .post(
            "/api/calendars",
            json!({"name": "Therapy", "color": "blue"}),
        )
        .await;
    expect_field_error(&created, message, "encryptedName");
    let renamed = user
        .put(
            &format!("/api/calendars/{}", target.id),
            json!({"name": "After"}),
        )
        .await;
    expect_field_error(&renamed, message, "encryptedName");
    assert_eq!(calendar_count(&app.db, &user.id).await, 1);

    let recolored = update_calendar(
        &mut user,
        &target.id.0,
        &UpdateCalendarRequest {
            color: Some("rose".into()),
            ..Default::default()
        },
    )
    .await;
    assert_eq!(
        (recolored.name.as_str(), recolored.color.as_str()),
        ("Before", "rose")
    );
    let encrypted = create_calendar_with(
        &mut user,
        &CreateCalendarRequest {
            color: "blue".into(),
            encrypted_name: Some("ciphertext".into()),
            ..Default::default()
        },
    )
    .await;
    assert_eq!(encrypted.encrypted_name.as_deref(), Some("ciphertext"));
}

#[tokio::test]
async fn duplicate_plaintext_names_are_rejected_after_trimming() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let work = create_calendar(&mut user, "Work", "blue").await;
    let other = create_calendar(&mut user, "Other", "blue").await;

    for name in ["Work", "  Work "] {
        let response = user
            .post("/api/calendars", json!({"name": name, "color": "blue"}))
            .await;
        expect_field_error(
            &response,
            "A calendar with this name already exists",
            "name",
        );
    }
    let renamed = user
        .put(
            &format!("/api/calendars/{}", other.id),
            json!({"name": " Work"}),
        )
        .await;
    expect_field_error(&renamed, "A calendar with this name already exists", "name");
    assert_eq!(calendar_count(&app.db, &user.id).await, 2);

    let lower = create_calendar(&mut user, "work", "blue").await;
    assert_eq!(lower.name, "work", "names compare case-sensitively");
    let same = update_calendar(
        &mut user,
        &work.id.0,
        &UpdateCalendarRequest {
            name: Some("Work".into()),
            ..Default::default()
        },
    )
    .await;
    assert_eq!(same.name, "Work", "keeping its own name is fine");
}

#[tokio::test]
async fn one_calendar_at_most_is_the_default() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let defaults = list_calendars(&mut user).await;
    let personal = &defaults[0];
    assert!(personal.is_default);

    let created = create_calendar_with(
        &mut user,
        &CreateCalendarRequest {
            name: Some("New default".into()),
            color: "blue".into(),
            is_default: Some(true),
            ..Default::default()
        },
    )
    .await;
    assert!(created.is_default);
    let user_id = user.id.clone();
    let default_ids = || async {
        sqlx::query_scalar::<_, String>(
            "SELECT id FROM calendar WHERE user_id = $1 AND is_default ORDER BY id",
        )
        .bind(&user_id)
        .fetch_all(&app.db)
        .await
        .expect("defaults")
    };
    assert_eq!(default_ids().await, std::slice::from_ref(&created.id.0));

    let work = defaults.iter().find(|c| c.name == "Work").expect("work");
    let updated = update_calendar(
        &mut user,
        &work.id.0,
        &UpdateCalendarRequest {
            is_default: Some(true),
            ..Default::default()
        },
    )
    .await;
    assert!(updated.is_default);
    assert_eq!(default_ids().await, std::slice::from_ref(&work.id.0));

    // Clearing the flag promotes nothing.
    update_calendar(
        &mut user,
        &work.id.0,
        &UpdateCalendarRequest {
            is_default: Some(false),
            ..Default::default()
        },
    )
    .await;
    assert!(default_ids().await.is_empty());
}

#[tokio::test]
async fn force_full_encryption_defaults_on_and_is_persisted() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let off = create_calendar_with(
        &mut user,
        &CreateCalendarRequest {
            name: Some("Off".into()),
            color: "blue".into(),
            force_full_encryption: Some(false),
            ..Default::default()
        },
    )
    .await;
    assert!(!off.force_full_encryption);
    let on = update_calendar(
        &mut user,
        &off.id.0,
        &UpdateCalendarRequest {
            force_full_encryption: Some(true),
            ..Default::default()
        },
    )
    .await;
    assert!(on.force_full_encryption);
    let row = calendar_row(&app.db, &off.id.0).await.expect("row");
    assert_eq!(row["force_full_encryption"], json!(true));
}

#[tokio::test]
async fn enabling_force_full_encryption_strips_plaintext_beside_ciphertext() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar = create_calendar_with(
        &mut user,
        &CreateCalendarRequest {
            name: Some("Mixed".into()),
            color: "blue".into(),
            force_full_encryption: Some(false),
            ..Default::default()
        },
    )
    .await;
    let elsewhere = create_calendar(&mut user, "Elsewhere", "blue").await;
    let shadowed = EventRow {
        title: "Legacy title",
        description: Some("Legacy body"),
        location: Some("Legacy room"),
        encrypted_content: Some(r#"{"version":1}"#),
        encryption_state: Some("shadow_write"),
        ..Default::default()
    };
    let with_ciphertext = insert_event(&app.db, &user.id, &calendar.id.0, shadowed).await;
    let plaintext_only = insert_event(
        &app.db,
        &user.id,
        &calendar.id.0,
        EventRow {
            title: "Plain title",
            description: Some("Plain body"),
            ..Default::default()
        },
    )
    .await;
    let other_calendar = insert_event(
        &app.db,
        &user.id,
        &elsewhere.id.0,
        EventRow {
            title: "Other title",
            encrypted_content: Some(r#"{"version":1}"#),
            encryption_state: Some("shadow_write"),
            ..Default::default()
        },
    )
    .await;
    let untouched_plain = event_row(&app.db, &plaintext_only).await;
    let untouched_other = event_row(&app.db, &other_calendar).await;

    update_calendar(
        &mut user,
        &calendar.id.0,
        &UpdateCalendarRequest {
            force_full_encryption: Some(true),
            ..Default::default()
        },
    )
    .await;

    let row = event_row(&app.db, &with_ciphertext).await.expect("event");
    assert_eq!(
        (
            &row["title"],
            &row["description"],
            &row["location"],
            &row["encryption_state"],
            &row["encrypted_content"]
        ),
        (
            &json!(""),
            &json!(null),
            &json!(null),
            &json!("encrypted"),
            &json!(r#"{"version":1}"#)
        )
    );
    assert_ne!(row["updated_at"], json!(EVENT_STAMP), "updatedAt is bumped");
    assert_eq!(event_row(&app.db, &plaintext_only).await, untouched_plain);
    assert_eq!(event_row(&app.db, &other_calendar).await, untouched_other);
}

#[tokio::test]
async fn force_full_encryption_left_on_or_turned_off_leaves_events_alone() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar = create_calendar(&mut user, "Locked", "blue").await;
    assert!(calendar.force_full_encryption);
    let event = insert_event(
        &app.db,
        &user.id,
        &calendar.id.0,
        EventRow {
            title: "Shadow title",
            encrypted_content: Some(r#"{"version":1}"#),
            encryption_state: Some("shadow_write"),
            ..Default::default()
        },
    )
    .await;
    let before = event_row(&app.db, &event).await;
    for flag in [true, false] {
        let updated = update_calendar(
            &mut user,
            &calendar.id.0,
            &UpdateCalendarRequest {
                force_full_encryption: Some(flag),
                ..Default::default()
            },
        )
        .await;
        assert_eq!(updated.force_full_encryption, flag);
        assert_eq!(event_row(&app.db, &event).await, before);
    }
}

#[tokio::test]
async fn updates_change_only_the_given_fields() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let created = create_calendar(&mut user, "Before", "blue").await;

    let updated = update_calendar(
        &mut user,
        &created.id.0,
        &UpdateCalendarRequest {
            name: Some("  After ".into()),
            color: Some("teal".into()),
            is_visible: Some(false),
            ..Default::default()
        },
    )
    .await;
    assert_eq!(
        (
            updated.name.as_str(),
            updated.color.as_str(),
            updated.is_visible
        ),
        ("After", "teal", false)
    );
    assert_eq!(updated.created_at, created.created_at);
    assert!(updated.updated_at > created.updated_at);
    let unchanged = Calendar {
        name: created.name.clone(),
        color: created.color.clone(),
        is_visible: created.is_visible,
        updated_at: created.updated_at.clone(),
        ..updated.clone()
    };
    assert_eq!(unchanged, created, "nothing else changes");

    let touched =
        update_calendar(&mut user, &created.id.0, &UpdateCalendarRequest::default()).await;
    assert!(
        touched.updated_at > updated.updated_at,
        "an empty update still bumps updatedAt"
    );
    assert_eq!(
        Calendar {
            updated_at: updated.updated_at.clone(),
            ..touched
        },
        updated
    );
}

#[tokio::test]
async fn blank_names_on_update_fail_in_the_service() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let created = create_calendar(&mut user, "Keep", "blue").await;
    for name in ["   ", ""] {
        let response = user
            .put(
                &format!("/api/calendars/{}", created.id),
                json!({"name": name}),
            )
            .await;
        expect_field_error(
            &response,
            "Calendar name is required and cannot be empty",
            "name",
        );
    }
    let response = user
        .put(
            &format!("/api/calendars/{}", created.id),
            json!({"name": "x".repeat(101)}),
        )
        .await;
    expect_invalid(
        &response,
        "String must contain at most 100 character(s)",
        "name",
    );
    let row = calendar_row(&app.db, &created.id.0).await.expect("row");
    assert_eq!(row["name"], json!("Keep"));
}

#[tokio::test]
async fn uploading_a_ciphertext_name_blanks_the_plaintext_name() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let created = create_calendar(&mut user, "Therapy", "blue").await;
    // The name backfill runs on a device, so the account already has one.
    add_encryption_device(&app.db, &user.id).await;

    let updated = update_calendar(
        &mut user,
        &created.id.0,
        &UpdateCalendarRequest {
            encrypted_name: Some("ciphertext".into()),
            blind_index_tokens: Some(vec!["idx-1".into()]),
            encryption_key_version: Some(3),
            ..Default::default()
        },
    )
    .await;
    assert_eq!(updated.name, "");
    assert_eq!(updated.encrypted_name.as_deref(), Some("ciphertext"));
    assert_eq!(updated.blind_index_tokens.as_deref(), Some(r#"["idx-1"]"#));
    assert_eq!(
        (
            updated.encryption_state.as_str(),
            updated.encryption_key_version
        ),
        ("encrypted", 3)
    );
    let row = calendar_row(&app.db, &created.id.0).await.expect("row");
    assert_eq!(
        (
            &row["name"],
            &row["encrypted_name"],
            &row["blind_index_tokens"]
        ),
        (&json!(""), &json!("ciphertext"), &json!(r#"["idx-1"]"#))
    );

    // Omitted tokens and key version fall back to [] and 1 on every ciphertext upload.
    let again = update_calendar(
        &mut user,
        &created.id.0,
        &UpdateCalendarRequest {
            encrypted_name: Some("ciphertext-2".into()),
            ..Default::default()
        },
    )
    .await;
    assert_eq!(again.blind_index_tokens.as_deref(), Some("[]"));
    assert_eq!(again.encryption_key_version, 1);
}

#[tokio::test]
async fn subscribed_calendars_only_accept_visibility_updates() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    create_calendar(&mut user, "Own", "blue").await;
    let subscribed = insert_calendar(
        &app.db,
        &user.id,
        CalendarRow {
            name: "Holidays",
            kind: "subscribed",
            is_sync_only: true,
            ..Default::default()
        },
    )
    .await;
    let path = format!("/api/calendars/{subscribed}");

    let hidden: Calendar = ok(user
        .put(&path, json!({"isVisible": false}))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        (hidden.kind.as_str(), hidden.is_visible),
        ("subscribed", false)
    );
    let before = calendar_row(&app.db, &subscribed).await;

    for body in [
        json!({"color": "rose"}),
        json!({"name": "Renamed"}),
        json!({"isVisible": true, "isDefault": false}),
        json!({"isVisible": true, "forceFullEncryption": true}),
    ] {
        let response = user.put(&path, body).await;
        expect_plain_error(&response, ONLY_OWNED_UPDATE);
    }
    expect_plain_error(&user.delete(&path).await, ONLY_OWNED_DELETE);
    assert_eq!(calendar_row(&app.db, &subscribed).await, before);
}

#[tokio::test]
async fn the_invitations_staging_calendar_cannot_become_the_default() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let own = create_calendar_with(
        &mut user,
        &CreateCalendarRequest {
            name: Some("Own".into()),
            color: "blue".into(),
            is_default: Some(true),
            ..Default::default()
        },
    )
    .await;
    let staging = insert_calendar(&app.db, &user.id, STAGING).await;

    let response = user
        .put(
            &format!("/api/calendars/{staging}"),
            json!({"isDefault": true}),
        )
        .await;
    expect_field_error(
        &response,
        "The invitations calendar cannot be the default calendar.",
        "isDefault",
    );
    let row = calendar_row(&app.db, &staging).await.expect("row");
    assert_eq!(row["is_default"], json!(false));
    let own_row = calendar_row(&app.db, &own.id.0).await.expect("row");
    assert_eq!(own_row["is_default"], json!(true));

    // Only the hidden one is the staging calendar; a visible namesake is an ordinary calendar.
    let visible = insert_calendar(
        &app.db,
        &user.id,
        CalendarRow {
            name: "Invitations",
            ..Default::default()
        },
    )
    .await;
    let promoted: Calendar = ok(user
        .put(
            &format!("/api/calendars/{visible}"),
            json!({"isDefault": true}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert!(promoted.is_default);
}

#[tokio::test]
async fn other_users_calendars_behave_as_not_found() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut other = app.user().await;
    let calendar = create_calendar(&mut owner, "Private", "blue").await;
    create_calendar(&mut owner, "Second", "blue").await;
    let before = calendar_row(&app.db, &calendar.id.0).await;

    let path = format!("/api/calendars/{}", calendar.id);
    expect_plain_error(
        &other.put(&path, json!({"isVisible": false})).await,
        NOT_FOUND,
    );
    expect_plain_error(&other.put(&path, json!({"name": "Mine"})).await, NOT_FOUND);
    expect_plain_error(&other.delete(&path).await, NOT_FOUND);
    expect_plain_error(
        &owner
            .put(
                "/api/calendars/no-such-calendar",
                json!({"isVisible": false}),
            )
            .await,
        NOT_FOUND,
    );
    expect_plain_error(
        &owner.delete("/api/calendars/no-such-calendar").await,
        NOT_FOUND,
    );

    assert_eq!(calendar_row(&app.db, &calendar.id.0).await, before);
    assert!(
        list_calendars(&mut other)
            .await
            .iter()
            .all(|c| c.id != calendar.id)
    );
}

#[tokio::test]
async fn owner_ids_in_bodies_and_queries_are_rejected() {
    let app = TestApp::spawn().await;
    let mut victim = app.user().await;
    let mut attacker = app.user().await;
    let calendar = create_calendar(&mut attacker, "Mine", "blue").await;
    create_calendar(&mut attacker, "Spare", "blue").await;

    let forged = attacker
        .post(
            "/api/calendars",
            json!({"name": "Planted", "color": "blue", "userId": victim.id}),
        )
        .await;
    expect_unknown_field(&forged, "userId");
    let path = format!("/api/calendars/{}", calendar.id);
    expect_unknown_field(
        &attacker
            .put(&path, json!({"isVisible": false, "userId": victim.id}))
            .await,
        "userId",
    );
    expect_unknown_field(
        &attacker
            .delete(&format!("{path}?userId={}", victim.id))
            .await,
        "userId",
    );

    assert_eq!(calendar_count(&app.db, &victim.id).await, 0);
    assert_eq!(calendar_count(&app.db, &attacker.id).await, 2);
    assert!(
        list_calendars(&mut victim)
            .await
            .iter()
            .all(|c| c.name != "Planted")
    );
}

#[tokio::test]
async fn deleting_removes_the_calendar_and_its_events() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let first = create_calendar(&mut user, "First", "blue").await;
    let second = create_calendar(&mut user, "Second", "blue").await;
    let empty = create_calendar(&mut user, "Empty", "blue").await;
    let keep = create_calendar(&mut user, "Keep", "blue").await;
    let reminded = insert_event(&app.db, &user.id, &first.id.0, EventRow::default()).await;
    insert_event(&app.db, &user.id, &first.id.0, EventRow::default()).await;
    insert_event(&app.db, &user.id, &second.id.0, EventRow::default()).await;
    let kept_event = insert_event(&app.db, &user.id, &keep.id.0, EventRow::default()).await;
    let job = format!("suitejob{}", hex(8));
    sqlx::query(
        "INSERT INTO notification_job (id, user_id, kind, channel, event_id, payload, status, available_at, created_at, updated_at) \
         VALUES ($1, $2, 'event_reminder', 'push', $3, '{}'::jsonb, 'pending', now() + interval '1 day', now(), now())",
    )
    .bind(&job)
    .bind(&user.id)
    .bind(&reminded)
    .execute(&app.db)
    .await
    .expect("insert reminder job");
    let jobs_before = count(
        &app.db,
        "SELECT count(*) FROM notification_job WHERE user_id = $1",
        &user.id,
    )
    .await;

    let cases = [
        (
            &first,
            "",
            "Calendar deleted successfully. 2 events were also deleted.",
            2,
        ),
        (
            &second,
            "?action=delete_events",
            "Calendar deleted successfully. 1 events were also deleted.",
            1,
        ),
        (&empty, "", "Calendar deleted successfully.", 0),
    ];
    for (calendar, query, message, affected) in cases {
        let result: CalendarDeleteResult = ok(user
            .delete(&format!("/api/calendars/{}{query}", calendar.id))
            .await
            .expect_status(200)
            .and_then(|r| r.dto()));
        assert_eq!(
            result,
            CalendarDeleteResult {
                success: true,
                message: message.into(),
                deleted_calendar_id: calendar.id.clone(),
                events_affected: affected,
                action: "delete_events".into(),
            }
        );
        assert_eq!(calendar_row(&app.db, &calendar.id.0).await, None);
        assert_eq!(
            count(
                &app.db,
                "SELECT count(*) FROM calendar_event WHERE calendar_id = $1",
                &calendar.id.0
            )
            .await,
            0
        );
    }
    assert!(event_row(&app.db, &kept_event).await.is_some());
    // The outbox has no foreign key to events: pending reminders of deleted events stay queued.
    let status: String = sqlx::query_scalar("SELECT status FROM notification_job WHERE id = $1")
        .bind(&job)
        .fetch_one(&app.db)
        .await
        .expect("reminder job");
    assert_eq!(status, "pending");
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM notification_job WHERE user_id = $1",
            &user.id
        )
        .await,
        jobs_before,
        "deletes write nothing to the outbox"
    );
}

#[tokio::test]
async fn deleting_can_move_the_events_to_another_calendar() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let source = create_calendar(&mut user, "Source", "blue").await;
    let target = insert_calendar(
        &app.db,
        &user.id,
        CalendarRow {
            name: "Target",
            stalwart_calendar_id: Some("remote-target"),
            ..Default::default()
        },
    )
    .await;
    let events = [
        insert_event(&app.db, &user.id, &source.id.0, EventRow::default()).await,
        insert_event(&app.db, &user.id, &source.id.0, EventRow::default()).await,
    ];

    let result: CalendarDeleteResult = ok(user
        .delete(&format!(
            "/api/calendars/{}?action=move_events&targetCalendarId={target}",
            source.id
        ))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        result,
        CalendarDeleteResult {
            success: true,
            message: "Calendar deleted successfully. 2 events moved to target calendar.".into(),
            deleted_calendar_id: source.id.clone(),
            events_affected: 2,
            action: "move_events".into(),
        }
    );
    assert_eq!(calendar_row(&app.db, &source.id.0).await, None);
    for event in events {
        let row = event_row(&app.db, &event).await.expect("moved event");
        assert_eq!(row["calendar_id"], json!(target));
        assert_eq!(row["stalwart_calendar_id"], json!("remote-target"));
        assert_ne!(row["updated_at"], json!(EVENT_STAMP), "updatedAt is bumped");
    }
}

#[tokio::test]
async fn moving_events_needs_an_own_target_other_than_the_staging_calendar() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let mut other = app.user().await;
    let source = create_calendar(&mut user, "Source", "blue").await;
    create_calendar(&mut user, "Spare", "blue").await;
    let foreign = create_calendar(&mut other, "Foreign", "blue").await;
    let staging = insert_calendar(&app.db, &user.id, STAGING).await;
    let event = insert_event(&app.db, &user.id, &source.id.0, EventRow::default()).await;
    let base = format!("/api/calendars/{}?action=move_events", source.id);

    for query in ["", "&targetCalendarId="] {
        expect_field_error(
            &user.delete(&format!("{base}{query}")).await,
            "Target calendar ID is required when moving events",
            "targetCalendarId",
        );
    }
    for target in [foreign.id.0.as_str(), staging.as_str(), "no-such-calendar"] {
        expect_field_error(
            &user
                .delete(&format!("{base}&targetCalendarId={target}"))
                .await,
            "Target calendar not found or access denied",
            "targetCalendarId",
        );
    }
    expect_field_error(
        &user
            .delete(&format!("{base}&targetCalendarId={}", source.id))
            .await,
        "Cannot move events to the same calendar being deleted",
        "targetCalendarId",
    );

    assert!(calendar_row(&app.db, &source.id.0).await.is_some());
    let row = event_row(&app.db, &event).await.expect("event");
    assert_eq!(row["calendar_id"], json!(source.id.0));
}

#[tokio::test]
async fn moving_events_accepts_an_own_subscribed_calendar_as_target() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let source = create_calendar(&mut user, "Source", "blue").await;
    create_calendar(&mut user, "Spare", "blue").await;
    let subscribed = insert_calendar(
        &app.db,
        &user.id,
        CalendarRow {
            name: "Feed",
            kind: "subscribed",
            is_sync_only: true,
            ..Default::default()
        },
    )
    .await;
    let event = insert_event(&app.db, &user.id, &source.id.0, EventRow::default()).await;

    ok(user
        .delete(&format!(
            "/api/calendars/{}?action=move_events&targetCalendarId={subscribed}",
            source.id
        ))
        .await
        .expect_status(200));
    let row = event_row(&app.db, &event).await.expect("event");
    assert_eq!(
        row["calendar_id"],
        json!(subscribed),
        "read-only targets are not refused"
    );
}

#[tokio::test]
async fn moving_out_of_an_empty_calendar_skips_the_target_checks() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let empty = create_calendar(&mut user, "Empty", "blue").await;
    create_calendar(&mut user, "Spare", "blue").await;

    let result: CalendarDeleteResult = ok(user
        .delete(&format!("/api/calendars/{}?action=move_events", empty.id))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        result,
        CalendarDeleteResult {
            success: true,
            message: "Calendar deleted successfully. 0 events moved to target calendar.".into(),
            deleted_calendar_id: empty.id.clone(),
            events_affected: 0,
            action: "move_events".into(),
        }
    );
    assert_eq!(calendar_row(&app.db, &empty.id.0).await, None);
}

#[tokio::test]
async fn the_delete_query_is_validated() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar = create_calendar(&mut user, "Keep", "blue").await;
    create_calendar(&mut user, "Spare", "blue").await;
    let path = format!("/api/calendars/{}", calendar.id);

    expect_invalid(
        &user.delete(&format!("{path}?action=nope")).await,
        "Invalid enum value. Expected 'delete_events' | 'move_events', received 'nope'",
        "action",
    );
    expect_invalid(
        &user.delete(&format!("{path}?action=")).await,
        "Invalid enum value. Expected 'delete_events' | 'move_events', received ''",
        "action",
    );
    expect_unknown_field(&user.delete(&format!("{path}?force=true")).await, "force");
    assert!(calendar_row(&app.db, &calendar.id.0).await.is_some());
}

#[tokio::test]
async fn the_last_editable_calendar_cannot_be_deleted() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let only = create_calendar(&mut user, "Only", "blue").await;
    // Neither the staging calendar nor a subscription counts as editable.
    insert_calendar(&app.db, &user.id, STAGING).await;
    insert_calendar(
        &app.db,
        &user.id,
        CalendarRow {
            name: "Feed",
            kind: "subscribed",
            is_sync_only: true,
            ..Default::default()
        },
    )
    .await;
    let path = format!("/api/calendars/{}", only.id);

    expect_field_error(
        &user.delete(&path).await,
        "Cannot delete the last editable calendar. Create another calendar first.",
        "calendarId",
    );
    assert!(calendar_row(&app.db, &only.id.0).await.is_some());

    // An owned sync-only calendar does count, although nothing can be written to it.
    insert_calendar(
        &app.db,
        &user.id,
        CalendarRow {
            name: "Synced",
            is_sync_only: true,
            ..Default::default()
        },
    )
    .await;
    ok(user.delete(&path).await.expect_status(200));
    assert_eq!(calendar_row(&app.db, &only.id.0).await, None);
}

#[tokio::test]
async fn deleting_the_default_promotes_the_oldest_regular_calendar() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let older = CalendarRow {
        created_at: Some("2020-01-01 00:00:00"),
        ..STAGING
    };
    let staging = insert_calendar(&app.db, &user.id, older).await;
    let synced = insert_calendar(
        &app.db,
        &user.id,
        CalendarRow {
            name: "Synced",
            is_sync_only: true,
            created_at: Some("2020-01-02 00:00:00"),
            ..Default::default()
        },
    )
    .await;
    let subscribed = insert_calendar(
        &app.db,
        &user.id,
        CalendarRow {
            name: "Feed",
            kind: "subscribed",
            created_at: Some("2020-01-03 00:00:00"),
            ..Default::default()
        },
    )
    .await;
    let oldest_regular = insert_calendar(
        &app.db,
        &user.id,
        CalendarRow {
            name: "Older",
            created_at: Some("2020-01-04 00:00:00"),
            ..Default::default()
        },
    )
    .await;
    let newer = create_calendar(&mut user, "Newer", "blue").await;
    let default = create_calendar_with(
        &mut user,
        &CreateCalendarRequest {
            name: Some("Default".into()),
            color: "blue".into(),
            is_default: Some(true),
            ..Default::default()
        },
    )
    .await;

    ok(user
        .delete(&format!("/api/calendars/{}", default.id))
        .await
        .expect_status(200));

    for (id, expected) in [
        (staging.as_str(), false),
        (synced.as_str(), false),
        (subscribed.as_str(), false),
        (oldest_regular.as_str(), true),
        (newer.id.0.as_str(), false),
    ] {
        let row = calendar_row(&app.db, id).await.expect("row");
        assert_eq!(row["is_default"], json!(expected), "{}", row["name"]);
    }
}

#[tokio::test]
async fn events_can_only_be_created_in_own_writable_calendars() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let mut other = app.user().await;
    let writable = create_calendar(&mut user, "Writable", "blue").await;
    let synced = insert_calendar(
        &app.db,
        &user.id,
        CalendarRow {
            name: "Synced",
            is_sync_only: true,
            ..Default::default()
        },
    )
    .await;
    let subscribed = insert_calendar(
        &app.db,
        &user.id,
        CalendarRow {
            name: "Feed",
            kind: "subscribed",
            ..Default::default()
        },
    )
    .await;
    let foreign = create_calendar(&mut other, "Foreign", "blue").await;
    let event = |calendar_id: &str| {
        json!({
            "start": "2026-11-02T09:00:00.000Z",
            "end": "2026-11-02T10:00:00.000Z",
            "calendarId": calendar_id,
            "encryptedContent": r#"{"version":1}"#,
        })
    };

    ok(user
        .post("/api/events", event(&writable.id.0))
        .await
        .expect_status(200));
    for read_only in [&synced, &subscribed] {
        expect_field_error(
            &user.post("/api/events", event(read_only)).await,
            "Cannot create events in a read-only calendar. This calendar is managed by a subscription or public feed.",
            "calendarId",
        );
    }
    for missing in [foreign.id.0.as_str(), "no-such-calendar"] {
        expect_field_error(
            &user.post("/api/events", event(missing)).await,
            "Invalid calendar or calendar does not belong to user",
            "calendarId",
        );
    }

    let events_in = |calendar: String| {
        let db = app.db.clone();
        async move {
            count(
                &db,
                "SELECT count(*) FROM calendar_event WHERE calendar_id = $1",
                &calendar,
            )
            .await
        }
    };
    assert_eq!(events_in(writable.id.0.clone()).await, 1);
    for calendar in [synced, subscribed, foreign.id.0.clone()] {
        assert_eq!(events_in(calendar).await, 0);
    }
}
