//! `/api/settings`: defaults on first read, validated updates, reset, and per-user isolation.

use serde_json::json;
use solace_api_tests::seed::fake_envelope;
use solace_api_types::SuccessMessage;
use solace_api_types::settings::UserSettings;

use crate::helpers::{
    Backend, TestApp, count, expect_invalid, expect_unauthorized, expect_unknown_field, hex, ok,
};

#[tokio::test]
async fn anonymous_callers_are_refused() {
    let app = TestApp::spawn().await;
    let mut anon = app.anonymous();
    expect_unauthorized(&ok(anon.get("/api/settings").await));
    expect_unauthorized(&ok(anon
        .put("/api/settings", json!({"theme": "dark"}))
        .await));
    expect_unauthorized(&ok(anon.delete("/api/settings").await));
}

#[tokio::test]
async fn first_read_creates_the_defaults() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let before = count(
        &app.db,
        "SELECT count(*) FROM user_settings WHERE user_id = $1",
        &user.id,
    )
    .await;

    let settings: UserSettings = ok(user
        .get("/api/settings")
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));

    assert_eq!(before, 0);
    assert_eq!(settings.user_id.0, user.id);
    assert_eq!(
        (
            settings.theme.as_str(),
            settings.default_view.as_str(),
            settings.week_start_day
        ),
        ("light", "week", 1)
    );
    assert_eq!(
        (settings.timezone.as_str(), settings.time_format.as_str()),
        ("UTC", "24h")
    );
    assert_eq!(
        (settings.working_hours_start, settings.working_hours_end),
        (540, 1020)
    );
    assert_eq!(settings.working_days, "[1,2,3,4,5]");
    assert_eq!(settings.default_event_duration, 60);
    assert_eq!(settings.default_calendar_id, None);
    assert!(
        settings.email_notifications
            && settings.push_notifications
            && settings.browser_notifications
    );
    assert!(
        !settings.compact_view && !settings.show_week_numbers && !settings.show_declined_events
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM user_settings WHERE user_id = $1",
            &user.id
        )
        .await,
        1
    );

    let again: UserSettings = ok(user
        .get("/api/settings")
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(again, settings, "a second read returns the same row");
}

/// Rust creates the row idempotently; TypeScript's find-then-create can answer the losers of the race 409.
#[tokio::test]
async fn concurrent_first_reads_all_get_the_same_defaults() {
    let app = TestApp::spawn().await;
    let user = app.user().await;
    let mut reads = tokio::task::JoinSet::new();
    for _ in 0..10 {
        let mut agent = user.agent.clone();
        reads.spawn(async move { agent.get("/api/settings").await });
    }
    let responses: Vec<_> = reads.join_all().await.into_iter().map(ok).collect();

    let mut created = Vec::new();
    for response in &responses {
        match (app.backend, response.status.as_u16()) {
            (_, 200) => created.push(ok(response.dto::<UserSettings>())),
            (Backend::TypeScript, 409) => {}
            (_, status) => panic!("{status}: {}", response.text()),
        }
    }
    assert!(!created.is_empty());
    if app.backend == Backend::Rust {
        assert_eq!(created.len(), 10);
    }
    assert!(created.iter().all(|settings| *settings == created[0]));
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM user_settings WHERE user_id = $1",
            &user.id
        )
        .await,
        1
    );
}

#[tokio::test]
async fn updates_are_stored_and_returned() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let created: UserSettings = ok(user.get("/api/settings").await.dto());

    let updated: UserSettings = ok(user
        .put(
            "/api/settings",
            json!({
                "theme": "dark",
                "defaultView": "month",
                "weekStartDay": 0,
                "timezone": "Europe/Amsterdam",
                "timeFormat": "12h",
                "workingHoursStart": 480,
                "workingHoursEnd": 960,
                "workingDays": "[1,2,3]",
                "emailNotifications": false,
                "pushNotifications": false,
                "showWeekNumbers": true,
                "defaultEventDuration": 30,
            }),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));

    assert_eq!(updated.id, created.id);
    assert_eq!(
        (updated.theme.as_str(), updated.default_view.as_str()),
        ("dark", "month")
    );
    assert_eq!(updated.week_start_day, 0);
    assert_eq!(updated.timezone, "Europe/Amsterdam");
    assert_eq!(
        (updated.working_hours_start, updated.working_hours_end),
        (480, 960)
    );
    assert_eq!(updated.working_days, "[1,2,3]");
    assert!(
        !updated.email_notifications && !updated.push_notifications && updated.show_week_numbers
    );
    assert_eq!(updated.default_event_duration, 30);
    assert!(updated.updated_at >= created.updated_at);
    assert_eq!(updated.created_at, created.created_at);

    let (theme, timezone): (String, String) =
        sqlx::query_as("SELECT theme, timezone FROM user_settings WHERE user_id = $1")
            .bind(&user.id)
            .fetch_one(&app.db)
            .await
            .expect("settings row");
    assert_eq!(
        (theme.as_str(), timezone.as_str()),
        ("dark", "Europe/Amsterdam")
    );
}

/// Web and native offer the 3-day view as the default; TypeScript's schema still rejects it.
#[tokio::test]
async fn the_three_day_view_can_be_the_default_view() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let response = user
        .put("/api/settings", json!({"defaultView": "3day"}))
        .await;
    match app.backend {
        Backend::TypeScript => {
            ok(response.expect_error(
                400,
                "Validation Error",
                "Invalid enum value. Expected 'month' | 'week' | 'day' | 'agenda', received '3day'",
            ));
        }
        Backend::Rust => {
            let updated: UserSettings = ok(response.expect_status(200).and_then(|r| r.dto()));
            assert_eq!(updated.default_view, "3day");
            let read: UserSettings = ok(user.get("/api/settings").await.dto());
            assert_eq!(read.default_view, "3day");
        }
    }
}

#[tokio::test]
async fn an_update_without_a_row_creates_it() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let settings: UserSettings = ok(user
        .put("/api/settings", json!({"compactView": true}))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert!(settings.compact_view);
    assert_eq!(settings.theme, "light");
}

#[tokio::test]
async fn the_pacific_new_alias_is_a_valid_timezone() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    ok(user
        .put("/api/settings", json!({"timezone": "US/Pacific-New"}))
        .await
        .expect_status(200));
}

#[tokio::test]
async fn invalid_values_are_rejected_with_the_zod_message() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let views = match app.backend {
        Backend::TypeScript => "'month' | 'week' | 'day' | 'agenda'",
        Backend::Rust => "'month' | 'week' | '3day' | 'day' | 'agenda'",
    };
    let view_message = format!("Invalid enum value. Expected {views}, received 'year'");
    let cases = [
        (
            json!({"theme": "x"}),
            "Invalid enum value. Expected 'light' | 'dark' | 'system', received 'x'",
            "theme",
        ),
        (
            json!({"defaultView": "year"}),
            view_message.as_str(),
            "defaultView",
        ),
        (
            json!({"timeFormat": "13h"}),
            "Invalid enum value. Expected '12h' | '24h', received '13h'",
            "timeFormat",
        ),
        (
            json!({"weekStartDay": 7}),
            "Number must be less than or equal to 6",
            "weekStartDay",
        ),
        (
            json!({"weekStartDay": -1}),
            "Number must be greater than or equal to 0",
            "weekStartDay",
        ),
        (
            json!({"weekStartDay": 1.5}),
            "Expected integer, received float",
            "weekStartDay",
        ),
        (
            json!({"workingHoursEnd": 1441}),
            "Number must be less than or equal to 1440",
            "workingHoursEnd",
        ),
        (
            json!({"defaultEventDuration": 0}),
            "Number must be greater than or equal to 1",
            "defaultEventDuration",
        ),
        (
            json!({"theme": 1}),
            "Expected 'light' | 'dark' | 'system', received number",
            "theme",
        ),
        (
            json!({"compactView": "yes"}),
            "Expected boolean, received string",
            "compactView",
        ),
        (
            json!({"timezone": "+💚"}),
            "Invalid timezone identifier",
            "timezone",
        ),
        (
            json!({"timezone": "Mars/Base"}),
            "Invalid timezone identifier",
            "timezone",
        ),
        (
            json!({"eventEncryptionMode": "full"}),
            "Unrecognized key(s) in object: 'eventEncryptionMode'",
            "root",
        ),
    ];
    for (body, message, path) in cases {
        let response = user.put("/api/settings", body.clone()).await;
        let error = response
            .expect_error(400, "Validation Error", message)
            .unwrap_or_else(|e| panic!("{body}: {e}"));
        assert_eq!(
            error["details"]["issues"][0]["path"],
            json!(path),
            "{body}: {error}"
        );
    }
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM user_settings WHERE user_id = $1",
            &user.id
        )
        .await,
        0
    );
}

#[tokio::test]
async fn service_rules_reject_inconsistent_values() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let cases = [
        (
            json!({"workingHoursStart": 600, "workingHoursEnd": 600}),
            "Working hours start must be before working hours end",
            "workingHoursStart",
        ),
        (
            json!({"workingDays": "not json"}),
            "Invalid working days format - must be valid JSON array",
            "workingDays",
        ),
        (
            json!({"workingDays": "[1,9]"}),
            "Working days must be a JSON array of numbers 0-6",
            "workingDays",
        ),
        (
            json!({"workingDays": "{\"a\":1}"}),
            "Working days must be a JSON array of numbers 0-6",
            "workingDays",
        ),
    ];
    for (body, message, field) in cases {
        let error = user
            .put("/api/settings", body.clone())
            .await
            .expect_error(400, "Validation Error", message)
            .unwrap_or_else(|e| panic!("{body}: {e}"));
        assert_eq!(error["details"], json!({"field": field}), "{body}");
        assert!(error["requestId"].is_string());
    }
}

#[tokio::test]
async fn the_owner_id_comes_from_the_session_only() {
    let app = TestApp::spawn().await;
    let mut victim = app.user().await;
    let mut attacker = app.user().await;
    let victim_settings: UserSettings = ok(victim.get("/api/settings").await.dto());

    let forged = attacker
        .put(
            "/api/settings",
            json!({"theme": "dark", "userId": victim.id}),
        )
        .await;
    expect_unknown_field(&forged, "userId");

    let after: UserSettings = ok(victim.get("/api/settings").await.dto());
    assert_eq!(
        after, victim_settings,
        "the victim's settings are untouched"
    );
    let attacker_settings: UserSettings = ok(attacker.get("/api/settings").await.dto());
    assert_ne!(
        attacker_settings.id, victim_settings.id,
        "each user has their own row"
    );
}

#[tokio::test]
async fn the_default_calendar_must_be_an_own_editable_calendar() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut other = app.user().await;
    let calendar = ok(owner
        .post(
            "/api/calendars",
            json!({"encryptedName": fake_envelope(), "color": "#3b82f6"}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    let calendar_id = calendar["id"].as_str().expect("calendar id").to_owned();

    let foreign = other
        .put("/api/settings", json!({"defaultCalendarId": calendar_id}))
        .await;
    let error = ok(foreign.expect_error(
        400,
        "Validation Error",
        "Invalid default calendar or calendar does not belong to user",
    ));
    assert_eq!(error["details"], json!({"field": "defaultCalendarId"}));

    let set: UserSettings = ok(owner
        .put("/api/settings", json!({"defaultCalendarId": calendar_id}))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(set.default_calendar_id.map(|id| id.0), Some(calendar_id));

    let cleared: UserSettings = ok(owner
        .put("/api/settings", json!({"defaultCalendarId": null}))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(cleared.default_calendar_id, None, "null clears the default");
}

#[tokio::test]
async fn reset_deletes_the_row_and_the_next_read_recreates_defaults() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let changed: UserSettings = ok(user
        .put("/api/settings", json!({"theme": "dark"}))
        .await
        .dto());

    let reset: SuccessMessage = ok(user
        .delete("/api/settings")
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        reset,
        SuccessMessage {
            success: true,
            message: "User settings reset to defaults".into()
        }
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM user_settings WHERE user_id = $1",
            &user.id
        )
        .await,
        0
    );

    let fresh: UserSettings = ok(user.get("/api/settings").await.dto());
    assert_eq!(fresh.theme, "light");
    assert_ne!(fresh.id, changed.id);

    let again: SuccessMessage = ok(user
        .delete("/api/settings")
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert!(again.success, "resetting twice is fine");
}

#[tokio::test]
async fn read_only_and_staging_calendars_cannot_be_the_default() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    for (name, kind, visible) in [
        ("Holidays", "subscribed", true),
        ("Invitations", "owned", false),
    ] {
        let calendar_id = format!("suitecal{}", hex(8));
        sqlx::query(
            "INSERT INTO calendar (id, name, color, kind, is_visible, user_id, created_at, updated_at) \
             VALUES ($1, $2, '#64748b', $3, $4, $5, now(), now())",
        )
        .bind(&calendar_id)
        .bind(name)
        .bind(kind)
        .bind(visible)
        .bind(&user.id)
        .execute(&app.db)
        .await
        .expect("insert calendar");
        let error = ok(user
            .put("/api/settings", json!({"defaultCalendarId": calendar_id}))
            .await
            .expect_error(
                400,
                "Validation Error",
                "The default calendar must be one of your editable calendars.",
            ));
        assert_eq!(
            error["details"],
            json!({"field": "defaultCalendarId"}),
            "{name}"
        );
    }
}

#[tokio::test]
async fn sealed_preferences_replace_their_plaintext_copies() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    ok(user
        .put(
            "/api/settings",
            json!({"theme": "dark", "weekStartDay": 0, "workingDays": "[1,2]", "showWeekNumbers": true, "timezone": "Europe/Amsterdam"}),
        )
        .await
        .expect_status(200));
    let sealed = fake_envelope();

    let settings: UserSettings = ok(user
        .put(
            "/api/settings",
            json!({"encryptedPreferences": sealed, "theme": "system", "timeFormat": "12h"}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));

    assert_eq!(
        settings.encrypted_preferences.as_deref(),
        Some(sealed.as_str())
    );
    assert_eq!(
        (
            settings.theme.as_str(),
            settings.week_start_day,
            settings.working_days.as_str()
        ),
        ("light", 1, "[1,2,3,4,5]"),
        "the moved fields fall back to the defaults, ignoring any sent alongside"
    );
    assert!(!settings.show_week_numbers);
    assert_eq!(
        (settings.timezone.as_str(), settings.time_format.as_str()),
        ("Europe/Amsterdam", "12h"),
        "the fields the server reads stay readable"
    );
    let read: UserSettings = ok(user.get("/api/settings").await.dto());
    assert_eq!(read.encrypted_preferences.as_deref(), Some(sealed.as_str()));
}

#[tokio::test]
async fn shipped_clients_can_still_write_plaintext_preferences() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let sealed = fake_envelope();
    ok(user
        .put("/api/settings", json!({"encryptedPreferences": sealed}))
        .await
        .expect_status(200));

    let settings: UserSettings = ok(user
        .put(
            "/api/settings",
            json!({"theme": "dark", "compactView": true}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));

    assert_eq!(
        (settings.theme.as_str(), settings.compact_view),
        ("dark", true)
    );
    assert_eq!(
        settings.encrypted_preferences.as_deref(),
        Some(sealed.as_str())
    );
}

#[tokio::test]
async fn sealed_preferences_must_be_a_bounded_string() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    for (body, message) in [
        (
            json!({"encryptedPreferences": ""}),
            "String must contain at least 1 character(s)",
        ),
        (
            json!({"encryptedPreferences": "x".repeat(16_385)}),
            "String must contain at most 16384 character(s)",
        ),
        (
            json!({"encryptedPreferences": null}),
            "Expected string, received null",
        ),
    ] {
        expect_invalid(
            &user.put("/api/settings", body).await,
            message,
            "encryptedPreferences",
        );
    }
    let settings: UserSettings = ok(user.get("/api/settings").await.dto());
    assert_eq!(settings.encrypted_preferences, None);
}
