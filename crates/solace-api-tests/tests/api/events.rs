//! `/api/events` create, read, update, delete, ICS export, bulk actions and sealing, for every role.

use serde_json::{Value, json};
use solace_api_tests::seed::fake_envelope;
use solace_api_types::common::OperationWarning;
use solace_api_types::events::{
    BulkEventRequest, BulkEventResult, Event, EventDeleted, SealEncryptionRequest,
    UpdateEventRequest,
};

use crate::event_fixtures::{
    FUTURE_END, FUTURE_START, StoredContent, calendar_id, create_event, encrypted_event,
    insert_calendar, insert_plaintext_event, iso_from_now, row_snapshot, stored_content, to_json,
    unfold,
};
use crate::helpers::{Backend, TestApp, count, expect_unauthorized, expect_unknown_field, hex, ok};

const COLOR_MESSAGE: &str = "Color must be one of: blue, orange, violet, rose, emerald, red, cyan, lime, amber, indigo, pink, teal or a valid hex color (e.g., #FF0000)";
const PLAINTEXT_BESIDE_CIPHERTEXT: &str =
    "Plaintext event content must not be sent alongside encrypted content.";
const NOT_FOUND: &str = "Event not found or access denied";

/// type, minutes, time, local time, zone, enabled, sent, title ciphertext.
type ScheduleRow = (
    String,
    i32,
    String,
    String,
    String,
    bool,
    bool,
    Option<String>,
);

fn issue_paths(error: &Value) -> Vec<String> {
    error["details"]["issues"]
        .as_array()
        .map(|issues| {
            issues
                .iter()
                .map(|issue| issue["path"].as_str().unwrap_or_default().to_owned())
                .collect()
        })
        .unwrap_or_default()
}

#[tokio::test]
async fn anonymous_callers_are_refused() {
    let app = TestApp::spawn().await;
    let mut anon = app.anonymous();
    let id = "cmanyeventid000000000000";
    for path in [
        "/api/events?start=2099-03-01T00:00:00.000Z&end=2099-03-31T00:00:00.000Z".to_owned(),
        format!("/api/events/{id}"),
        format!("/api/events/{id}/ics"),
        "/api/events/search?q=team".to_owned(),
        "/api/events/search-corpus".to_owned(),
        "/api/events/invitations/by-external-id?externalId=x".to_owned(),
    ] {
        expect_unauthorized(&ok(anon.get(&path).await));
    }
    let create = to_json(&encrypted_event("cal", FUTURE_START, FUTURE_END));
    for (path, body) in [
        ("/api/events".to_owned(), create),
        (
            format!("/api/events/{id}/rsvp"),
            json!({"status": "accepted"}),
        ),
        (
            format!("/api/events/{id}/seal-encryption"),
            json!({"encryptedContent": "x"}),
        ),
        (
            "/api/events/bulk".to_owned(),
            json!({"action": "delete", "eventIds": [id]}),
        ),
        (
            "/api/events/invitations/import-ics".to_owned(),
            json!({"icsContent": "x"}),
        ),
        (
            "/api/events/invitations/decline-ics".to_owned(),
            json!({"icsContent": "x"}),
        ),
    ] {
        expect_unauthorized(&ok(anon.post(&path, body).await));
    }
    expect_unauthorized(&ok(anon
        .put(&format!("/api/events/{id}"), json!({"color": "red"}))
        .await));
    expect_unauthorized(&ok(anon.delete(&format!("/api/events/{id}")).await));

    // Elysia validated before the guard, so TypeScript answers a malformed anonymous body 400; Rust's guard answers first.
    let response = ok(anon.post("/api/events", json!({})).await);
    match app.backend {
        Backend::TypeScript => {
            let error = ok(response.expect_error(400, "Validation Error", "Required"));
            assert_eq!(issue_paths(&error), ["start", "end", "calendarId"]);
        }
        Backend::Rust => expect_unauthorized(&response),
    }
}

#[tokio::test]
async fn an_encrypted_event_is_stored_as_ciphertext_only() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let mut request = encrypted_event(&calendar, FUTURE_START, FUTURE_END);
    request.timezone = Some("Europe/Amsterdam".into());
    request.color = Some("blue".into());
    request.all_day = Some(false);
    request.encryption_key_version = Some(2);
    let ciphertext = request.encrypted_content.clone().expect("ciphertext");
    let tokens = request.blind_index_tokens.clone().expect("tokens");

    let created = create_event(&mut owner, &request).await;

    assert_eq!(created.user_id.0, owner.id);
    assert_eq!(created.calendar_id.0, calendar);
    assert_eq!(created.calendar.name, "Work");
    assert_eq!(created.category, None);
    assert_eq!(
        (
            created.title.as_str(),
            &created.description,
            &created.location
        ),
        ("", &None, &None)
    );
    assert_eq!(
        created.encrypted_content.as_deref(),
        Some(ciphertext.as_str())
    );
    assert_eq!(
        created.blind_index_tokens,
        Some(serde_json::to_string(&tokens).expect("tokens json"))
    );
    assert_eq!(
        (
            created.encryption_state.as_str(),
            created.encryption_key_version
        ),
        ("encrypted", 2)
    );
    assert_eq!(
        (created.start.0.as_str(), created.end.0.as_str()),
        (FUTURE_START, FUTURE_END)
    );
    assert_eq!(created.timezone, "Europe/Amsterdam");
    assert_eq!(created.color.as_deref(), Some("blue"));
    assert!(!created.all_day && !created.is_private && !created.is_cancelled && !created.is_synced);
    assert_eq!((created.reminder, &created.recurrence), (None, &None));
    let uid = created.external_id.clone().expect("external id");
    assert!(uid.ends_with("@solace-calendar.local"), "{uid}");
    assert_eq!(created.stalwart_uid.as_deref(), Some(uid.as_str()));
    assert_eq!(
        (&created.stalwart_event_id, &created.stalwart_synced_at),
        (&None, &None)
    );
    assert_eq!(created.created_at, created.updated_at);
    for stamp in [&created.created_at, &created.calendar.created_at] {
        let bytes = stamp.0.as_bytes();
        assert!(
            bytes.len() == 24 && bytes[10] == b'T' && bytes[19] == b'.' && bytes[23] == b'Z',
            "toISOString shape: {stamp:?}"
        );
    }
    let participants = created.participants.clone().expect("participants");
    assert_eq!(participants.len(), 1, "the owner becomes the organizer");
    assert_eq!(
        (
            participants[0].email.as_str(),
            participants[0].role.as_str(),
            participants[0].status.as_str()
        ),
        (owner.email.as_str(), "organizer", "accepted")
    );
    assert_eq!(participants[0].display_name, owner.name);
    assert_eq!(
        participants[0].user_id.as_ref().map(|id| id.0.as_str()),
        Some(owner.id.as_str())
    );

    assert_eq!(
        stored_content(&app.db, &created.id.0).await,
        StoredContent {
            title: String::new(),
            description: None,
            location: None,
            encrypted_content: Some(ciphertext),
            blind_index_tokens: Some(serde_json::to_string(&tokens).expect("tokens json")),
            encryption_state: "encrypted".into(),
            encryption_key_version: 2,
        }
    );

    let fetched: Event = ok(owner
        .get(&format!("/api/events/{}", created.id))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(fetched, created, "a read returns what create returned");
}

#[tokio::test]
async fn the_timezone_falls_back_to_the_settings_then_amsterdam() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Personal").await;
    let request = encrypted_event(&calendar, FUTURE_START, FUTURE_END);
    assert_eq!(
        create_event(&mut owner, &request).await.timezone,
        "Europe/Amsterdam"
    );

    ok(owner
        .put("/api/settings", json!({"timezone": "America/New_York"}))
        .await
        .expect_status(200));
    assert_eq!(
        create_event(&mut owner, &request).await.timezone,
        "America/New_York"
    );
    let mut explicit = request.clone();
    explicit.timezone = Some("Asia/Tokyo".into());
    assert_eq!(
        create_event(&mut owner, &explicit).await.timezone,
        "Asia/Tokyo"
    );
}

#[tokio::test]
async fn named_and_hex_colors_are_accepted() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    for color in [
        "blue", "orange", "violet", "rose", "emerald", "red", "cyan", "lime", "amber", "indigo",
        "pink", "teal", "#3b82f6", "#FFF",
    ] {
        let mut request = encrypted_event(&calendar, FUTURE_START, FUTURE_END);
        request.color = Some(color.into());
        let created = create_event(&mut owner, &request).await;
        assert_eq!(created.color.as_deref(), Some(color));
        let (stored,): (Option<String>,) =
            sqlx::query_as("SELECT color FROM calendar_event WHERE id = $1")
                .bind(&created.id.0)
                .fetch_one(&app.db)
                .await
                .expect("color");
        assert_eq!(stored.as_deref(), Some(color));
    }
    let uncolored = create_event(
        &mut owner,
        &encrypted_event(&calendar, FUTURE_START, FUTURE_END),
    )
    .await;
    assert_eq!(uncolored.color, None, "no color is stored as null");

    let updated: Event = ok(owner
        .put(
            &format!("/api/events/{}", uncolored.id),
            json!({"color": "violet"}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(updated.color.as_deref(), Some("violet"));
    let updated: Event = ok(owner
        .put(
            &format!("/api/events/{}", uncolored.id),
            json!({"color": "#10B981"}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(updated.color.as_deref(), Some("#10B981"));
}

#[tokio::test]
async fn invalid_colors_are_rejected_listing_every_allowed_color() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let existing = create_event(
        &mut owner,
        &encrypted_event(&calendar, FUTURE_START, FUTURE_END),
    )
    .await;
    for color in ["chartreuse", "BLUE", "rgb(0,0,0)", "#GGGGGG", "#12345", ""] {
        let mut request = to_json(&encrypted_event(&calendar, FUTURE_START, FUTURE_END));
        request["color"] = json!(color);
        let error = ok(owner.post("/api/events", request).await.expect_error(
            400,
            "Validation Error",
            COLOR_MESSAGE,
        ));
        assert_eq!(issue_paths(&error), ["color"], "{color}");

        let error = ok(owner
            .put(
                &format!("/api/events/{}", existing.id),
                json!({"color": color}),
            )
            .await
            .expect_error(400, "Validation Error", COLOR_MESSAGE));
        assert_eq!(issue_paths(&error), ["color"], "{color}");
    }
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM calendar_event WHERE user_id = $1",
            &owner.id
        )
        .await,
        1
    );
    assert_eq!(
        row_snapshot(&app.db, "calendar_event", &existing.id.0)
            .await
            .expect("row")["color"],
        Value::Null
    );
}

#[tokio::test]
async fn plaintext_content_beside_ciphertext_is_rejected() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let existing = create_event(
        &mut owner,
        &encrypted_event(&calendar, FUTURE_START, FUTURE_END),
    )
    .await;
    let before = row_snapshot(&app.db, "calendar_event", &existing.id.0).await;
    let cases = [
        (json!({"title": "Secret title"}), vec!["title"]),
        (json!({"description": "Secret notes"}), vec!["description"]),
        (json!({"location": "Secret place"}), vec!["location"]),
        (
            json!({"title": "T", "description": "D", "location": "L"}),
            vec!["title", "description", "location"],
        ),
    ];
    for (plaintext, paths) in cases {
        let mut body = to_json(&encrypted_event(&calendar, FUTURE_START, FUTURE_END));
        for (key, value) in plaintext.as_object().expect("object") {
            body[key] = value.clone();
        }
        let error = ok(owner.post("/api/events", body).await.expect_error(
            400,
            "Validation Error",
            PLAINTEXT_BESIDE_CIPHERTEXT,
        ));
        assert_eq!(issue_paths(&error), paths, "create {plaintext}");

        let mut update = plaintext.clone();
        update["encryptedContent"] = json!(fake_envelope());
        let error = ok(owner
            .put(&format!("/api/events/{}", existing.id), update)
            .await
            .expect_error(400, "Validation Error", PLAINTEXT_BESIDE_CIPHERTEXT));
        assert_eq!(issue_paths(&error), paths, "update {plaintext}");
    }
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM calendar_event WHERE user_id = $1",
            &owner.id
        )
        .await,
        1
    );
    assert_eq!(
        row_snapshot(&app.db, "calendar_event", &existing.id.0).await,
        before
    );
}

#[tokio::test]
async fn blank_plaintext_fields_beside_ciphertext_are_accepted_and_dropped() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let mut request = encrypted_event(&calendar, FUTURE_START, FUTURE_END);
    request.title = Some(String::new());
    request.description = Some("   ".into());
    request.location = Some(String::new());
    let created = create_event(&mut owner, &request).await;
    let stored = stored_content(&app.db, &created.id.0).await;
    assert_eq!(
        (
            stored.title.as_str(),
            stored.description,
            stored.location,
            stored.encryption_state.as_str()
        ),
        ("", None, None, "encrypted")
    );
}

#[tokio::test]
async fn invitation_content_needs_ciphertext_and_participants() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let message = "Invitation content is only accepted with encrypted content and participants.";

    let mut body = to_json(&encrypted_event(&calendar, FUTURE_START, FUTURE_END));
    body["invitationContent"] = json!({"title": "Planning"});
    let error =
        ok(owner
            .post("/api/events", body)
            .await
            .expect_error(400, "Validation Error", message));
    assert_eq!(issue_paths(&error), ["invitationContent"]);

    let body = json!({
        "start": FUTURE_START, "end": FUTURE_END, "calendarId": calendar,
        "participants": [{"email": "guest@example.com"}],
        "invitationContent": {"title": "Planning"},
    });
    let error = ok(owner.post("/api/events", body).await.expect_error(
        400,
        "Validation Error",
        "Title is required and cannot be empty",
    ));
    assert_eq!(issue_paths(&error), ["title", "invitationContent"]);

    let mut body = to_json(&encrypted_event(&calendar, FUTURE_START, FUTURE_END));
    body["participants"] = json!([{"email": "guest@example.com"}]);
    body["invitationContent"] = json!({"title": ""});
    let error = ok(owner.post("/api/events", body).await.expect_error(
        400,
        "Validation Error",
        "String must contain at least 1 character(s)",
    ));
    assert_eq!(issue_paths(&error), ["invitationContent.title"]);
    let mut body = to_json(&encrypted_event(&calendar, FUTURE_START, FUTURE_END));
    body["participants"] = json!([{"email": "guest@example.com"}]);
    body["invitationContent"] = json!({"title": "Planning", "notes": "x"});
    expect_unknown_field(&owner.post("/api/events", body).await, "notes");
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
async fn client_controlled_encryption_state_is_rejected() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let mut body = to_json(&encrypted_event(&calendar, FUTURE_START, FUTURE_END));
    body["encryptionState"] = json!("plaintext");
    expect_unknown_field(&owner.post("/api/events", body).await, "encryptionState");

    let existing = create_event(
        &mut owner,
        &encrypted_event(&calendar, FUTURE_START, FUTURE_END),
    )
    .await;
    expect_unknown_field(
        &owner
            .put(
                &format!("/api/events/{}", existing.id),
                json!({"encryptionState": "plaintext"}),
            )
            .await,
        "encryptionState",
    );
    assert_eq!(
        stored_content(&app.db, &existing.id.0)
            .await
            .encryption_state,
        "encrypted"
    );
}

#[tokio::test]
async fn forged_owner_ids_are_rejected() {
    let app = TestApp::spawn().await;
    let mut victim = app.user().await;
    let mut attacker = app.user().await;
    let calendar = calendar_id(&mut attacker, "Work").await;
    let own = create_event(
        &mut attacker,
        &encrypted_event(&calendar, FUTURE_START, FUTURE_END),
    )
    .await;
    let victim_id = victim.id.clone();

    let mut body = to_json(&encrypted_event(&calendar, FUTURE_START, FUTURE_END));
    body["userId"] = json!(victim_id);
    expect_unknown_field(&attacker.post("/api/events", body).await, "userId");
    expect_unknown_field(
        &attacker
            .put(
                &format!("/api/events/{}", own.id),
                json!({"userId": victim_id}),
            )
            .await,
        "userId",
    );
    for path in [
        format!(
            "/api/events?start=2099-03-01T00:00:00.000Z&end=2099-03-31T00:00:00.000Z&userId={victim_id}"
        ),
        format!("/api/events/search?q=team&userId={victim_id}"),
        format!("/api/events/search-corpus?userId={victim_id}"),
        format!("/api/events/invitations/by-external-id?externalId=x&userId={victim_id}"),
    ] {
        expect_unknown_field(&attacker.get(&path).await, "userId");
    }
    for (path, body) in [
        (
            "/api/events/bulk".to_owned(),
            json!({"action": "delete", "eventIds": [own.id], "userId": victim_id}),
        ),
        (
            format!("/api/events/{}/rsvp", own.id),
            json!({"status": "accepted", "userId": victim_id}),
        ),
        (
            format!("/api/events/{}/seal-encryption", own.id),
            json!({"encryptedContent": "x", "userId": victim_id}),
        ),
        (
            "/api/events/invitations/import-ics".to_owned(),
            json!({"icsContent": "x", "userId": victim_id}),
        ),
        (
            "/api/events/invitations/decline-ics".to_owned(),
            json!({"icsContent": "x", "userId": victim_id}),
        ),
    ] {
        expect_unknown_field(&attacker.post(&path, body).await, "userId");
    }
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM calendar_event WHERE user_id = $1",
            &victim.id
        )
        .await,
        0
    );
    ok(victim
        .get(&format!("/api/events/{}", own.id))
        .await
        .expect_error(400, "Validation Error", NOT_FOUND));
}

#[tokio::test]
async fn object_shaped_fields_are_rejected() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let existing = create_event(
        &mut owner,
        &encrypted_event(&calendar, FUTURE_START, FUTURE_END),
    )
    .await;
    let mut body = to_json(&encrypted_event(&calendar, FUTURE_START, FUTURE_END));
    body["calendarId"] = json!({"$ne": calendar});
    let error = ok(owner.post("/api/events", body).await.expect_error(
        400,
        "Validation Error",
        "Expected string, received object",
    ));
    assert_eq!(issue_paths(&error), ["calendarId"]);

    let mut body = to_json(&encrypted_event(&calendar, FUTURE_START, FUTURE_END));
    body["participants"] = json!([{"email": {"$ne": owner.email}, "role": "attendee"}]);
    let error = ok(owner.post("/api/events", body).await.expect_error(
        400,
        "Validation Error",
        "Expected string, received object",
    ));
    assert_eq!(issue_paths(&error), ["participants.0.email"]);

    let error = ok(owner
        .put(
            &format!("/api/events/{}", existing.id),
            json!({"participants": [{"email": {"$ne": ""}}]}),
        )
        .await
        .expect_error(400, "Validation Error", "Expected string, received object"));
    assert_eq!(issue_paths(&error), ["participants.0.email"]);
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM event_participant WHERE event_id = $1",
            &existing.id.0
        )
        .await,
        1,
        "the organizer row is untouched"
    );
}

#[tokio::test]
async fn participant_addresses_are_validated() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let reserved = "Cannot invite system or administrative email addresses";
    let cases = [
        (
            json!({"email": "not-an-email"}),
            "Invalid",
            "participants.0.email",
        ),
        (json!({"email": "a@b"}), "Invalid", "participants.0.email"),
        (json!({"email": "x@y.z"}), "Invalid", "participants.0.email"),
        (
            json!({"email": "admin@solace.onl"}),
            reserved,
            "participants.0.email",
        ),
        (
            json!({"email": "noreply@example.com"}),
            reserved,
            "participants.0.email",
        ),
        (
            json!({"email": "postmaster@example.com"}),
            reserved,
            "participants.0.email",
        ),
        (
            json!({"email": "root@example.com"}),
            reserved,
            "participants.0.email",
        ),
        (
            json!({"email": "guest@example.com", "role": "owner"}),
            "Invalid enum value. Expected 'organizer' | 'attendee', received 'owner'",
            "participants.0.role",
        ),
        (
            json!({"email": "guest@example.com", "status": "maybe"}),
            "Invalid enum value. Expected 'pending' | 'accepted' | 'declined' | 'tentative', received 'maybe'",
            "participants.0.status",
        ),
        (
            json!({"email": "guest@example.com", "displayName": "x".repeat(121)}),
            "String must contain at most 120 character(s)",
            "participants.0.displayName",
        ),
    ];
    for (participant, message, path) in cases {
        let mut body = to_json(&encrypted_event(&calendar, FUTURE_START, FUTURE_END));
        body["participants"] = json!([participant]);
        let error = ok(owner.post("/api/events", body).await.expect_error(
            400,
            "Validation Error",
            message,
        ));
        assert_eq!(issue_paths(&error), [path], "{participant}");
    }
    let mut body = to_json(&encrypted_event(&calendar, FUTURE_START, FUTURE_END));
    body["participants"] = json!([{"email": "guest@example.com", "userId": owner.id}]);
    expect_unknown_field(&owner.post("/api/events", body).await, "userId");
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
async fn field_shapes_are_validated_with_the_zod_message() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let cases = [
        (
            json!({"timezone": "Mars/Base"}),
            "Invalid timezone identifier",
            "timezone",
        ),
        (
            json!({"timezone": ""}),
            "Invalid timezone identifier",
            "timezone",
        ),
        (
            json!({"reminder": 43201}),
            "Number must be less than or equal to 43200",
            "reminder",
        ),
        (
            json!({"reminder": -1}),
            "Number must be greater than or equal to 0",
            "reminder",
        ),
        (
            json!({"reminder": 1.5}),
            "Expected integer, received float",
            "reminder",
        ),
        (json!({"reminder": "15"}), "Invalid input", "reminder"),
        (
            json!({"start": null}),
            "Expected string, received null",
            "start",
        ),
        (
            json!({"allDay": "yes"}),
            "Expected boolean, received string",
            "allDay",
        ),
        (
            json!({"blindIndexTokens": "tok"}),
            "Expected array, received string",
            "blindIndexTokens",
        ),
        (
            json!({"encryptionKeyVersion": 0}),
            "Number must be greater than or equal to 1",
            "encryptionKeyVersion",
        ),
        (
            json!({"recurrence": {"frequency": "daily"}}),
            "Expected string, received object",
            "recurrence",
        ),
    ];
    for (patch, message, path) in cases {
        let mut body = to_json(&encrypted_event(&calendar, FUTURE_START, FUTURE_END));
        for (key, value) in patch.as_object().expect("object") {
            body[key] = value.clone();
        }
        let error = ok(owner.post("/api/events", body).await.expect_error(
            400,
            "Validation Error",
            message,
        ));
        assert_eq!(issue_paths(&error), [path], "{patch}");
    }
    let error = ok(owner
        .post(
            "/api/events",
            json!({"end": FUTURE_END, "calendarId": calendar, "encryptedContent": fake_envelope()}),
        )
        .await
        .expect_error(400, "Validation Error", "Required"));
    assert_eq!(issue_paths(&error), ["start"]);

    let long = "x".repeat(256);
    let cases = [
        (
            json!({"title": long}),
            "String must contain at most 255 character(s)",
            "title",
        ),
        (
            json!({"title": "Ok", "description": "x".repeat(1001)}),
            "String must contain at most 1000 character(s)",
            "description",
        ),
        (
            json!({"title": "Ok", "location": "x".repeat(256)}),
            "String must contain at most 255 character(s)",
            "location",
        ),
        (
            json!({"title": "   "}),
            "Title is required and cannot be empty",
            "title",
        ),
    ];
    for (fields, message, path) in cases {
        let mut body = json!({"start": FUTURE_START, "end": FUTURE_END, "calendarId": calendar});
        for (key, value) in fields.as_object().expect("object") {
            body[key] = value.clone();
        }
        let error = ok(owner.post("/api/events", body).await.expect_error(
            400,
            "Validation Error",
            message,
        ));
        assert_eq!(issue_paths(&error), [path], "{path}");
    }
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
async fn service_rules_reject_inconsistent_events() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut other = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let foreign_calendar = calendar_id(&mut other, "Work").await;
    let feed = insert_calendar(&app, &owner.id, "subscribed", false).await;
    let sync_only = insert_calendar(&app, &owner.id, "owned", true).await;
    let read_only = "Cannot create events in a read-only calendar. This calendar is managed by a subscription or public feed.";
    let cases = [
        (
            json!({"end": "2099-03-02T08:00:00.000Z"}),
            "End time must be after start time",
            "end",
        ),
        (
            json!({"end": FUTURE_START}),
            "End time must be after start time",
            "end",
        ),
        (
            json!({"start": "nonsense"}),
            "Invalid start date format. Use ISO 8601 format",
            "start",
        ),
        (
            json!({"end": "nonsense"}),
            "Invalid end date format. Use ISO 8601 format",
            "end",
        ),
        (
            json!({"recurrence": "not json"}),
            "Invalid recurrence rule format",
            "recurrence",
        ),
        (
            json!({"recurrence": r#"{"frequency":"weekly","interval":1,"count":2,"until":"2099-04-01"}"#}),
            "Invalid recurrence rule format",
            "recurrence",
        ),
        (
            json!({"recurrence": r#"{"frequency":"hourly","interval":1}"#}),
            "Invalid recurrence rule format",
            "recurrence",
        ),
        (
            json!({"recurrence": r#"{"frequency":"daily","interval":1,"byMonth":[1]}"#}),
            "Invalid recurrence rule format",
            "recurrence",
        ),
        (
            json!({"categoryId": "nope"}),
            "Invalid category or category does not belong to user",
            "categoryId",
        ),
        (
            json!({"calendarId": foreign_calendar}),
            "Invalid calendar or calendar does not belong to user",
            "calendarId",
        ),
        (
            json!({"calendarId": ""}),
            "Calendar ID is required",
            "calendarId",
        ),
        (json!({"calendarId": feed}), read_only, "calendarId"),
        (json!({"calendarId": sync_only}), read_only, "calendarId"),
    ];
    for (patch, message, field) in cases {
        let mut body = to_json(&encrypted_event(&calendar, FUTURE_START, FUTURE_END));
        for (key, value) in patch.as_object().expect("object") {
            body[key] = value.clone();
        }
        let error = ok(owner.post("/api/events", body).await.expect_error(
            400,
            "Validation Error",
            message,
        ));
        assert_eq!(error["details"], json!({"field": field}), "{patch}");
    }
    let error = ok(owner
        .post(
            "/api/events",
            json!({"start": FUTURE_START, "end": FUTURE_END, "calendarId": calendar, "title": "Plain"}),
        )
        .await
        .expect_error(
            400,
            "Validation Error",
            "Event encryption requires an active encryption session.",
        ));
    assert_eq!(error["details"], json!({"field": "encryptedContent"}));
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
async fn a_reminder_on_create_schedules_an_email_notification() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let mut request = encrypted_event(&calendar, FUTURE_START, FUTURE_END);
    request.reminder = Some(Some(15));
    request.timezone = Some("Europe/Amsterdam".into());
    let created = create_event(&mut owner, &request).await;
    assert_eq!(created.reminder, Some(15));
    assert_eq!(
        stored_content(&app.db, &created.id.0)
            .await
            .encryption_state,
        "encrypted",
        "reminders do not need plaintext"
    );

    let rows: Vec<ScheduleRow> = sqlx::query_as(
        "SELECT notification_type, minutes_before, to_char(notification_time, 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'), \
         notification_date_local, notification_timezone, is_enabled, is_sent, encrypted_display_title \
         FROM event_notification WHERE event_id = $1",
    )
    .bind(&created.id.0)
    .fetch_all(&app.db)
    .await
    .expect("notifications");
    assert_eq!(
        rows,
        [(
            "email".to_owned(),
            15,
            "2099-03-02T08:45:00.000Z".to_owned(),
            "2099-03-02T09:45:00".to_owned(),
            "Europe/Amsterdam".to_owned(),
            true,
            false,
            None
        )]
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM notification_job WHERE user_id = $1",
            &owner.id
        )
        .await,
        0,
        "the worker, not the API, turns schedules into outbox jobs"
    );

    let past_start = iso_from_now(&app.db, -3600).await;
    let past_end = iso_from_now(&app.db, -1800).await;
    let mut past = encrypted_event(&calendar, &past_start, &past_end);
    past.reminder = Some(Some(15));
    let past = create_event(&mut owner, &past).await;
    assert_eq!(past.reminder, Some(15));
    let mut zero = encrypted_event(&calendar, FUTURE_START, FUTURE_END);
    zero.reminder = Some(Some(0));
    let zero = create_event(&mut owner, &zero).await;
    for event in [&past, &zero] {
        assert_eq!(
            count(
                &app.db,
                "SELECT count(*) FROM event_notification WHERE event_id = $1",
                &event.id.0
            )
            .await,
            0
        );
    }

    ok(owner
        .put(
            "/api/settings",
            json!({"emailNotifications": false, "pushNotifications": false}),
        )
        .await
        .expect_status(200));
    let quiet = create_event(&mut owner, &request).await;
    assert_eq!(quiet.reminder, Some(15));
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM event_notification WHERE event_id = $1",
            &quiet.id.0
        )
        .await,
        0,
        "no schedule when both channels are off"
    );
    ok(owner
        .put("/api/settings", json!({"pushNotifications": true}))
        .await
        .expect_status(200));
    let pushed = create_event(&mut owner, &request).await;
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM event_notification WHERE event_id = $1",
            &pushed.id.0
        )
        .await,
        1,
        "either channel is enough"
    );
}

#[tokio::test]
async fn an_overdue_reminder_on_an_upcoming_event_fires_on_the_next_minute() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let start = iso_from_now(&app.db, 2 * 3600).await;
    let end = iso_from_now(&app.db, 3 * 3600).await;
    let mut request = encrypted_event(&calendar, &start, &end);
    request.reminder = Some(Some(1440));
    let created = create_event(&mut owner, &request).await;

    assert_eq!(created.reminder, Some(1440));
    let schedules = || {
        count(
            &app.db,
            "SELECT count(*) FROM event_notification WHERE event_id = $1",
            &created.id.0,
        )
    };
    match app.backend {
        // TypeScript clamps to the current minute, which chk_notification_time_future (time > created_at) rejects.
        Backend::TypeScript => {
            assert_eq!(
                created.warnings,
                Some(vec![OperationWarning {
                    code: "reminder_schedule_failed".into(),
                    message: "Your event was saved, but the email reminder could not be scheduled. Try again from event settings.".into(),
                    target: None,
                }])
            );
            assert_eq!(schedules().await, 0);
        }
        Backend::Rust => {
            assert_eq!(created.warnings, None);
            assert_eq!(schedules().await, 1);
            assert_eq!(
                overdue_schedule_shape(&app, &created.id.0).await,
                (true, true, true, true),
                "after created_at, on a minute, within a minute, before the start"
            );
        }
    }
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM calendar_event WHERE id = $1",
            &created.id.0
        )
        .await,
        1,
        "the event itself is saved"
    );
}

/// Whether an event's one schedule is after its row's `created_at`, minute-aligned, at most a minute later, and before the event.
pub async fn overdue_schedule_shape(app: &TestApp, event_id: &str) -> (bool, bool, bool, bool) {
    sqlx::query_as(
        "SELECT en.notification_time > en.created_at, \
                date_trunc('minute', en.notification_time) = en.notification_time, \
                en.notification_time <= en.created_at + interval '1 minute', \
                en.notification_time < ce.start \
         FROM event_notification en JOIN calendar_event ce ON ce.id = en.event_id WHERE en.event_id = $1",
    )
    .bind(event_id)
    .fetch_one(&app.db)
    .await
    .expect("schedule")
}

#[tokio::test]
async fn other_users_cannot_read_change_or_delete_an_event() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut other = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let other_calendar = calendar_id(&mut other, "Work").await;
    let mut request = encrypted_event(&calendar, FUTURE_START, FUTURE_END);
    request.reminder = Some(Some(10));
    let event = create_event(&mut owner, &request).await;
    let before = row_snapshot(&app.db, "calendar_event", &event.id.0).await;
    let path = format!("/api/events/{}", event.id);

    for response in [
        other.get(&path).await,
        other.get(&format!("{path}/ics")).await,
        other
            .put(
                &path,
                json!({"encryptedContent": fake_envelope(), "calendarId": other_calendar}),
            )
            .await,
        other.delete(&path).await,
        other
            .post(
                &format!("{path}/seal-encryption"),
                json!({"encryptedContent": fake_envelope()}),
            )
            .await,
        other
            .post(&format!("{path}/rsvp"), json!({"status": "accepted"}))
            .await,
    ] {
        let body = ok(response.expect_error(400, "Validation Error", NOT_FOUND));
        assert!(body.get("details").is_none(), "{body}");
    }
    for action in ["delete", "duplicate", "move"] {
        let error = ok(other
            .post(
                "/api/events/bulk",
                to_json(&BulkEventRequest {
                    action: action.into(),
                    event_ids: vec![event.id.clone()],
                    target_calendar_id: Some(other_calendar.clone().into()),
                }),
            )
            .await
            .expect_error(
                400,
                "Validation Error",
                "Some events not found or access denied",
            ));
        assert_eq!(error["details"], json!({"field": "eventIds"}));
    }
    assert_eq!(
        row_snapshot(&app.db, "calendar_event", &event.id.0).await,
        before
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM event_notification WHERE event_id = $1",
            &event.id.0
        )
        .await,
        1
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM calendar_event WHERE user_id = $1",
            &other.id
        )
        .await,
        0
    );
}

#[tokio::test]
async fn recurring_instance_ids_resolve_to_their_series() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let mut request = encrypted_event(&calendar, FUTURE_START, FUTURE_END);
    request.recurrence = Some(r#"{"frequency":"weekly","interval":1,"count":3}"#.into());
    let series = create_event(&mut owner, &request).await;
    let instance = format!("{}_2099-03-09T09:00:00.000Z", series.id);

    let fetched: Event = ok(owner
        .get(&format!("/api/events/{instance}"))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        fetched.id, series.id,
        "a read of an instance returns the series"
    );

    let updated: Event = ok(owner
        .put(&format!("/api/events/{instance}"), json!({"color": "teal"}))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        (updated.id.clone(), updated.color.as_deref()),
        (series.id.clone(), Some("teal"))
    );

    let suffixed: Event = ok(owner
        .get(&format!("/api/events/{}_garbage", series.id))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        suffixed.id, series.id,
        "any suffix after an underscore falls back to the prefix"
    );

    let deleted: EventDeleted = ok(owner
        .delete(&format!("/api/events/{instance}"))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        deleted,
        EventDeleted {
            success: true,
            message: "Event deleted successfully".into(),
            deleted_event_id: series.id.clone(),
        },
        "deleting an instance id deletes the whole series"
    );
    assert_eq!(
        row_snapshot(&app.db, "calendar_event", &series.id.0).await,
        None
    );

    ok(owner
        .get(&format!("/api/events/{}_garbage", series.id))
        .await
        .expect_error(400, "Validation Error", NOT_FOUND));
}

#[tokio::test]
async fn protected_fields_need_new_ciphertext_on_update() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let event = create_event(
        &mut owner,
        &encrypted_event(&calendar, FUTURE_START, FUTURE_END),
    )
    .await;
    let before = row_snapshot(&app.db, "calendar_event", &event.id.0).await;
    for body in [
        json!({"title": "Plain"}),
        json!({"description": ""}),
        json!({"location": "Room"}),
    ] {
        let error = ok(owner
            .put(&format!("/api/events/{}", event.id), body.clone())
            .await
            .expect_error(
                400,
                "Validation Error",
                "Encrypted content payload is required when updating protected event fields.",
            ));
        assert_eq!(
            error["details"],
            json!({"field": "encryptedContent"}),
            "{body}"
        );
    }
    let error = ok(owner
        .put(
            &format!("/api/events/{}", event.id),
            json!({"encryptedContent": ""}),
        )
        .await
        .expect_error(
            400,
            "Validation Error",
            "Event encryption requires an active encryption session.",
        ));
    assert_eq!(error["details"], json!({"field": "encryptedContent"}));
    let error = ok(owner
        .put(&format!("/api/events/{}", event.id), json!({"title": null}))
        .await
        .expect_error(400, "Validation Error", "Expected string, received null"));
    assert_eq!(issue_paths(&error), ["title"]);
    assert_eq!(
        row_snapshot(&app.db, "calendar_event", &event.id.0).await,
        before
    );
}

#[tokio::test]
async fn an_update_stores_new_ciphertext_and_schedule() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let family = calendar_id(&mut owner, "Family").await;
    let event = create_event(
        &mut owner,
        &encrypted_event(&calendar, FUTURE_START, FUTURE_END),
    )
    .await;
    let ciphertext = fake_envelope();
    let update = UpdateEventRequest {
        encrypted_content: Some(ciphertext.clone()),
        blind_index_tokens: Some(vec!["fresh-token".into()]),
        encryption_key_version: Some(3),
        title: Some(String::new()),
        start: Some("2099-03-03T09:00:00.000Z".into()),
        end: Some("2099-03-03T11:30:00.000Z".into()),
        all_day: Some(true),
        timezone: Some("Europe/Berlin".into()),
        calendar_id: Some(family.clone().into()),
        recurrence: Some(Some(r#"{"frequency":"daily","interval":2}"#.into())),
        ..UpdateEventRequest::default()
    };
    let updated: Event = ok(owner
        .put(&format!("/api/events/{}", event.id), to_json(&update))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        updated.encrypted_content.as_deref(),
        Some(ciphertext.as_str())
    );
    assert_eq!(
        updated.blind_index_tokens.as_deref(),
        Some(r#"["fresh-token"]"#)
    );
    assert_eq!(updated.encryption_key_version, 3);
    assert_eq!(
        (updated.start.0.as_str(), updated.end.0.as_str()),
        ("2099-03-03T09:00:00.000Z", "2099-03-03T11:30:00.000Z")
    );
    assert!(updated.all_day);
    assert_eq!(updated.timezone, "Europe/Berlin");
    assert_eq!(
        (
            updated.calendar_id.0.as_str(),
            updated.calendar.name.as_str()
        ),
        (family.as_str(), "Family")
    );
    assert_eq!(
        updated.recurrence.as_deref(),
        Some(r#"{"frequency":"daily","interval":2}"#)
    );
    assert!(updated.updated_at > event.updated_at);
    assert_eq!(updated.created_at, event.created_at);
    assert_eq!(
        updated.participants.as_ref().map(Vec::len),
        Some(1),
        "the organizer stays"
    );
    assert_eq!(
        stored_content(&app.db, &event.id.0).await,
        StoredContent {
            title: String::new(),
            description: None,
            location: None,
            encrypted_content: Some(ciphertext),
            blind_index_tokens: Some(r#"["fresh-token"]"#.into()),
            encryption_state: "encrypted".into(),
            encryption_key_version: 3,
        }
    );

    let cleared: Event = ok(owner
        .put(
            &format!("/api/events/{}", event.id),
            json!({"recurrence": null, "categoryId": ""}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!((cleared.recurrence, cleared.category_id), (None, None));
}

#[tokio::test]
async fn update_rules_mirror_create() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut other = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let foreign = calendar_id(&mut other, "Work").await;
    let feed = insert_calendar(&app, &owner.id, "subscribed", false).await;
    let event = create_event(
        &mut owner,
        &encrypted_event(&calendar, FUTURE_START, FUTURE_END),
    )
    .await;
    let before = row_snapshot(&app.db, "calendar_event", &event.id.0).await;
    let cases = [
        (
            json!({"start": "2099-03-02T11:00:00.000Z"}),
            "End time must be after start time",
            "end",
        ),
        (
            json!({"start": "nope"}),
            "Invalid start date format. Use ISO 8601 format",
            "start",
        ),
        (
            json!({"end": "nope"}),
            "Invalid end date format. Use ISO 8601 format",
            "end",
        ),
        (
            json!({"calendarId": foreign}),
            "Invalid calendar or calendar does not belong to user",
            "calendarId",
        ),
        (
            json!({"calendarId": feed}),
            "Cannot move events to a read-only calendar.",
            "calendarId",
        ),
        (
            json!({"categoryId": "nope"}),
            "Invalid category or category does not belong to user",
            "categoryId",
        ),
        (
            json!({"recurrence": "bad"}),
            "Invalid recurrence rule format",
            "recurrence",
        ),
    ];
    for (body, message, field) in cases {
        let error = ok(owner
            .put(&format!("/api/events/{}", event.id), body.clone())
            .await
            .expect_error(400, "Validation Error", message));
        assert_eq!(error["details"], json!({"field": field}), "{body}");
    }
    let error = ok(owner
        .put(
            &format!("/api/events/{}", event.id),
            json!({"reminder": 43201}),
        )
        .await
        .expect_error(
            400,
            "Validation Error",
            "Number must be less than or equal to 43200",
        ));
    assert_eq!(issue_paths(&error), ["reminder"]);
    assert_eq!(
        row_snapshot(&app.db, "calendar_event", &event.id.0).await,
        before
    );
}

#[tokio::test]
async fn updates_reschedule_reminders_and_keep_the_title_ciphertext() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let mut request = encrypted_event(&calendar, FUTURE_START, FUTURE_END);
    request.reminder = Some(Some(15));
    request.timezone = Some("UTC".into());
    let event = create_event(&mut owner, &request).await;
    let title = format!("v1.{}.{}", "A".repeat(16), "B".repeat(40));
    ok(owner
        .put(
            &format!("/api/notifications/event/{}", event.id),
            json!({
                "notifications": [
                    {"notificationType": "email", "minutesBefore": 15, "isEnabled": true},
                    {"notificationType": "browser", "minutesBefore": 5, "isEnabled": true},
                ],
                "encryptedDisplayTitle": title,
            }),
        )
        .await
        .expect_status(200));

    ok(owner
        .put(
            &format!("/api/events/{}", event.id),
            json!({"start": "2099-03-05T09:00:00.000Z", "end": "2099-03-05T10:00:00.000Z"}),
        )
        .await
        .expect_status(200));
    let rows: Vec<(String, i32, String, Option<String>)> = sqlx::query_as(
        "SELECT notification_type, minutes_before, notification_date_local, encrypted_display_title \
         FROM event_notification WHERE event_id = $1 ORDER BY notification_type",
    )
    .bind(&event.id.0)
    .fetch_all(&app.db)
    .await
    .expect("notifications");
    assert_eq!(
        rows,
        [
            (
                "browser".to_owned(),
                5,
                "2099-03-05T08:55:00".to_owned(),
                Some(title.clone())
            ),
            (
                "email".to_owned(),
                15,
                "2099-03-05T08:45:00".to_owned(),
                Some(title.clone())
            ),
        ],
        "a time change moves every schedule"
    );

    let updated: Event = ok(owner
        .put(
            &format!("/api/events/{}", event.id),
            json!({"reminder": 60}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(updated.reminder, Some(60));
    let rows: Vec<(String, i32, Option<String>)> = sqlx::query_as(
        "SELECT notification_type, minutes_before, encrypted_display_title FROM event_notification WHERE event_id = $1",
    )
    .bind(&event.id.0)
    .fetch_all(&app.db)
    .await
    .expect("notifications");
    assert_eq!(
        rows,
        [("email".to_owned(), 60, Some(title))],
        "a reminder change replaces the schedules with one email reminder"
    );

    let cleared: Event = ok(owner
        .put(
            &format!("/api/events/{}", event.id),
            json!({"reminder": null}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(cleared.reminder, None);
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM event_notification WHERE event_id = $1",
            &event.id.0
        )
        .await,
        0
    );
}

#[tokio::test]
async fn deleting_an_event_removes_its_reminders_and_logs() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let mut request = encrypted_event(&calendar, FUTURE_START, FUTURE_END);
    request.reminder = Some(Some(30));
    let event = create_event(&mut owner, &request).await;
    sqlx::query(
        "INSERT INTO notification_log (id, event_id, user_id, notification_type, minutes_before, sent_at, created_at) \
         VALUES ($1, $2, $3, 'email', 30, now(), now())",
    )
    .bind(format!("suitelog{}", hex(8)))
    .bind(&event.id.0)
    .bind(&owner.id)
    .execute(&app.db)
    .await
    .expect("insert log");

    let deleted: EventDeleted = ok(owner
        .delete(&format!("/api/events/{}", event.id))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        deleted,
        EventDeleted {
            success: true,
            message: "Event deleted successfully".into(),
            deleted_event_id: event.id.clone(),
        }
    );
    for table in [
        "event_notification",
        "notification_log",
        "event_participant",
    ] {
        assert_eq!(
            count(
                &app.db,
                &format!("SELECT count(*) FROM {table} WHERE event_id = $1"),
                &event.id.0
            )
            .await,
            0,
            "{table}"
        );
    }
    ok(owner
        .delete(&format!("/api/events/{}", event.id))
        .await
        .expect_error(400, "Validation Error", NOT_FOUND));
    ok(owner
        .get(&format!("/api/events/{}", event.id))
        .await
        .expect_error(400, "Validation Error", NOT_FOUND));
}

#[tokio::test]
async fn synced_events_are_read_only() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let feed = insert_calendar(&app, &owner.id, "subscribed", true).await;
    let event =
        insert_plaintext_event(&app, &owner.id, &feed, "Holiday", FUTURE_START, FUTURE_END).await;
    sqlx::query("UPDATE calendar_event SET is_synced = true WHERE id = $1")
        .bind(&event)
        .execute(&app.db)
        .await
        .expect("mark synced");
    let before = row_snapshot(&app.db, "calendar_event", &event).await;
    ok(owner
        .put(&format!("/api/events/{event}"), json!({"color": "red"}))
        .await
        .expect_error(
            400,
            "Validation Error",
            "Cannot edit synced events. Synced events are read-only.",
        ));
    ok(owner
        .delete(&format!("/api/events/{event}"))
        .await
        .expect_error(
            400,
            "Validation Error",
            "Cannot delete synced events. Synced events are read-only.",
        ));
    ok(owner
        .post(
            &format!("/api/events/{event}/seal-encryption"),
            json!({"encryptedContent": fake_envelope()}),
        )
        .await
        .expect_error(
            400,
            "Validation Error",
            "Cannot seal encryption for synced subscription events.",
        ));
    ok(owner
        .post(
            "/api/events/bulk",
            json!({"action": "delete", "eventIds": [event]}),
        )
        .await
        .expect_error(
            400,
            "Validation Error",
            match app.backend {
                // TypeScript names the events by title, which is user content in the message.
                Backend::TypeScript => {
                    "Cannot modify synced events. The following synced events are read-only: Holiday"
                }
                Backend::Rust => {
                    "Cannot modify synced events. Synced events are read-only (1 selected)."
                }
            },
        ));
    assert_eq!(
        row_snapshot(&app.db, "calendar_event", &event).await,
        before
    );
}

#[tokio::test]
async fn encrypted_events_cannot_be_exported_as_ics() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let event = create_event(
        &mut owner,
        &encrypted_event(&calendar, FUTURE_START, FUTURE_END),
    )
    .await;
    let body = ok(owner
        .get(&format!("/api/events/{}/ics", event.id))
        .await
        .expect_error(
            400,
            "Validation Error",
            "Encrypted event details cannot be exported as ICS by the server.",
        ));
    assert!(body["requestId"].is_string());
}

#[tokio::test]
async fn plaintext_events_export_as_an_ics_attachment() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let title = "Team, sync; planning with a title long enough to need folding at 75 octets";
    let event =
        insert_plaintext_event(&app, &owner.id, &calendar, title, FUTURE_START, FUTURE_END).await;
    sqlx::query(
        "UPDATE calendar_event SET description = E'Line1\\nLine2', location = 'Room 4', \
         recurrence = '{\"frequency\":\"weekly\",\"interval\":2,\"count\":3,\"byWeekDay\":[1,3]}' WHERE id = $1",
    )
    .bind(&event)
    .execute(&app.db)
    .await
    .expect("details");

    let response = owner.get(&format!("/api/events/{event}/ics")).await;
    let response = ok(response.expect_status(200));
    let header = |name: &str| {
        response
            .headers
            .get(name)
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default()
            .to_owned()
    };
    assert_eq!(header("content-type"), "text/calendar; charset=utf-8");
    assert_eq!(
        header("content-disposition"),
        "attachment; filename=\"team-sync-planning-with-a-title-long-enough-to-need-folding-at-75-octets.ics\""
    );
    assert_eq!(header("cache-control"), "no-store");
    let ics = response.text();
    assert!(ics.ends_with("END:VCALENDAR\r\n"));
    assert!(
        ics.split("\r\n").all(|line| line.len() <= 75),
        "lines fold at 75 octets: {ics}"
    );
    assert!(!ics.replace("\r\n", "").contains('\n'), "CRLF only");
    let unfolded = unfold(&ics);
    for line in [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Solace Calendar//Calendar Export//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:Work",
        "X-WR-TIMEZONE:Europe/Amsterdam",
        &format!("UID:{event}@solace-calendar.local"),
        "SUMMARY:Team\\, sync\\; planning with a title long enough to need folding at 75 octets",
        "DTSTART:20990302T090000Z",
        "DTEND:20990302T100000Z",
        "DESCRIPTION:Line1\\nLine2",
        "LOCATION:Room 4",
        "RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3;BYDAY=MO,WE",
    ] {
        assert!(
            unfolded.split("\r\n").any(|l| l == line),
            "missing {line}: {unfolded}"
        );
    }

    let response = ok(owner
        .get(&format!("/api/events/{event}_2099-03-04T09:00:00.000Z/ics"))
        .await
        .expect_status(200));
    let disposition = response
        .headers
        .get("content-disposition")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_owned();
    assert!(disposition.ends_with("-2099-03-04.ics\""), "{disposition}");
    let unfolded = unfold(&response.text());
    assert!(unfolded.contains(&format!(
        "UID:{event}-2099-03-04T09:00:00.000Z@solace-calendar.local\r\n"
    )));
    assert!(unfolded.contains("DTSTART:20990304T090000Z\r\nDTEND:20990304T100000Z\r\n"));
    assert!(!unfolded.contains("RRULE"), "an occurrence has no rule");
}

#[tokio::test]
async fn a_series_exports_with_its_exceptions() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let insert = |title: &'static str, start: &'static str, end: &'static str| {
        insert_plaintext_event(&app, &owner.id, &calendar, title, start, end)
    };
    let series = insert(
        "Weekly",
        "2099-03-02T09:00:00.000Z",
        "2099-03-02T10:00:00.000Z",
    )
    .await;
    let moved = insert(
        "Moved",
        "2099-03-16T14:00:00.000Z",
        "2099-03-16T15:00:00.000Z",
    )
    .await;
    let sealed = insert("", "2099-03-23T15:00:00.000Z", "2099-03-23T16:00:00.000Z").await;
    let sql = |statement: &'static str, id: String| {
        let db = app.db.clone();
        let series = series.clone();
        async move {
            sqlx::query(statement)
                .bind(id)
                .bind(series)
                .execute(&db)
                .await
                .expect(statement);
        }
    };
    sql(
        "UPDATE calendar_event SET recurrence = '{\"frequency\":\"weekly\",\"interval\":1,\"count\":4}' WHERE id = $1 OR id = $2",
        series.clone(),
    )
    .await;
    sql(
        "UPDATE calendar_event SET parent_event_id = $2 WHERE id = $1",
        moved.clone(),
    )
    .await;
    sql(
        "UPDATE calendar_event SET parent_event_id = $2, encryption_state = 'encrypted', encrypted_content = 'v1.sealed' WHERE id = $1",
        sealed.clone(),
    )
    .await;
    for (date, kind, modified) in [
        ("2099-03-09 09:00:00", "deleted", None),
        ("2099-03-16 09:00:00", "modified", Some(&moved)),
        ("2099-03-23 09:00:00", "modified", Some(&sealed)),
    ] {
        sqlx::query(
            "INSERT INTO recurrence_exception (id, parent_event_id, exception_date, modified_event_id, type, created_at, updated_at) \
             VALUES ($1, $2, $3::timestamp, $4, $5, now(), now())",
        )
        .bind(format!("suiteexc{}", hex(8)))
        .bind(&series)
        .bind(date)
        .bind(modified)
        .bind(kind)
        .execute(&app.db)
        .await
        .expect("insert exception");
    }

    let ics = unfold(
        &ok(owner
            .get(&format!("/api/events/{series}/ics"))
            .await
            .expect_status(200))
        .text(),
    );
    let uid = format!("UID:{series}@solace-calendar.local\r\n");
    let markers = [
        "RRULE:FREQ=WEEKLY;COUNT=4\r\nEXDATE:20990309T090000Z,20990323T090000Z\r\n",
        "SUMMARY:Moved\r\nDTSTART:20990316T140000Z\r\nDTEND:20990316T150000Z\r\nRECURRENCE-ID:20990316T090000Z\r\n",
    ];
    match app.backend {
        // TypeScript exports the bare rule.
        Backend::TypeScript => {
            assert_eq!(ics.matches(&uid).count(), 1, "{ics}");
            assert!(markers.iter().all(|m| !ics.contains(m)), "{ics}");
        }
        Backend::Rust => {
            assert_eq!(
                ics.matches(&uid).count(),
                2,
                "the override shares the UID: {ics}"
            );
            for marker in markers {
                assert!(ics.contains(marker), "{marker} in {ics}");
            }
            assert_eq!(
                ics.matches("BEGIN:VEVENT").count(),
                2,
                "the sealed row stays out: {ics}"
            );
        }
    }
}

#[tokio::test]
async fn all_day_events_export_local_dates_with_an_exclusive_end() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let event = insert_plaintext_event(
        &app,
        &owner.id,
        &calendar,
        "",
        "2099-03-01T23:00:00.000Z",
        "2099-03-02T22:59:59.000Z",
    )
    .await;
    sqlx::query("UPDATE calendar_event SET all_day = true, external_id = 'imported-uid@example.com' WHERE id = $1")
        .bind(&event)
        .execute(&app.db)
        .await
        .expect("all day");
    let response = ok(owner
        .get(&format!("/api/events/{event}/ics"))
        .await
        .expect_status(200));
    assert_eq!(
        response
            .headers
            .get("content-disposition")
            .and_then(|v| v.to_str().ok()),
        Some("attachment; filename=\"calendar.ics\""),
        "an empty title falls back to calendar.ics"
    );
    let ics = unfold(&response.text());
    assert!(ics.contains("UID:imported-uid@example.com\r\n"), "{ics}");
    assert!(ics.contains("SUMMARY:Untitled Event\r\n"), "{ics}");
    assert!(
        ics.contains("DTSTART;VALUE=DATE:20990302\r\nDTEND;VALUE=DATE:20990303\r\n"),
        "{ics}"
    );
}

#[tokio::test]
async fn bulk_move_checks_the_target_calendar() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut other = app.user().await;
    let work = calendar_id(&mut owner, "Work").await;
    let family = calendar_id(&mut owner, "Family").await;
    let foreign = calendar_id(&mut other, "Work").await;
    let first = create_event(
        &mut owner,
        &encrypted_event(&work, FUTURE_START, FUTURE_END),
    )
    .await;
    let second = create_event(
        &mut owner,
        &encrypted_event(&work, FUTURE_START, FUTURE_END),
    )
    .await;
    let ids = vec![first.id.clone(), second.id.clone()];

    let error = ok(owner
        .post(
            "/api/events/bulk",
            json!({"action": "move", "eventIds": ids}),
        )
        .await
        .expect_error(
            400,
            "Validation Error",
            "Target calendar ID is required for move operation",
        ));
    assert_eq!(error["details"], json!({"field": "targetCalendarId"}));
    let error = ok(owner
        .post(
            "/api/events/bulk",
            json!({"action": "move", "eventIds": ids, "targetCalendarId": foreign}),
        )
        .await
        .expect_error(
            400,
            "Validation Error",
            "Target calendar not found or access denied",
        ));
    assert_eq!(error["details"], json!({"field": "targetCalendarId"}));
    sqlx::query("UPDATE calendar SET ics_share_enabled = true WHERE id = $1")
        .bind(&family)
        .execute(&app.db)
        .await
        .expect("share family");
    let error = ok(owner
        .post(
            "/api/events/bulk",
            json!({"action": "move", "eventIds": ids, "targetCalendarId": family}),
        )
        .await
        .expect_error(
            400,
            "Validation Error",
            "Events with encrypted details cannot be moved into a calendar with ICS sharing enabled.",
        ));
    assert_eq!(error["details"], json!({"field": "targetCalendarId"}));
    sqlx::query("UPDATE calendar SET ics_share_enabled = false WHERE id = $1")
        .bind(&family)
        .execute(&app.db)
        .await
        .expect("unshare family");

    let moved: BulkEventResult = ok(owner
        .post(
            "/api/events/bulk",
            to_json(&BulkEventRequest {
                action: "move".into(),
                event_ids: ids.clone(),
                target_calendar_id: Some(family.clone().into()),
            }),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        moved,
        BulkEventResult {
            success: true,
            message: match app.backend {
                // TypeScript names the target calendar, which is user content.
                Backend::TypeScript => "Successfully moved 2 events to Family",
                Backend::Rust => "Successfully moved 2 events",
            }
            .into(),
            events_processed: 2,
            action: "move".into(),
            created_events: None,
        }
    );
    assert_eq!(
        count(
            &app.db,
            &format!(
                "SELECT count(*) FROM calendar_event WHERE calendar_id = $1 AND id IN ('{}', '{}')",
                first.id, second.id
            ),
            &family
        )
        .await,
        2
    );
}

#[tokio::test]
async fn bulk_validation_uses_the_zod_messages() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let cases = [
        (
            json!({"action": "nuke", "eventIds": ["x"]}),
            "Invalid enum value. Expected 'move' | 'delete' | 'duplicate', received 'nuke'",
            "action",
        ),
        (
            json!({"action": "delete", "eventIds": []}),
            "Array must contain at least 1 element(s)",
            "eventIds",
        ),
        (
            json!({"action": "delete", "eventIds": "x"}),
            "Expected array, received string",
            "eventIds",
        ),
        (json!({"action": "delete"}), "Required", "eventIds"),
    ];
    for (body, message, path) in cases {
        let error = ok(owner
            .post("/api/events/bulk", body.clone())
            .await
            .expect_error(400, "Validation Error", message));
        assert_eq!(issue_paths(&error), [path], "{body}");
    }
    let error = ok(owner
        .post(
            "/api/events/bulk",
            json!({"action": "delete", "eventIds": ["missing"]}),
        )
        .await
        .expect_error(
            400,
            "Validation Error",
            "Some events not found or access denied",
        ));
    assert_eq!(error["details"], json!({"field": "eventIds"}));
}

#[tokio::test]
async fn bulk_duplicate_refuses_another_users_calendar() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut other = app.user().await;
    let work = calendar_id(&mut owner, "Work").await;
    let foreign = calendar_id(&mut other, "Work").await;
    let event = create_event(
        &mut owner,
        &encrypted_event(&work, FUTURE_START, FUTURE_END),
    )
    .await;
    let response = owner
        .post(
            "/api/events/bulk",
            json!({"action": "duplicate", "eventIds": [event.id], "targetCalendarId": foreign}),
        )
        .await;
    let copies = match app.backend {
        // TypeScript copies into any calendar id and returns that calendar, share token included.
        Backend::TypeScript => {
            ok(response.expect_status(200));
            1
        }
        Backend::Rust => {
            let error = ok(response.expect_error(
                400,
                "Validation Error",
                "Target calendar not found or access denied",
            ));
            assert_eq!(error["details"], json!({"field": "targetCalendarId"}));
            0
        }
    };
    let stored = count(
        &app.db,
        "SELECT count(*) FROM calendar_event WHERE calendar_id = $1",
        &foreign,
    )
    .await;
    assert_eq!(stored, copies);
}

#[tokio::test]
async fn bulk_duplicate_copies_ciphertext_attendees_and_reminders() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let family = calendar_id(&mut owner, "Family").await;
    let mut request = encrypted_event(&calendar, FUTURE_START, FUTURE_END);
    request.reminder = Some(Some(20));
    request.recurrence = Some(r#"{"frequency":"daily","interval":1,"count":2}"#.into());
    request.participants = Some(vec![solace_api_types::events::ParticipantInput {
        email: "guest@example.com".into(),
        display_name: Some("Guest".into()),
        role: None,
        status: Some("accepted".into()),
    }]);
    let source = create_event(&mut owner, &request).await;
    let plain = insert_plaintext_event(
        &app,
        &owner.id,
        &calendar,
        "Lunch",
        FUTURE_START,
        FUTURE_END,
    )
    .await;

    let result: BulkEventResult = ok(owner
        .post(
            "/api/events/bulk",
            json!({"action": "duplicate", "eventIds": [source.id, plain], "targetCalendarId": family}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        (
            result.success,
            result.message.as_str(),
            result.events_processed,
            result.action.as_str()
        ),
        (true, "Successfully duplicated 2 events", 2, "duplicate")
    );
    let created = result.created_events.expect("created events");
    let copy = created
        .iter()
        .find(|event| event.encryption_state == "encrypted")
        .expect("encrypted copy");
    assert_ne!(copy.id, source.id);
    assert_eq!(copy.title, "", "encrypted titles are not suffixed");
    assert_eq!(copy.encrypted_content, source.encrypted_content);
    assert_eq!(copy.blind_index_tokens, source.blind_index_tokens);
    assert_eq!(copy.calendar_id.0, family);
    assert_eq!((copy.reminder, &copy.recurrence), (Some(20), &None));
    assert_eq!(copy.external_id, None);
    let mut people: Vec<(String, String, String)> = copy
        .participants
        .clone()
        .expect("participants")
        .into_iter()
        .map(|p| (p.email, p.role, p.status))
        .collect();
    people.sort();
    let mut expected = vec![
        (
            "guest@example.com".to_owned(),
            "attendee".to_owned(),
            "accepted".to_owned(),
        ),
        (
            owner.email.clone(),
            "organizer".to_owned(),
            "accepted".to_owned(),
        ),
    ];
    expected.sort();
    assert_eq!(people, expected);
    let reminders: Vec<(i32, Option<String>)> = sqlx::query_as(
        "SELECT minutes_before, encrypted_display_title FROM event_notification WHERE event_id = $1",
    )
    .bind(&copy.id.0)
    .fetch_all(&app.db)
    .await
    .expect("reminders");
    assert_eq!(
        reminders,
        [(20, None)],
        "the copy starts with a generic reminder"
    );

    let plain_copy = created
        .iter()
        .find(|event| event.encryption_state == "plaintext")
        .expect("plaintext copy");
    assert_eq!(plain_copy.title, "Lunch (Copy)");
}

#[tokio::test]
async fn bulk_delete_removes_events_and_their_reminders() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let mut request = encrypted_event(&calendar, FUTURE_START, FUTURE_END);
    request.reminder = Some(Some(5));
    let first = create_event(&mut owner, &request).await;
    let second = create_event(&mut owner, &request).await;
    let kept = create_event(&mut owner, &request).await;
    let result: BulkEventResult = ok(owner
        .post(
            "/api/events/bulk",
            json!({"action": "delete", "eventIds": [first.id, second.id]}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        result,
        BulkEventResult {
            success: true,
            message: "Successfully deleted 2 events".into(),
            events_processed: 2,
            action: "delete".into(),
            created_events: None,
        }
    );
    for (event, expected) in [(&first, 0), (&second, 0), (&kept, 1)] {
        assert_eq!(
            count(
                &app.db,
                "SELECT count(*) FROM calendar_event WHERE id = $1",
                &event.id.0
            )
            .await,
            expected
        );
        assert_eq!(
            count(
                &app.db,
                "SELECT count(*) FROM event_notification WHERE event_id = $1",
                &event.id.0
            )
            .await,
            expected
        );
    }
}

#[tokio::test]
async fn sealing_replaces_plaintext_with_ciphertext() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let event = insert_plaintext_event(
        &app,
        &owner.id,
        &calendar,
        "Imported",
        FUTURE_START,
        FUTURE_END,
    )
    .await;
    sqlx::query("UPDATE calendar_event SET description = 'Body', location = 'Room' WHERE id = $1")
        .bind(&event)
        .execute(&app.db)
        .await
        .expect("details");

    let error = ok(owner
        .post(
            &format!("/api/events/{event}/seal-encryption"),
            json!({"encryptedContent": ""}),
        )
        .await
        .expect_error(
            400,
            "Validation Error",
            "String must contain at least 1 character(s)",
        ));
    assert_eq!(issue_paths(&error), ["encryptedContent"]);
    let error = ok(owner
        .post(
            &format!("/api/events/{event}/seal-encryption"),
            json!({"encryptedContent": "   "}),
        )
        .await
        .expect_error(
            400,
            "Validation Error",
            "Encrypted content payload is required.",
        ));
    assert_eq!(error["details"], json!({"field": "encryptedContent"}));
    let error = ok(owner
        .post(
            &format!("/api/events/{event}/seal-encryption"),
            json!({"encryptedContent": "x", "blindIndexTokens": [""]}),
        )
        .await
        .expect_error(
            400,
            "Validation Error",
            "String must contain at least 1 character(s)",
        ));
    assert_eq!(issue_paths(&error), ["blindIndexTokens.0"]);
    assert_eq!(stored_content(&app.db, &event).await.title, "Imported");

    let ciphertext = fake_envelope();
    let sealed: Event = ok(owner
        .post(
            &format!("/api/events/{event}/seal-encryption"),
            to_json(&SealEncryptionRequest {
                encrypted_content: ciphertext.clone(),
                blind_index_tokens: Some(vec!["seal-token".into()]),
                encryption_key_version: None,
            }),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        (sealed.title.as_str(), &sealed.description, &sealed.location),
        ("", &None, &None)
    );
    let stored = StoredContent {
        title: String::new(),
        description: None,
        location: None,
        encrypted_content: Some(ciphertext),
        blind_index_tokens: Some(r#"["seal-token"]"#.into()),
        encryption_state: "encrypted".into(),
        encryption_key_version: 1,
    };
    assert_eq!(stored_content(&app.db, &event).await, stored);

    let again: Event = ok(owner
        .post(
            &format!("/api/events/{event}/seal-encryption"),
            json!({"encryptedContent": fake_envelope(), "encryptionKeyVersion": 5}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        again.encrypted_content, stored.encrypted_content,
        "sealing a sealed event changes nothing"
    );
    assert_eq!(stored_content(&app.db, &event).await, stored);
}
