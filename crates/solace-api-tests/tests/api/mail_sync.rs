//! `GET /api/mail/sync` and invitation auto-filing from mail; background receipt polling may consume a change first, so tests then check the stored state.

use std::time::Duration;

use serde_json::{Value, json};
use solace_api_tests::seed::{fake_envelope, fake_token};
use solace_api_types::mail::{MailCalendarImportSummary, MailSyncResult};

use crate::helpers::{TestApp, count, expect_unauthorized, expect_unknown_field, hex, ok};
use crate::mail_support::{Mailbox, mailbox, method, row_json, sync};

async fn stored_states(app: &TestApp, account_id: &str) -> (String, String, Option<String>) {
    sqlx::query_as(
        "SELECT email_state, mailbox_state, thread_state FROM mail_jmap_sync_state WHERE stalwart_account_id = $1",
    )
    .bind(account_id)
    .fetch_one(&app.db)
    .await
    .expect("sync state")
}

/// Syncs once; `None` when background receipt polling consumed the change first, which it must have stored.
async fn sync_seeing(
    app: &TestApp,
    owner: &mut Mailbox,
    email_state_before: &str,
    seen: impl Fn(&MailSyncResult) -> bool,
) -> Option<MailSyncResult> {
    let account = owner.account_id().to_owned();
    let result = sync(&mut owner.user, &account).await;
    if seen(&result) {
        return Some(result);
    }
    let (email_state, _, _) = stored_states(app, &account).await;
    assert_ne!(
        email_state, email_state_before,
        "the change was neither returned nor stored: {result:?}"
    );
    None
}

fn invitation_ics(method: &str, uid: &str, summary: &str, sequence: u32, attendee: &str) -> String {
    [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Example//Suite//EN",
        &format!("METHOD:{method}"),
        "BEGIN:VEVENT",
        &format!("UID:{uid}"),
        &format!("SEQUENCE:{sequence}"),
        "DTSTAMP:20261014T120000Z",
        "DTSTART:20261120T090000Z",
        "DTEND:20261120T100000Z",
        &format!("SUMMARY:{summary}"),
        "LOCATION:Room 4",
        "ORGANIZER;CN=Olivia Example:mailto:olivia@example.com",
        &format!("ATTENDEE;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:{attendee}"),
        "END:VEVENT",
        "END:VCALENDAR",
        "",
    ]
    .join("\r\n")
}

/// An invitation as mail clients send it: a text part and a `text/calendar` attachment.
fn invitation_email(to: &str, ics: &str) -> Value {
    json!({
        "from": [{"email": "olivia@example.com", "name": "Olivia Example"}],
        "to": [{"email": to}],
        "subject": "Invitation: Suite planning",
        "bodyStructure": {"type": "multipart/mixed", "subParts": [
            {"partId": "t", "type": "text/plain"},
            {"partId": "c", "type": "text/calendar", "name": "invite.ics"},
        ]},
        "bodyValues": {"t": {"value": "You are invited."}, "c": {"value": ics}},
    })
}

/// The imported event with its calendar and participants, once a sync (ours or the background one) has filed it.
async fn wait_for_event(
    app: &TestApp,
    owner: &mut Mailbox,
    uid: &str,
    ready: impl Fn(&Value) -> bool,
) -> Value {
    let account = owner.account_id().to_owned();
    for _ in 0..40 {
        sync(&mut owner.user, &account).await;
        let rows: Vec<String> = sqlx::query_scalar(event_sql())
            .bind(uid)
            .fetch_all(&app.db)
            .await
            .expect("event query");
        if let Some(row) = rows.first() {
            let event: Value = serde_json::from_str(row).expect("event JSON");
            if ready(&event) {
                assert_eq!(rows.len(), 1, "one event per invitation UID: {rows:?}");
                return event;
            }
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    panic!("invitation {uid} was not filed as expected");
}

fn event_sql() -> &'static str {
    "SELECT jsonb_build_object(\
        'title', e.title, 'description', e.description, 'location', e.location, \
        'start', e.start, 'end', e.\"end\", 'allDay', e.all_day, 'timezone', e.timezone, \
        'encryptionState', e.encryption_state, 'encryptedContent', e.encrypted_content, 'blindIndexTokens', e.blind_index_tokens, \
        'isCancelled', e.is_cancelled, 'isSynced', e.is_synced, 'stalwartEventId', e.stalwart_event_id, 'userId', e.user_id, \
        'calendar', jsonb_build_object('name', c.name, 'isVisible', c.is_visible, 'isDefault', c.is_default, 'kind', c.kind, 'color', c.color, 'userId', c.user_id), \
        'participants', (SELECT jsonb_agg(jsonb_build_object('email', p.email, 'displayName', p.display_name, 'role', p.role, 'status', p.status, 'userId', p.user_id) ORDER BY p.role DESC, p.email) \
                         FROM event_participant p WHERE p.event_id = e.id))::text \
     FROM calendar_event e JOIN calendar c ON c.id = e.calendar_id WHERE e.external_id = $1"
}

#[tokio::test]
async fn anonymous_callers_are_refused() {
    let app = TestApp::spawn().await;
    expect_unauthorized(&ok(app.anonymous().get("/api/mail/sync?accountId=a").await));
}

#[tokio::test]
async fn the_query_takes_exactly_an_account_id() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let long = "a".repeat(129);
    for (query, message, path) in [
        ("", "Required", "accountId"),
        (
            "?accountId=",
            "String must contain at least 1 character(s)",
            "accountId",
        ),
        (
            &*format!("?accountId={long}"),
            "String must contain at most 128 character(s)",
            "accountId",
        ),
    ] {
        let error = ok(user
            .get(&format!("/api/mail/sync{query}"))
            .await
            .expect_error(400, "Validation Error", message));
        assert_eq!(
            error["details"]["issues"][0]["path"],
            json!(path),
            "{query}"
        );
    }
    expect_unknown_field(
        &user
            .get(&format!("/api/mail/sync?accountId=a&userId={}", user.id))
            .await,
        "userId",
    );
    let blank = ok(user
        .get("/api/mail/sync?accountId=%20%20")
        .await
        .expect_error(400, "Validation Error", "A mail accountId is required."));
    assert_eq!(blank["details"], json!({"field": "accountId"}));
}

#[tokio::test]
async fn only_the_mailbox_owner_can_sync_it() {
    let app = TestApp::spawn().await;
    let owner = mailbox(&app).await;
    let mut other = app.user().await;
    for account in [owner.account_id().to_owned(), format!("missing{}", hex(4))] {
        ok(other
            .get(&format!("/api/mail/sync?accountId={account}"))
            .await
            .expect_error(
                403,
                "Forbidden",
                "You are not authorized to sync that mailbox.",
            ));
    }
    let mut other_mailbox = mailbox(&app).await;
    ok(other_mailbox
        .user
        .get(&format!("/api/mail/sync?accountId={}", owner.account_id()))
        .await
        .expect_error(
            403,
            "Forbidden",
            "You are not authorized to sync that mailbox.",
        ));
}

#[tokio::test]
async fn syncs_return_jmap_changes_since_the_stored_state() {
    let app = TestApp::spawn().await;
    let mut owner = mailbox(&app).await;
    let account = owner.account_id().to_owned();

    let first = sync(&mut owner.user, &account).await;
    let stored = stored_states(&app, &account).await;
    assert_eq!(
        (
            first.email.new_state.clone(),
            first.mailbox.new_state.clone(),
            Some(first.thread.new_state.clone())
        ),
        stored
    );
    assert_eq!(first.account_id.0, account);
    if first.initialized {
        assert_eq!(
            (
                &first.email.old_state,
                &first.mailbox.old_state,
                &first.thread.old_state
            ),
            (&None, &None, &None)
        );
        assert!(first.email.created.is_empty() && first.thread.created.is_empty());
    }
    let last_synced: Option<String> = sqlx::query_scalar(
        "SELECT last_synced_at::text FROM mail_jmap_sync_state WHERE stalwart_account_id = $1",
    )
    .bind(&account)
    .fetch_one(&app.db)
    .await
    .expect("last synced");
    assert!(last_synced.is_some());

    // Stalwart creates the default folders on first access, so the sync after the first may still report them.
    let mut quiet = sync(&mut owner.user, &account).await;
    let mut folders = first.mailbox.records.clone();
    for _ in 0..5 {
        if quiet.changed_types.is_empty() {
            break;
        }
        folders.extend(quiet.mailbox.records.clone());
        quiet = sync(&mut owner.user, &account).await;
    }
    assert!(!quiet.initialized);
    assert!(quiet.changed_types.is_empty(), "{quiet:?}");
    for folder in &folders {
        let mut keys: Vec<_> = folder
            .as_object()
            .map(|m| m.keys().cloned().collect())
            .unwrap_or_default();
        keys.sort();
        assert_eq!(
            keys,
            ["id", "name", "parentId", "role", "sortOrder"],
            "{folder}"
        );
    }
    assert!(
        quiet.email.created.is_empty()
            && quiet.email.updated.is_empty()
            && quiet.email.destroyed.is_empty()
    );
    assert_eq!(
        quiet.calendar_import,
        MailCalendarImportSummary {
            messages_scanned: 0,
            ics_parts_found: 0,
            events_created: 0,
            events_updated: 0,
            events_deleted: 0,
            errors: vec![],
        }
    );

    let (before, _, _) = stored_states(&app, &account).await;
    let email_id = owner
        .append(
            "inbox",
            json!({"from": [{"email": "sam@example.com"}], "to": [{"email": owner.user.email}], "subject": "Sync me",
                   "bodyValues": {"t": {"value": "Hello"}}, "textBody": [{"partId": "t", "type": "text/plain"}]}),
        )
        .await;
    if let Some(changes) = sync_seeing(&app, &mut owner, &before, |r| {
        r.email.created.contains(&email_id)
    })
    .await
    {
        assert!(!changes.initialized);
        assert!(
            changes.changed_types.contains(&"Email".to_owned()),
            "{changes:?}"
        );
        assert_eq!(changes.email.old_state.as_deref(), Some(before.as_str()));
        let record = changes
            .email
            .records
            .iter()
            .find(|r| r["id"] == json!(email_id))
            .expect("created email record");
        assert_eq!(record["subject"], json!("Sync me"));
        assert_eq!(record["from"][0]["email"], json!("sam@example.com"));
        assert!(
            record["bodyValues"].is_object(),
            "full records carry body values"
        );
        let thread = record["threadId"].as_str().expect("thread id");
        assert!(
            changes.thread.created.iter().any(|t| t == thread),
            "{changes:?}"
        );
        assert_eq!(changes.calendar_import.messages_scanned, 1);
    }

    let (before, _, _) = stored_states(&app, &account).await;
    owner
        .jmap(json!([["Email/set", {"accountId": account, "update": {&email_id: {"keywords/$seen": true}}}, "u"]]))
        .await;
    if let Some(changes) = sync_seeing(&app, &mut owner, &before, |r| {
        r.email.updated.contains(&email_id)
    })
    .await
    {
        assert!(changes.email.created.is_empty(), "{changes:?}");
    }

    let (before, _, _) = stored_states(&app, &account).await;
    let created = owner
        .jmap(json!([["Mailbox/set", {"accountId": account, "create": {"f": {"name": format!("Suite {}", hex(3))}}}, "m"]]))
        .await;
    let folder = method(&created, "m")["created"]["f"]["id"]
        .as_str()
        .expect("mailbox id")
        .to_owned();
    let (_, mailbox_before, _) = stored_states(&app, &account).await;
    let result = sync(&mut owner.user, &account).await;
    if result.mailbox.created.contains(&folder) {
        assert!(result.changed_types.contains(&"Mailbox".to_owned()));
        let record = result
            .mailbox
            .records
            .iter()
            .find(|r| r["id"] == json!(folder))
            .expect("mailbox record");
        assert_eq!(
            (record["role"].clone(), record["parentId"].clone()),
            (Value::Null, Value::Null)
        );
    } else {
        assert_ne!(stored_states(&app, &account).await.1, mailbox_before);
    }
    assert_eq!(
        stored_states(&app, &account).await.0,
        before,
        "a folder is not an email change"
    );

    let (before, _, _) = stored_states(&app, &account).await;
    owner
        .jmap(json!([["Email/set", {"accountId": account, "destroy": [email_id]}, "d"]]))
        .await;
    sync_seeing(&app, &mut owner, &before, |r| {
        r.email.destroyed.contains(&email_id)
    })
    .await;
}

#[tokio::test]
async fn mailed_invitations_are_staged_in_the_hidden_invitations_calendar() {
    let app = TestApp::spawn().await;
    let mut owner = mailbox(&app).await;
    let uid = format!("{}@example.com", hex(8));
    let email = owner.user.email.clone();

    owner
        .append(
            "inbox",
            invitation_email(
                &email,
                &invitation_ics("REQUEST", &uid, "Suite planning", 0, &email),
            ),
        )
        .await;
    let staged = wait_for_event(&app, &mut owner, &uid, |_| true).await;
    assert_eq!(
        staged,
        json!({
            "title": "Suite planning",
            "description": null,
            "location": "Room 4",
            "start": "2026-11-20T09:00:00",
            "end": "2026-11-20T10:00:00",
            "allDay": false,
            "timezone": "Etc/UTC",
            "encryptionState": "plaintext",
            "encryptedContent": null,
            "blindIndexTokens": null,
            "isCancelled": false,
            "isSynced": false,
            "stalwartEventId": null,
            "userId": owner.user.id,
            "calendar": {"name": "Invitations", "isVisible": false, "isDefault": false, "kind": "owned", "color": "#78716c", "userId": owner.user.id},
            "participants": [
                {"email": "olivia@example.com", "displayName": "Olivia Example", "role": "organizer", "status": "accepted", "userId": null},
                {"email": email, "displayName": owner.user.name, "role": "attendee", "status": "pending", "userId": owner.user.id},
            ],
        }),
        "server-side filing stores the invitation in plaintext (known gap) and never mirrors it to Stalwart"
    );

    owner
        .append(
            "inbox",
            invitation_email(
                &email,
                &invitation_ics("REQUEST", &uid, "Suite planning (moved)", 1, &email),
            ),
        )
        .await;
    let updated = wait_for_event(&app, &mut owner, &uid, |e| {
        e["title"] == json!("Suite planning (moved)")
    })
    .await;
    assert_eq!(updated["calendar"]["name"], json!("Invitations"));

    owner
        .append(
            "inbox",
            invitation_email(
                &email,
                &invitation_ics("CANCEL", &uid, "Suite planning (moved)", 2, &email),
            ),
        )
        .await;
    let cancelled =
        wait_for_event(&app, &mut owner, &uid, |e| e["isCancelled"] == json!(true)).await;
    assert_eq!(cancelled["title"], json!("Suite planning (moved)"));
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM calendar WHERE user_id = $1 AND name = 'Invitations'",
            &owner.user.id
        )
        .await,
        1,
        "one staging calendar per user"
    );
}

#[tokio::test]
async fn accepted_invitation_imports_land_on_the_default_writable_calendar() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar = ok(user
        .post(
            "/api/calendars",
            json!({"name": "Work", "color": "#3b82f6"}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    let calendar_id = calendar["id"].as_str().expect("calendar id").to_owned();
    ok(user
        .put("/api/settings", json!({"defaultCalendarId": calendar_id}))
        .await
        .expect_status(200));
    let uid = format!("{}@example.com", hex(8));
    let email = user.email.clone();
    let import = json!({"icsContent": invitation_ics("REQUEST", &uid, "Decrypted invite", 0, &email), "status": "accepted"});
    // A declined invitation creates the hidden staging calendar, which accepted imports must never use.
    ok(user
        .post(
            "/api/events/invitations/decline-ics",
            json!({"icsContent": invitation_ics("REQUEST", &format!("{}@example.com", hex(8)), "Other", 0, &email)}),
        )
        .await
        .expect_status(200));

    // Calendars created under full encryption are force-encrypted, and server-side imports skip those.
    let refused: MailCalendarImportSummary = ok(user
        .post("/api/events/invitations/import-ics", import.clone())
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        refused,
        MailCalendarImportSummary {
            messages_scanned: 1,
            ics_parts_found: 1,
            events_created: 0,
            events_updated: 0,
            events_deleted: 0,
            errors: vec!["No writable calendar is available for ICS mail imports.".into()],
        }
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM calendar_event WHERE external_id = $1",
            &uid
        )
        .await,
        0
    );

    sqlx::query("UPDATE calendar SET force_full_encryption = false WHERE id = $1")
        .bind(&calendar_id)
        .execute(&app.db)
        .await
        .expect("a legacy hybrid calendar");
    let summary: MailCalendarImportSummary = ok(user
        .post("/api/events/invitations/import-ics", import)
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        summary,
        MailCalendarImportSummary {
            messages_scanned: 1,
            ics_parts_found: 1,
            events_created: 1,
            events_updated: 0,
            events_deleted: 0,
            errors: vec![],
        }
    );
    let event = row_json(
        &app.db,
        sqlx::AssertSqlSafe(event_sql().replace("::text", "")),
        &uid,
    )
    .await;
    assert_eq!(event["title"], json!("Decrypted invite"));
    assert_eq!(event["calendar"]["name"], json!("Work"));
    assert_eq!(
        event["stalwartEventId"],
        Value::Null,
        "never mirrored into Stalwart"
    );
    let attendee = event["participants"]
        .as_array()
        .and_then(|p| p.iter().find(|p| p["email"] == json!(email)))
        .expect("attendee");
    assert_eq!(attendee["status"], json!("accepted"));

    let side = ok(user
        .post(
            "/api/calendars",
            json!({"name": "Side", "color": "#22c55e"}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    let side_id = side["id"].as_str().expect("calendar id").to_owned();
    sqlx::query("UPDATE calendar SET force_full_encryption = false WHERE id = $1")
        .bind(&side_id)
        .execute(&app.db)
        .await
        .expect("a legacy hybrid calendar");
    let chosen_uid = format!("{}@example.com", hex(8));
    let chosen: MailCalendarImportSummary = ok(user
        .post(
            "/api/events/invitations/import-ics",
            json!({"icsContent": invitation_ics("REQUEST", &chosen_uid, "Chosen calendar", 0, &email), "status": "accepted", "calendarId": side_id}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(chosen.events_created, 1);
    let event = row_json(
        &app.db,
        sqlx::AssertSqlSafe(event_sql().replace("::text", "")),
        &chosen_uid,
    )
    .await;
    assert_eq!(
        event["calendar"]["name"],
        json!("Side"),
        "an explicitly requested calendar wins over the default"
    );
}

#[tokio::test]
async fn client_encrypted_invitation_imports_store_only_ciphertext() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let uid = format!("{}@example.com", hex(8));
    let ciphertext = fake_envelope();
    let token = fake_token();
    let email = user.email.clone();

    let summary: MailCalendarImportSummary = ok(user
        .post(
            "/api/events/invitations/import-ics",
            json!({
                "icsContent": invitation_ics("REQUEST", &uid, "Secret planning", 0, &email),
                "status": "tentative",
                "encryption": [{"externalId": uid, "encryptedContent": ciphertext, "blindIndexTokens": [token], "encryptionKeyVersion": 1}],
            }),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(summary.events_created, 1);
    let event = row_json(
        &app.db,
        sqlx::AssertSqlSafe(event_sql().replace("::text", "")),
        &uid,
    )
    .await;
    assert_eq!(
        (
            event["title"].clone(),
            event["description"].clone(),
            event["location"].clone(),
            event["encryptionState"].clone(),
            event["encryptedContent"].clone(),
            event["blindIndexTokens"].clone(),
        ),
        (
            json!(""),
            Value::Null,
            Value::Null,
            json!("encrypted"),
            json!(ciphertext),
            json!(json!([token]).to_string()),
        )
    );
    assert_eq!(
        event["calendar"]["name"],
        json!("Personal"),
        "a first calendar is created"
    );
}

#[tokio::test]
async fn a_declined_invitation_is_kept_as_a_hidden_tombstone_that_mail_does_not_revive() {
    let app = TestApp::spawn().await;
    let mut owner = mailbox(&app).await;
    let uid = format!("{}@example.com", hex(8));
    let email = owner.user.email.clone();

    let declined = ok(owner
        .user
        .post(
            "/api/events/invitations/decline-ics",
            json!({"icsContent": invitation_ics("REQUEST", &uid, "Unwanted sync", 0, &email)}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    assert_eq!(declined, json!({"declined": true}));
    let tombstone = row_json(
        &app.db,
        sqlx::AssertSqlSafe(event_sql().replace("::text", "")),
        &uid,
    )
    .await;
    assert_eq!(tombstone["calendar"]["name"], json!("Invitations"));
    assert_eq!(tombstone["calendar"]["isVisible"], json!(false));
    let me = |event: &Value| {
        event["participants"]
            .as_array()
            .and_then(|p| p.iter().find(|p| p["email"] == json!(email)))
            .map(|p| p["status"].clone())
    };
    assert_eq!(me(&tombstone), Some(json!("declined")));

    let (before, _, _) = stored_states_or_sync(&app, &mut owner).await;
    let email_id = owner
        .append(
            "inbox",
            invitation_email(
                &email,
                &invitation_ics("REQUEST", &uid, "Unwanted sync (again)", 1, &email),
            ),
        )
        .await;
    if let Some(changes) = sync_seeing(&app, &mut owner, &before, |r| {
        r.email.created.contains(&email_id)
    })
    .await
    {
        assert_eq!(changes.calendar_import.ics_parts_found, 1, "{changes:?}");
        assert_eq!(changes.calendar_import.events_updated, 0);
    }
    let after = row_json(
        &app.db,
        sqlx::AssertSqlSafe(event_sql().replace("::text", "")),
        &uid,
    )
    .await;
    assert_eq!(
        after["title"],
        json!("Unwanted sync"),
        "a declined invitation is not updated from mail"
    );
    assert_eq!(me(&after), Some(json!("declined")));
}

/// The stored states, after a first sync if none exist yet.
async fn stored_states_or_sync(
    app: &TestApp,
    owner: &mut Mailbox,
) -> (String, String, Option<String>) {
    let account = owner.account_id().to_owned();
    sync(&mut owner.user, &account).await;
    stored_states(app, &account).await
}
