//! `POST /api/subscriptions/import-ics`: ICS files parsed and encrypted on-device, plus the legacy plaintext body.

use serde_json::{Value, json};
use solace_api_tests::seed::fake_envelope;
use solace_api_types::Timestamp;
use solace_api_types::events::{IcsImportResult, ParticipantInput};
use solace_api_types::subscriptions::{EncryptedIcsEvent, EncryptedIcsImportRequest};

use crate::event_fixtures::{
    StoredContent, calendar_id, insert_calendar, list_events, stored_content, to_json, unfold,
};
use crate::helpers::{
    Backend, TestApp, TestUser, count, expect_unauthorized, expect_unknown_field, ok,
};

fn entry(external_id: &str) -> EncryptedIcsEvent {
    EncryptedIcsEvent {
        external_id: external_id.into(),
        series_external_id: None,
        occurrence_date: None,
        excluded_dates: None,
        start: Timestamp("2099-03-02T09:00:00.000Z".into()),
        end: Timestamp("2099-03-02T10:00:00.000Z".into()),
        all_day: false,
        timezone: "Europe/Amsterdam".into(),
        recurrence: None,
        encrypted_content: fake_envelope(),
        blind_index_tokens: Some(vec!["keyed-token".into()]),
        encryption_key_version: None,
        participants: None,
    }
}

fn body(calendar: &str, events: Vec<EncryptedIcsEvent>) -> Value {
    to_json(&EncryptedIcsImportRequest {
        calendar_id: calendar.to_owned().into(),
        encrypted_events: events,
    })
}

async fn import(user: &mut TestUser, body: Value) -> IcsImportResult {
    ok(user
        .post("/api/subscriptions/import-ics", body)
        .await
        .expect_status(200)
        .and_then(|r| r.dto()))
}

async fn event_id(app: &TestApp, calendar: &str, external_id: &str) -> String {
    sqlx::query_scalar("SELECT id FROM calendar_event WHERE calendar_id = $1 AND external_id = $2")
        .bind(calendar)
        .bind(external_id)
        .fetch_one(&app.db)
        .await
        .expect("imported event")
}

fn result(created: i64, total: i64, errors: Option<Vec<&str>>) -> IcsImportResult {
    IcsImportResult {
        success: true,
        events_created: created,
        events_total: total,
        file_name: None,
        calendar_name: None,
        errors: errors.map(|errors| errors.into_iter().map(str::to_owned).collect()),
    }
}

#[tokio::test]
async fn anonymous_callers_are_refused() {
    let app = TestApp::spawn().await;
    let mut anon = app.anonymous();
    expect_unauthorized(&ok(anon
        .post(
            "/api/subscriptions/import-ics",
            body("cal", vec![entry("x")]),
        )
        .await));
}

#[tokio::test]
async fn imports_store_only_ciphertext() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let mut first = entry("opaque-one");
    first.encryption_key_version = Some(3);
    first.participants = Some(vec![ParticipantInput {
        email: "Guest@Example.com".into(),
        display_name: None,
        role: None,
        status: None,
    }]);
    let ciphertext = first.encrypted_content.clone();
    let mut untokened = entry("opaque-two");
    untokened.blind_index_tokens = None;
    untokened.all_day = true;

    assert_eq!(
        import(&mut owner, body(&calendar, vec![first, untokened])).await,
        result(2, 2, None)
    );
    let id = event_id(&app, &calendar, "opaque-one").await;
    assert_eq!(
        stored_content(&app.db, &id).await,
        StoredContent {
            title: String::new(),
            description: None,
            location: None,
            encrypted_content: Some(ciphertext),
            blind_index_tokens: Some(r#"["keyed-token"]"#.into()),
            encryption_state: "encrypted".into(),
            encryption_key_version: 3,
        }
    );
    let (timezone, all_day, synced): (String, bool, bool) =
        sqlx::query_as("SELECT timezone, all_day, is_synced FROM calendar_event WHERE id = $1")
            .bind(&id)
            .fetch_one(&app.db)
            .await
            .expect("row");
    assert_eq!(
        (timezone.as_str(), all_day, synced),
        ("Europe/Amsterdam", false, false)
    );
    let people: Vec<(String, String, String)> =
        sqlx::query_as("SELECT email, role, status FROM event_participant WHERE event_id = $1")
            .bind(&id)
            .fetch_all(&app.db)
            .await
            .expect("participants");
    assert_eq!(
        people,
        [(
            "guest@example.com".to_owned(),
            "attendee".to_owned(),
            "pending".to_owned()
        )],
        "imports add no organizer and invite nobody"
    );
    let second = event_id(&app, &calendar, "opaque-two").await;
    assert_eq!(
        stored_content(&app.db, &second)
            .await
            .blind_index_tokens
            .as_deref(),
        Some("[]")
    );
}

#[tokio::test]
async fn duplicates_are_skipped_per_owner_and_calendar() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut other = app.user().await;
    let work = calendar_id(&mut owner, "Work").await;
    let family = calendar_id(&mut owner, "Family").await;
    let other_work = calendar_id(&mut other, "Work").await;
    import(&mut owner, body(&work, vec![entry("shared-id")])).await;
    let id = event_id(&app, &work, "shared-id").await;
    let before = stored_content(&app.db, &id).await;

    assert_eq!(
        import(&mut owner, body(&work, vec![entry("shared-id")])).await,
        result(
            0,
            1,
            Some(vec!["An event already exists in this calendar."])
        )
    );
    assert_eq!(
        stored_content(&app.db, &id).await,
        before,
        "not overwritten"
    );
    assert_eq!(
        import(&mut owner, body(&family, vec![entry("shared-id")])).await,
        result(1, 1, None),
        "another calendar is another scope"
    );
    assert_eq!(
        import(&mut other, body(&other_work, vec![entry("shared-id")])).await,
        result(1, 1, None),
        "another owner is another scope"
    );
}

#[tokio::test]
async fn other_users_and_read_only_calendars_are_refused() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut other = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let feed = insert_calendar(&app, &owner.id, "subscribed", false).await;
    let body_for_owner = body(&calendar, vec![entry("x")]);
    let error = ok(other
        .post("/api/subscriptions/import-ics", body_for_owner)
        .await
        .expect_error(404, "Not Found", "Calendar not found or not owned by user"));
    assert!(error["requestId"].is_string());
    let error = ok(owner
        .post(
            "/api/subscriptions/import-ics",
            body(&feed, vec![entry("x")]),
        )
        .await
        .expect_error(
            400,
            "Validation Error",
            "Cannot import events into a read-only calendar.",
        ));
    assert_eq!(error["details"], json!({"field": "calendarId"}));
    let mut forged = body(&calendar, vec![entry("x")]);
    forged["userId"] = json!(owner.id);
    expect_unknown_field(
        &other.post("/api/subscriptions/import-ics", forged).await,
        "userId",
    );
    for user_id in [&owner.id, &other.id] {
        assert_eq!(
            count(
                &app.db,
                "SELECT count(*) FROM calendar_event WHERE user_id = $1",
                user_id
            )
            .await,
            0
        );
    }
}

#[tokio::test]
async fn overrides_link_to_their_series() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let mut series = entry("series-token");
    series.recurrence = Some(r#"{"frequency":"weekly","interval":1,"count":3}"#.into());
    series.excluded_dates = Some(vec![Timestamp("2099-03-16T09:00:00.000Z".into())]);
    let mut moved = entry("override-token");
    moved.series_external_id = Some("series-token".into());
    moved.occurrence_date = Some(Timestamp("2099-03-09T09:00:00.000Z".into()));
    moved.start = Timestamp("2099-03-09T12:00:00.000Z".into());
    moved.end = Timestamp("2099-03-09T13:00:00.000Z".into());
    moved.recurrence = Some(r#"{"frequency":"daily","interval":1}"#.into());

    assert_eq!(
        import(&mut owner, body(&calendar, vec![moved, series])).await,
        result(2, 2, None),
        "series import before their overrides whatever the order"
    );
    let series_id = event_id(&app, &calendar, "series-token").await;
    let override_id = event_id(&app, &calendar, "override-token").await;
    let (parent, rule): (Option<String>, Option<String>) =
        sqlx::query_as("SELECT parent_event_id, recurrence FROM calendar_event WHERE id = $1")
            .bind(&override_id)
            .fetch_one(&app.db)
            .await
            .expect("override");
    assert_eq!((parent.as_deref(), rule), (Some(series_id.as_str()), None));
    let exceptions: Vec<(String, String, Option<String>)> = sqlx::query_as(
        "SELECT to_char(exception_date, 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'), type, modified_event_id \
         FROM recurrence_exception WHERE parent_event_id = $1 ORDER BY exception_date",
    )
    .bind(&series_id)
    .fetch_all(&app.db)
    .await
    .expect("exceptions");
    assert_eq!(
        exceptions,
        [
            (
                "2099-03-09T09:00:00.000Z".to_owned(),
                "modified".to_owned(),
                Some(override_id.clone())
            ),
            (
                "2099-03-16T09:00:00.000Z".to_owned(),
                "deleted".to_owned(),
                None
            ),
        ]
    );

    let list = list_events(
        &mut owner,
        "2099-03-01T00:00:00.000Z",
        "2099-03-31T00:00:00.000Z",
    )
    .await;
    let starts: Vec<&str> = list.events.iter().map(|e| e.start.0.as_str()).collect();
    match app.backend {
        // TypeScript's list never applies a series' exceptions (see events_list).
        Backend::TypeScript => assert_eq!(
            starts,
            [
                "2099-03-02T09:00:00.000Z",
                "2099-03-09T09:00:00.000Z",
                "2099-03-09T12:00:00.000Z",
                "2099-03-16T09:00:00.000Z",
            ]
        ),
        Backend::Rust => assert_eq!(
            starts,
            ["2099-03-02T09:00:00.000Z", "2099-03-09T12:00:00.000Z"],
            "the override replaces its occurrence and the excluded date is gone"
        ),
    }

    let mut orphan = entry("orphan-token");
    orphan.series_external_id = Some("missing-series".into());
    orphan.occurrence_date = Some(Timestamp("2099-03-09T09:00:00.000Z".into()));
    assert_eq!(
        import(&mut owner, body(&calendar, vec![orphan])).await,
        result(
            0,
            1,
            Some(vec!["An occurrence could not be linked to its series."])
        )
    );
}

#[tokio::test]
async fn encrypted_entries_are_strictly_validated() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let cases = [
        (
            json!({"title": "secret"}),
            "Unrecognized key(s) in object: 'title'",
            "encryptedEvents.0",
        ),
        (
            json!({"end": "2099-03-02T08:00:00.000Z"}),
            "End must follow start",
            "encryptedEvents.0",
        ),
        (
            json!({"seriesExternalId": "series"}),
            "An override requires a series and occurrence date",
            "encryptedEvents.0",
        ),
        (
            json!({"occurrenceDate": "2099-03-09T09:00:00.000Z"}),
            "An override requires a series and occurrence date",
            "encryptedEvents.0",
        ),
        (
            json!({"recurrence": "bad"}),
            "Invalid recurrence rule",
            "encryptedEvents.0",
        ),
        (
            json!({"recurrence": r#"{"frequency":"daily","interval":1,"extra":1}"#}),
            "Invalid recurrence rule",
            "encryptedEvents.0",
        ),
        (
            json!({"start": "2099-03-02"}),
            "Invalid datetime",
            "encryptedEvents.0.start",
        ),
        (
            json!({"timezone": "Mars/X"}),
            "Invalid timezone identifier",
            "encryptedEvents.0.timezone",
        ),
        (
            json!({"externalId": "y".repeat(129)}),
            "String must contain at most 128 character(s)",
            "encryptedEvents.0.externalId",
        ),
        (
            json!({"encryptedContent": ""}),
            "String must contain at least 1 character(s)",
            "encryptedEvents.0.encryptedContent",
        ),
        (
            json!({"excludedDates": ["yesterday"]}),
            "Invalid datetime",
            "encryptedEvents.0.excludedDates.0",
        ),
    ];
    for (patch, message, path) in cases {
        let mut request = body(&calendar, vec![entry("x")]);
        for (key, value) in patch.as_object().expect("object") {
            request["encryptedEvents"][0][key] = value.clone();
        }
        let error = ok(owner
            .post("/api/subscriptions/import-ics", request)
            .await
            .expect_error(400, "Validation Error", message));
        assert_eq!(
            error["details"]["issues"][0]["path"],
            json!(path),
            "{patch}"
        );
    }
    let error = ok(owner
        .post("/api/subscriptions/import-ics", body(&calendar, vec![]))
        .await
        .expect_error(
            400,
            "Validation Error",
            "Array must contain at least 1 element(s)",
        ));
    assert_eq!(
        error["details"]["issues"][0]["path"],
        json!("encryptedEvents")
    );
    let many: Vec<EncryptedIcsEvent> = (0..101).map(|i| entry(&format!("bulk-{i}"))).collect();
    ok(owner
        .post("/api/subscriptions/import-ics", body(&calendar, many))
        .await
        .expect_error(
            400,
            "Validation Error",
            "Array must contain at most 100 element(s)",
        ));
    let mut mixed = body(&calendar, vec![entry("x")]);
    mixed["icsContent"] = json!("BEGIN:VCALENDAR");
    expect_unknown_field(
        &owner.post("/api/subscriptions/import-ics", mixed).await,
        "icsContent",
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM calendar_event WHERE user_id = $1",
            &owner.id
        )
        .await,
        0
    );
}

#[tokio::test]
async fn legacy_plaintext_imports_still_work() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let ics = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "X-WR-CALNAME:Legacy",
        "BEGIN:VEVENT",
        "UID:legacy-uid-1",
        "DTSTAMP:20990101T000000Z",
        "SUMMARY:Legacy meeting",
        "DTSTART:20990302T090000Z",
        "DTEND:20990302T100000Z",
        "END:VEVENT",
        "END:VCALENDAR",
        "",
    ]
    .join("\r\n");
    let first = import(
        &mut owner,
        json!({"calendarId": calendar, "icsContent": ics, "fileName": "legacy.ics"}),
    )
    .await;
    assert_eq!(
        first,
        IcsImportResult {
            success: true,
            events_created: 1,
            events_total: 1,
            file_name: Some("legacy.ics".into()),
            calendar_name: Some("Legacy".into()),
            errors: None,
        }
    );
    let id = event_id(&app, &calendar, "legacy-uid-1").await;
    assert_eq!(
        stored_content(&app.db, &id).await.title,
        "Legacy meeting",
        "shipped clients still send plaintext ICS"
    );
    let again = import(
        &mut owner,
        json!({"calendarId": calendar, "icsContent": ics}),
    )
    .await;
    assert_eq!(
        again,
        IcsImportResult {
            success: true,
            events_created: 0,
            events_total: 1,
            file_name: Some("unknown.ics".into()),
            calendar_name: Some("Legacy".into()),
            errors: Some(vec![
                "Event \"Legacy meeting\" with UID legacy-uid-1 already exists in calendar".into()
            ]),
        }
    );
}

#[tokio::test]
async fn a_single_day_all_day_import_exports_as_one_day() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let ics = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:single-day-holiday",
        "DTSTART;VALUE=DATE:20990302",
        "DTEND;VALUE=DATE:20990303",
        "SUMMARY:Single-day holiday",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    .join("\r\n");
    let imported = import(
        &mut owner,
        json!({"calendarId": calendar, "icsContent": ics}),
    )
    .await;
    assert_eq!((imported.events_created, imported.calendar_name), (1, None));
    let id = event_id(&app, &calendar, "single-day-holiday").await;
    let exported = ok(owner
        .get(&format!("/api/events/{id}/ics"))
        .await
        .expect_status(200))
    .text();
    let exported = unfold(&exported);
    assert!(
        exported.contains("DTSTART;VALUE=DATE:20990302\r\nDTEND;VALUE=DATE:20990303\r\n"),
        "{exported}"
    );
    assert!(exported.contains("UID:single-day-holiday\r\n"));
}
