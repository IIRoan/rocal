//! Participants, invitation mail, mailed-invitation imports, RSVP replies and attendee copies.

use percent_encoding::{NON_ALPHANUMERIC, utf8_percent_encode};
use serde_json::json;
use solace_api_tests::seed::fake_envelope;
use solace_api_types::events::{
    BulkEventResult, Event, EventDeleted, EventList, ImportInvitationRequest, InvitationContent,
    InvitationDeclined, InvitationEncryptionEntry, InvitationImportSummary, InvitationLookup,
    ParticipantInput, RsvpDeleted, UpdateEventRequest,
};

use crate::event_fixtures::{
    FUTURE_END, FUTURE_START, StoredContent, assert_no_mail, calendar_id, create_event,
    encrypted_event, list_events, row_snapshot, sent_mail, stored_content, to_json, unfold,
};
use crate::helpers::{Backend, TestApp, TestUser, count, expect_unknown_field, hex, ok};

const NOT_FOUND: &str = "Event not found or access denied";

fn guest() -> String {
    format!("guest-{}@example.com", hex(6))
}

fn participant(email: &str) -> ParticipantInput {
    ParticipantInput {
        email: email.into(),
        display_name: None,
        role: None,
        status: None,
    }
}

fn invitation(title: &str) -> InvitationContent {
    InvitationContent {
        title: title.into(),
        description: None,
        location: None,
    }
}

/// People on an event as (email, role, status), sorted.
fn people(event: &Event) -> Vec<(String, String, String)> {
    let mut people: Vec<_> = event
        .participants
        .clone()
        .unwrap_or_default()
        .into_iter()
        .map(|p| (p.email, p.role, p.status))
        .collect();
    people.sort();
    people
}

fn person(email: &str, role: &str, status: &str) -> (String, String, String) {
    (email.to_owned(), role.to_owned(), status.to_owned())
}

/// The organizer's mailed REQUEST as the attendee's client posts it back after decrypting.
fn request_ics(uid: &str, method: &str, organizer: &str, attendee: &str) -> String {
    [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Solace Calendar//Calendar Export//EN",
        &format!("METHOD:{method}"),
        "BEGIN:VEVENT",
        &format!("UID:{uid}"),
        "DTSTAMP:20990101T000000Z",
        "SUMMARY:Planning",
        "DTSTART:20990302T090000Z",
        "DTEND:20990302T100000Z",
        &format!("ORGANIZER;CN=Organizer:mailto:{organizer}"),
        &format!("ATTENDEE;CN=Bee;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:{attendee}"),
        "END:VEVENT",
        "END:VCALENDAR",
        "",
    ]
    .join("\r\n")
}

/// A weekly series' REQUEST for four Mondays from 2 March 2099, the 9th excluded and the 16th moved; or only the move of the 23rd.
fn series_request(uid: &str, organizer: &str, attendee: &str, master: bool) -> String {
    let people = [
        format!("ORGANIZER;CN=Organizer:mailto:{organizer}"),
        format!("ATTENDEE;CN=Bee;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:{attendee}"),
    ];
    let event = |lines: &[&str]| {
        let mut out = vec!["BEGIN:VEVENT".to_owned(), format!("UID:{uid}")];
        out.extend(lines.iter().map(|line| (*line).to_owned()));
        out.extend(people.iter().cloned());
        out.push("END:VEVENT".into());
        out
    };
    let mut lines = vec![
        "BEGIN:VCALENDAR".to_owned(),
        "VERSION:2.0".into(),
        "METHOD:REQUEST".into(),
    ];
    if master {
        lines.extend(event(&[
            "SUMMARY:Weekly",
            "DTSTART:20990302T090000Z",
            "DTEND:20990302T100000Z",
            "RRULE:FREQ=WEEKLY;COUNT=4",
            "EXDATE:20990309T090000Z",
        ]));
        lines.extend(event(&[
            "SUMMARY:Moved",
            "RECURRENCE-ID:20990316T090000Z",
            "DTSTART:20990316T140000Z",
            "DTEND:20990316T150000Z",
        ]));
    } else {
        lines.extend(event(&[
            "SUMMARY:Moved later",
            "RECURRENCE-ID:20990323T090000Z",
            "DTSTART:20990323T160000Z",
            "DTEND:20990323T170000Z",
        ]));
    }
    lines.extend(["END:VCALENDAR".to_owned(), String::new()]);
    lines.join("\r\n")
}

#[tokio::test]
async fn mailed_series_skip_their_excluded_and_overridden_occurrences() {
    let app = TestApp::spawn().await;
    let mut attendee = app.user().await;
    let uid = format!("series-{}@example.com", hex(6));
    let organizer = "organizer@example.com";
    let email = attendee.email.clone();
    let starts = |list: EventList| -> Vec<(String, String)> {
        list.events
            .into_iter()
            .map(|event| (event.start.0, event.end.0))
            .collect()
    };
    let at = |start: &str, end: &str| (start.to_owned(), end.to_owned());
    import(
        &mut attendee,
        &import_request(series_request(&uid, organizer, &email, true), None),
    )
    .await;
    let first = starts(
        list_events(
            &mut attendee,
            "2099-03-01T00:00:00.000Z",
            "2099-03-31T00:00:00.000Z",
        )
        .await,
    );
    import(
        &mut attendee,
        &import_request(series_request(&uid, organizer, &email, false), None),
    )
    .await;
    let second = starts(
        list_events(
            &mut attendee,
            "2099-03-01T00:00:00.000Z",
            "2099-03-31T00:00:00.000Z",
        )
        .await,
    );
    let monday = |day: u8| {
        at(
            &format!("2099-03-{day:02}T09:00:00.000Z"),
            &format!("2099-03-{day:02}T10:00:00.000Z"),
        )
    };
    match app.backend {
        // TypeScript stores overrides as unrelated events and ignores EXDATE.
        Backend::TypeScript => {
            assert_eq!(
                first,
                [
                    monday(2),
                    monday(9),
                    monday(16),
                    at("2099-03-16T14:00:00.000Z", "2099-03-16T15:00:00.000Z"),
                    monday(23),
                ]
            );
            assert_eq!(second.len(), 6);
        }
        Backend::Rust => {
            assert_eq!(
                first,
                [
                    monday(2),
                    at("2099-03-16T14:00:00.000Z", "2099-03-16T15:00:00.000Z"),
                    monday(23),
                ]
            );
            assert_eq!(
                second,
                [
                    monday(2),
                    at("2099-03-16T14:00:00.000Z", "2099-03-16T15:00:00.000Z"),
                    at("2099-03-23T16:00:00.000Z", "2099-03-23T17:00:00.000Z"),
                ],
                "a later override joins without losing the series' earlier exceptions"
            );
        }
    }
}

async fn import(user: &mut TestUser, request: &ImportInvitationRequest) -> InvitationImportSummary {
    ok(user
        .post("/api/events/invitations/import-ics", to_json(request))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()))
}

fn import_request(ics: String, status: Option<&str>) -> ImportInvitationRequest {
    ImportInvitationRequest {
        ics_content: ics,
        status: status.map(str::to_owned),
        calendar_id: None,
        encryption: None,
    }
}

async fn lookup(user: &mut TestUser, uid: &str) -> Option<Event> {
    let lookup: InvitationLookup = ok(user
        .get(&format!(
            "/api/events/invitations/by-external-id?externalId={}",
            percent_encode(uid)
        ))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    lookup.event
}

fn percent_encode(value: &str) -> String {
    utf8_percent_encode(value, NON_ALPHANUMERIC).to_string()
}

fn summary(created: i64, updated: i64, errors: &[&str]) -> InvitationImportSummary {
    InvitationImportSummary {
        messages_scanned: 1,
        ics_parts_found: 1,
        events_created: created,
        events_updated: updated,
        events_deleted: 0,
        errors: errors.iter().map(|e| e.to_string()).collect(),
    }
}

/// An organizer's encrypted event inviting `attendee`, with its mailed invitation.
async fn invite(owner: &mut TestUser, attendee: &str) -> Event {
    let calendar = calendar_id(owner, "Work").await;
    let mut request = encrypted_event(&calendar, FUTURE_START, FUTURE_END);
    request.participants = Some(vec![participant(attendee)]);
    request.invitation_content = Some(invitation("Planning"));
    create_event(owner, &request).await
}

/// The attendee's staged copy of the organizer's invitation.
async fn staged_copy(attendee: &mut TestUser, organizer: &TestUser, event: &Event) -> Event {
    let uid = event.external_id.clone().expect("uid");
    let ics = request_ics(&uid, "REQUEST", &organizer.email, &attendee.email);
    import(attendee, &import_request(ics, None)).await;
    lookup(attendee, &uid).await.expect("staged copy")
}

#[tokio::test]
async fn new_invitees_get_a_noreply_invitation_with_an_ics_request() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let attendee = app.user().await;
    let outsider = guest();
    let calendar = calendar_id(&mut owner, "Work").await;
    let mut request = encrypted_event(&calendar, FUTURE_START, FUTURE_END);
    request.participants = Some(vec![
        ParticipantInput {
            email: attendee.email.to_uppercase(),
            display_name: Some("  Bee  ".into()),
            role: Some("attendee".into()),
            status: Some("pending".into()),
        },
        participant(&outsider),
    ]);
    request.invitation_content = Some(InvitationContent {
        title: "Planning".into(),
        description: Some("Agenda\nItems".into()),
        location: Some("Room 1".into()),
    });
    let event = create_event(&mut owner, &request).await;

    assert_eq!(event.warnings, None);
    assert_eq!(
        people(&event),
        {
            let mut expected = vec![
                person(&attendee.email, "attendee", "pending"),
                person(&outsider, "attendee", "pending"),
                person(&owner.email, "organizer", "accepted"),
            ];
            expected.sort();
            expected
        },
        "addresses are lowercased and the owner is the organizer"
    );
    let participants = event.participants.clone().expect("participants");
    let find = |email: &str| {
        participants
            .iter()
            .find(|p| p.email == email)
            .expect("participant")
            .clone()
    };
    assert_eq!(
        (
            find(&attendee.email).display_name.as_str(),
            find(&attendee.email).user_id.map(|id| id.0)
        ),
        ("Bee", Some(attendee.id.clone()))
    );
    assert_eq!(
        (
            find(&outsider).display_name.as_str(),
            find(&outsider).user_id
        ),
        (outsider.as_str(), None)
    );
    assert_eq!(
        stored_content(&app.db, &event.id.0).await.title,
        "",
        "the invitation copy is never stored"
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM calendar_event WHERE id = $1 AND (description IS NOT NULL OR location IS NOT NULL)",
            &event.id.0
        )
        .await,
        0
    );

    let uid = event.external_id.clone().expect("uid");
    for (email, name) in [
        (attendee.email.as_str(), "Bee"),
        (outsider.as_str(), outsider.as_str()),
    ] {
        let mail = sent_mail(&app, email, 1).await;
        assert_eq!(mail.len(), 1, "{email}");
        let mail = &mail[0];
        assert_eq!(
            mail.subject,
            format!("{} invited you to Planning", owner.name)
        );
        let lines: Vec<&str> = mail.text.lines().collect();
        assert_eq!(lines[0], format!("Hi {name},"));
        assert_eq!(
            lines[2],
            format!("{} invited you to \"Planning\".", owner.name)
        );
        assert!(lines[3].starts_with("When: Mar 2, 2099, "), "{}", lines[3]);
        assert_eq!(lines[4], "Location: Room 1");
        assert!(mail.text.contains("\n\nAgenda\nItems\n\n"), "{}", mail.text);
        assert!(
            mail.text.ends_with(&format!(
                "Open event: {}/calendar?eventId={}\n\nAn ICS calendar invite is attached.",
                app.origin, event.id
            )),
            "{}",
            mail.text
        );
        assert_eq!(mail.attachment_name.as_deref(), Some("invite.ics"));
        let ics = unfold(mail.ics.as_deref().expect("ics"));
        for line in [
            "METHOD:REQUEST".to_owned(),
            // The encrypted calendar name never leaves the device.
            "X-WR-CALNAME:Solace".to_owned(),
            format!("UID:{uid}"),
            "SUMMARY:Planning".to_owned(),
            "DESCRIPTION:Agenda\\nItems".to_owned(),
            "LOCATION:Room 1".to_owned(),
            "DTSTART:20990302T090000Z".to_owned(),
            format!("ORGANIZER;CN={}:mailto:{}", owner.name, owner.email),
            format!(
                "ATTENDEE;CN=Bee;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:{}",
                attendee.email
            ),
            format!("ATTENDEE;CN={outsider};PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:{outsider}"),
        ] {
            assert!(
                ics.split("\r\n").any(|l| l == line),
                "missing {line}: {ics}"
            );
        }
    }
    assert_no_mail(&app, &owner.email).await;
}

#[tokio::test]
async fn encrypted_events_without_an_invitation_copy_send_no_mail() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let outsider = guest();
    let calendar = calendar_id(&mut owner, "Work").await;
    let mut request = encrypted_event(&calendar, FUTURE_START, FUTURE_END);
    request.participants = Some(vec![participant(&outsider)]);
    let event = create_event(&mut owner, &request).await;
    assert_eq!(people(&event), {
        let mut expected = vec![
            person(&outsider, "attendee", "pending"),
            person(&owner.email, "organizer", "accepted"),
        ];
        expected.sort();
        expected
    });
    assert_no_mail(&app, &outsider).await;
}

#[tokio::test]
async fn participant_lists_are_merged_and_normalized() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let first = guest();
    let second = guest();
    let chair = guest();
    let calendar = calendar_id(&mut owner, "Work").await;
    let mut request = encrypted_event(&calendar, FUTURE_START, FUTURE_END);
    request.participants = Some(vec![
        ParticipantInput {
            email: owner.email.clone(),
            display_name: Some("Me".into()),
            role: Some("attendee".into()),
            status: Some("declined".into()),
        },
        ParticipantInput {
            email: first.clone(),
            display_name: Some("First".into()),
            role: None,
            status: Some("tentative".into()),
        },
        ParticipantInput {
            email: first.to_uppercase(),
            display_name: None,
            role: None,
            status: Some("accepted".into()),
        },
        ParticipantInput {
            email: second.clone(),
            display_name: None,
            role: None,
            status: Some("declined".into()),
        },
        ParticipantInput {
            email: chair.clone(),
            display_name: None,
            role: Some("organizer".into()),
            status: Some("pending".into()),
        },
    ]);
    request.invitation_content = Some(invitation("Planning"));
    let event = create_event(&mut owner, &request).await;
    let participants = event.participants.clone().expect("participants");
    let get = |email: &str| {
        participants
            .iter()
            .find(|p| p.email == email)
            .map(|p| (p.display_name.clone(), p.role.clone(), p.status.clone()))
            .expect("participant")
    };
    assert_eq!(participants.len(), 4, "duplicates merge");
    assert_eq!(
        get(&owner.email),
        (
            "Me".to_owned(),
            "organizer".to_owned(),
            "accepted".to_owned()
        ),
        "the owner is always the accepted organizer"
    );
    assert_eq!(
        get(&first),
        (
            "First".to_owned(),
            "attendee".to_owned(),
            "accepted".to_owned()
        ),
        "a later entry wins the status and keeps the earlier name"
    );
    assert_eq!(
        get(&second),
        (second.clone(), "attendee".to_owned(), "declined".to_owned())
    );
    assert_eq!(
        get(&chair),
        (chair.clone(), "organizer".to_owned(), "accepted".to_owned()),
        "a guest marked organizer stays one"
    );
    assert_eq!(sent_mail(&app, &first, 1).await.len(), 1);
    assert_eq!(sent_mail(&app, &second, 1).await.len(), 1);
    assert_no_mail(&app, &chair).await;
}

#[tokio::test]
async fn updating_participants_invites_only_new_people_and_removes_the_rest() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let kept = guest();
    let removed = guest();
    let added = guest();
    let calendar = calendar_id(&mut owner, "Work").await;
    let mut request = encrypted_event(&calendar, FUTURE_START, FUTURE_END);
    request.participants = Some(vec![participant(&kept), participant(&removed)]);
    request.invitation_content = Some(invitation("Planning"));
    let event = create_event(&mut owner, &request).await;
    assert_eq!(sent_mail(&app, &kept, 1).await.len(), 1);

    let update = UpdateEventRequest {
        encrypted_content: Some(fake_envelope()),
        participants: Some(vec![participant(&kept), participant(&added)]),
        invitation_content: Some(invitation("Planning v2")),
        ..UpdateEventRequest::default()
    };
    let updated: Event = ok(owner
        .put(&format!("/api/events/{}", event.id), to_json(&update))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    let mut expected = vec![
        person(&added, "attendee", "pending"),
        person(&kept, "attendee", "pending"),
        person(&owner.email, "organizer", "accepted"),
    ];
    expected.sort();
    assert_eq!(people(&updated), expected);
    assert_eq!(
        updated
            .participants
            .as_ref()
            .map(|p| p.iter().map(|p| p.role.as_str()).collect::<Vec<_>>()),
        Some(vec!["organizer", "attendee", "attendee"]),
        "an update answers participants sorted, organizer first"
    );
    let added_mail = sent_mail(&app, &added, 1).await;
    assert_eq!(added_mail.len(), 1);
    assert_eq!(
        added_mail[0].subject,
        format!("{} invited you to Planning v2", owner.name)
    );
    tokio::time::sleep(std::time::Duration::from_millis(750)).await;
    assert_eq!(
        sent_mail(&app, &kept, 1).await.len(),
        1,
        "no second invitation"
    );
    assert_eq!(
        sent_mail(&app, &removed, 1).await.len(),
        1,
        "removal sends nothing"
    );

    let cleared: Event = ok(owner
        .put(
            &format!("/api/events/{}", event.id),
            json!({"participants": []}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        people(&cleared),
        [person(&owner.email, "organizer", "accepted")]
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM event_participant WHERE event_id = $1",
            &event.id.0
        )
        .await,
        1
    );
}

#[tokio::test]
async fn reserved_addresses_are_hidden_and_purged_from_participants() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let event = create_event(
        &mut owner,
        &encrypted_event(&calendar, FUTURE_START, FUTURE_END),
    )
    .await;
    sqlx::query(
        "INSERT INTO event_participant (id, event_id, email, role, status, created_at, updated_at) \
         VALUES ($1, $2, 'admin@solace.onl', 'attendee', 'accepted', now(), now())",
    )
    .bind(format!("suitepart{}", hex(8)))
    .bind(&event.id.0)
    .execute(&app.db)
    .await
    .expect("insert reserved participant");
    let fetched: Event = ok(owner
        .get(&format!("/api/events/{}", event.id))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        people(&fetched),
        [person(&owner.email, "organizer", "accepted")]
    );

    let error = ok(owner
        .put(
            &format!("/api/events/{}", event.id),
            json!({"participants": [{"email": "admin@solace.onl"}]}),
        )
        .await
        .expect_error(
            400,
            "Validation Error",
            "Cannot invite system or administrative email addresses",
        ));
    assert_eq!(
        error["details"]["issues"][0]["path"],
        json!("participants.0.email")
    );
    ok(owner
        .put(
            &format!("/api/events/{}", event.id),
            json!({"participants": []}),
        )
        .await
        .expect_status(200));
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM event_participant WHERE event_id = $1 AND email = 'admin@solace.onl'",
            &event.id.0
        )
        .await,
        0,
        "any participant sync deletes reserved rows"
    );
}

#[tokio::test]
async fn mailbox_aliases_link_to_their_solace_user() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let attendee = app.user().await;
    let alias = format!("alias-{}@{}", hex(6), app.env.mail_domain);
    let entry = format!("suitedir{}", hex(8));
    sqlx::query(
        "INSERT INTO mail_directory_entry (id, user_id, email, local_part, domain, stalwart_account_id, stalwart_domain_id, \
         public_key_armored, public_key_fingerprint, created_at, updated_at) \
         VALUES ($1, $2, $3, 'alias', $4, $5, 'domain', 'key', 'fingerprint', now(), now())",
    )
    .bind(&entry)
    .bind(&attendee.id)
    .bind(&alias)
    .bind(&app.env.mail_domain)
    .bind(format!("suiteacct{}", hex(8)))
    .execute(&app.db)
    .await
    .expect("insert directory entry");
    let event = invite(&mut owner, &alias).await;
    // Mail sync polls every linked directory row against Stalwart, so the fake account must not outlive the create.
    sqlx::query("DELETE FROM mail_directory_entry WHERE id = $1")
        .bind(&entry)
        .execute(&app.db)
        .await
        .expect("remove directory entry");
    let linked = event
        .participants
        .clone()
        .expect("participants")
        .into_iter()
        .find(|p| p.email == alias)
        .expect("alias participant");
    assert_eq!(linked.user_id.map(|id| id.0), Some(attendee.id.clone()));
    assert_eq!(
        linked.display_name, alias,
        "the directory has no name to offer"
    );
    assert_eq!(
        sent_mail(&app, &alias, 1).await.len(),
        1,
        "mail goes to the alias itself"
    );
}

#[tokio::test]
async fn participant_pictures_never_expose_remote_urls() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let attendee = app.user().await;
    let event = invite(&mut owner, &attendee.email).await;
    let encoded = attendee.email.replace('@', "%40");
    for (image, expected) in [
        (
            Some("https://cdn.example.com/bee.png"),
            Some(format!("/api/profiles/avatar?email={encoded}")),
        ),
        (Some("http://127.0.0.1/tracker.png"), None),
        (Some("javascript:alert(1)"), None),
        (
            Some("/api/profiles/avatars/aaaaaaaaaaaaaaaaaaaaaa"),
            Some("/api/profiles/avatars/aaaaaaaaaaaaaaaaaaaaaa".to_owned()),
        ),
        (None, None),
    ] {
        sqlx::query("UPDATE \"user\" SET image = $2 WHERE id = $1")
            .bind(&attendee.id)
            .bind(image)
            .execute(&app.db)
            .await
            .expect("set image");
        let fetched: Event = ok(owner
            .get(&format!("/api/events/{}", event.id))
            .await
            .expect_status(200)
            .and_then(|r| r.dto()));
        let picture = fetched
            .participants
            .expect("participants")
            .into_iter()
            .find(|p| p.email == attendee.email)
            .expect("attendee")
            .image;
        assert_eq!(picture, expected, "{image:?}");
    }
}

#[tokio::test]
async fn staged_invitations_land_in_the_hidden_invitations_calendar() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut attendee = app.user().await;
    let event = invite(&mut owner, &attendee.email).await;
    let uid = event.external_id.clone().expect("uid");
    assert_eq!(lookup(&mut attendee, &uid).await, None);
    let ics = request_ics(&uid, "REQUEST", &owner.email, &attendee.email);

    assert_eq!(
        import(&mut attendee, &import_request(ics.clone(), None)).await,
        summary(1, 0, &[])
    );
    let copy = lookup(&mut attendee, &uid).await.expect("copy");
    assert_eq!(copy.user_id.0, attendee.id);
    assert_eq!(
        (
            copy.calendar.name.as_str(),
            copy.calendar.is_visible,
            copy.calendar.color.as_str(),
            copy.calendar.kind.as_str()
        ),
        ("Invitations", false, "#78716c", "owned")
    );
    assert_eq!(
        (copy.title.as_str(), copy.encryption_state.as_str()),
        ("Planning", "plaintext"),
        "a staged import keeps the decrypted title on the server"
    );
    assert_eq!(copy.timezone, "Etc/UTC");
    assert!(copy.synced_at.is_some() && !copy.is_synced && copy.subscription_id.is_none());
    let mut expected = vec![
        person(&owner.email, "organizer", "accepted"),
        person(&attendee.email, "attendee", "pending"),
    ];
    expected.sort();
    assert_eq!(people(&copy), expected);
    let organizer = copy
        .participants
        .clone()
        .expect("participants")
        .into_iter()
        .find(|p| p.role == "organizer")
        .expect("organizer");
    assert_eq!(
        (
            organizer.display_name.as_str(),
            organizer.user_id.map(|id| id.0)
        ),
        ("Organizer", Some(owner.id.clone()))
    );
    assert_eq!(
        import(&mut attendee, &import_request(ics, None)).await,
        summary(0, 0, &[]),
        "an unchanged invitation is not rewritten"
    );
    let lookup_query: InvitationLookup = ok(attendee
        .get(&format!(
            "/api/events/invitations/by-external-id?externalId={}&syncRemote=false",
            percent_encode(&uid)
        ))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(lookup_query.event.map(|e| e.id), Some(copy.id.clone()));
    assert_eq!(
        lookup(&mut owner, &uid).await.map(|e| e.id),
        Some(event.id.clone()),
        "the organizer's own row answers the same id"
    );
    let list = list_events(
        &mut attendee,
        "2099-03-01T00:00:00.000Z",
        "2099-03-31T00:00:00.000Z",
    )
    .await;
    assert_eq!(
        list.calendars
            .iter()
            .map(|c| c.name.as_str())
            .collect::<Vec<_>>(),
        ["Invitations"],
        "a user whose first calendar is the staging one never gets the defaults"
    );
    assert_eq!(list.events.len(), 1);
}

#[tokio::test]
async fn accepting_needs_a_writable_calendar() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut attendee = app.user().await;
    let event = invite(&mut owner, &attendee.email).await;
    let uid = event.external_id.clone().expect("uid");
    let ics = request_ics(&uid, "REQUEST", &owner.email, &attendee.email);
    import(&mut attendee, &import_request(ics.clone(), None)).await;
    assert_eq!(
        import(&mut attendee, &import_request(ics, Some("accepted"))).await,
        summary(
            0,
            0,
            &["No writable calendar is available for ICS mail imports."]
        )
    );
}

#[tokio::test]
async fn accepting_moves_the_copy_to_the_default_calendar_and_replies() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut attendee = app.user().await;
    let personal = calendar_id(&mut attendee, "Personal").await;
    let event = invite(&mut owner, &attendee.email).await;
    let copy = staged_copy(&mut attendee, &owner, &event).await;

    let accepted: Event = ok(attendee
        .post(
            &format!("/api/events/{}/rsvp", copy.id),
            json!({"status": "accepted"}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(accepted.calendar.id.0, personal);
    let mut expected = vec![
        person(&owner.email, "organizer", "accepted"),
        person(&attendee.email, "attendee", "accepted"),
    ];
    expected.sort();
    assert_eq!(people(&accepted), expected);

    let replies = sent_mail(&app, &owner.email, 1).await;
    assert_eq!(replies.len(), 1);
    assert_eq!(replies[0].subject, "Accepted: Planning");
    assert_eq!(replies[0].text, "Bee accepted the invitation.");
    assert_eq!(replies[0].attachment_name.as_deref(), Some("reply.ics"));
    let ics = unfold(replies[0].ics.as_deref().expect("reply ics"));
    for line in [
        "METHOD:REPLY".to_owned(),
        format!("UID:{}", event.external_id.clone().expect("uid")),
        format!("ORGANIZER:mailto:{}", owner.email),
        format!(
            "ATTENDEE;CN=Bee;PARTSTAT=ACCEPTED:mailto:{}",
            attendee.email
        ),
    ] {
        assert!(
            ics.split("\r\n").any(|l| l == line),
            "missing {line}: {ics}"
        );
    }

    let tentative: Event = ok(attendee
        .post(
            &format!("/api/events/{}/rsvp", copy.id),
            json!({"status": "tentative"}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert!(people(&tentative).contains(&person(&attendee.email, "attendee", "tentative")));
    let replies = sent_mail(&app, &owner.email, 2).await;
    assert_eq!(replies.len(), 2);
    assert_eq!(replies[1].subject, "Tentative: Planning");
    assert!(
        unfold(replies[1].ics.as_deref().expect("ics"))
            .contains(&format!("PARTSTAT=TENTATIVE:mailto:{}", attendee.email))
    );
}

#[tokio::test]
async fn declining_keeps_a_hidden_tombstone_that_blocks_restaging() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut attendee = app.user().await;
    calendar_id(&mut attendee, "Personal").await;
    let event = invite(&mut owner, &attendee.email).await;
    let uid = event.external_id.clone().expect("uid");
    let copy = staged_copy(&mut attendee, &owner, &event).await;
    ok(attendee
        .post(
            &format!("/api/events/{}/rsvp", copy.id),
            json!({"status": "accepted"}),
        )
        .await
        .expect_status(200));
    ok(attendee
        .put(
            &format!("/api/notifications/event/{}", copy.id),
            json!({"notifications": [{"notificationType": "email", "minutesBefore": 30, "isEnabled": true}]}),
        )
        .await
        .expect_status(200));

    let declined: RsvpDeleted = ok(attendee
        .post(
            &format!("/api/events/{}/rsvp", copy.id),
            json!({"status": "declined"}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(declined, RsvpDeleted { deleted: true });
    let row = row_snapshot(&app.db, "calendar_event", &copy.id.0)
        .await
        .expect("tombstone stays");
    let staging: String = sqlx::query_scalar("SELECT name FROM calendar WHERE id = $1")
        .bind(row["calendar_id"].as_str().expect("calendar id"))
        .fetch_one(&app.db)
        .await
        .expect("calendar");
    assert_eq!(staging, "Invitations");
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM event_notification WHERE event_id = $1",
            &copy.id.0
        )
        .await,
        0,
        "reminders go with the decline"
    );
    let list = list_events(
        &mut attendee,
        "2099-03-01T00:00:00.000Z",
        "2099-03-31T00:00:00.000Z",
    )
    .await;
    assert!(list.events.is_empty(), "a declined copy is hidden");
    let replies = sent_mail(&app, &owner.email, 2).await;
    assert_eq!(
        replies
            .iter()
            .map(|m| m.subject.as_str())
            .collect::<Vec<_>>(),
        ["Accepted: Planning", "Declined: Planning"]
    );
    assert!(
        unfold(replies[1].ics.as_deref().expect("ics"))
            .contains(&format!("PARTSTAT=DECLINED:mailto:{}", attendee.email))
    );

    let ics = request_ics(&uid, "REQUEST", &owner.email, &attendee.email);
    assert_eq!(
        import(&mut attendee, &import_request(ics.clone(), None)).await,
        summary(0, 0, &[]),
        "a declined invitation is not staged again"
    );
    let fetched: Event = ok(attendee
        .get(&format!("/api/events/{}", copy.id))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert!(people(&fetched).contains(&person(&attendee.email, "attendee", "declined")));
    let unsealed = import(
        &mut attendee,
        &import_request(ics.clone(), Some("accepted")),
    )
    .await;
    assert_eq!(
        unsealed.errors,
        [
            "Decrypted mail invitation: This calendar requires encrypted event details; automatic server-side mail import is unavailable."
        ],
        "an accepted copy outside staging needs its sealed details"
    );
    let mut sealed = import_request(ics, Some("accepted"));
    sealed.encryption = Some(vec![InvitationEncryptionEntry {
        external_id: uid.clone(),
        encrypted_content: fake_envelope(),
        blind_index_tokens: None,
        encryption_key_version: None,
    }]);
    assert_eq!(
        import(&mut attendee, &sealed).await,
        summary(0, 1, &[]),
        "accepting again revives the copy"
    );
}

#[tokio::test]
async fn attendee_copies_are_read_only_and_deleting_declines() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut attendee = app.user().await;
    let target = calendar_id(&mut attendee, "Family").await;
    let event = invite(&mut owner, &attendee.email).await;
    let copy = staged_copy(&mut attendee, &owner, &event).await;
    let before = row_snapshot(&app.db, "calendar_event", &copy.id.0).await;

    ok(attendee
        .put(&format!("/api/events/{}", copy.id), json!({"color": "red"}))
        .await
        .expect_error(
            400,
            "Validation Error",
            "Imported invitation events are read-only for attendees.",
        ));
    for action in ["move", "duplicate"] {
        ok(attendee
            .post(
                "/api/events/bulk",
                json!({"action": action, "eventIds": [copy.id], "targetCalendarId": target}),
            )
            .await
            .expect_error(
                400,
                "Validation Error",
                match app.backend {
                    // TypeScript names the events by title, which is user content in the message.
                    Backend::TypeScript => {
                        "Imported invitation events are read-only for attendees: Planning"
                    }
                    Backend::Rust => {
                        "Imported invitation events are read-only for attendees (1 selected)."
                    }
                },
            ));
    }
    assert_eq!(
        row_snapshot(&app.db, "calendar_event", &copy.id.0).await,
        before
    );

    let deleted: EventDeleted = ok(attendee
        .delete(&format!("/api/events/{}", copy.id))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        deleted,
        EventDeleted {
            success: true,
            message: "Invitation declined and removed from your calendar".into(),
            deleted_event_id: copy.id.clone(),
        }
    );
    assert_eq!(
        row_snapshot(&app.db, "calendar_event", &copy.id.0).await,
        None
    );
    let replies = sent_mail(&app, &owner.email, 1).await;
    assert_eq!(
        replies
            .iter()
            .map(|m| m.subject.as_str())
            .collect::<Vec<_>>(),
        ["Declined: Planning"]
    );

    let second = staged_copy(&mut attendee, &owner, &event).await;
    let bulk: BulkEventResult = ok(attendee
        .post(
            "/api/events/bulk",
            json!({"action": "delete", "eventIds": [second.id]}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        (bulk.events_processed, bulk.message.as_str()),
        (1, "Successfully deleted 1 events")
    );
    assert!(
        row_snapshot(&app.db, "calendar_event", &second.id.0)
            .await
            .is_some(),
        "a bulk delete declines but keeps the tombstone"
    );
    assert_eq!(sent_mail(&app, &owner.email, 2).await.len(), 2);
}

#[tokio::test]
async fn cancelled_copies_can_be_edited_and_removed() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut attendee = app.user().await;
    let event = invite(&mut owner, &attendee.email).await;
    let uid = event.external_id.clone().expect("uid");
    let copy = staged_copy(&mut attendee, &owner, &event).await;
    let cancel = request_ics(&uid, "CANCEL", &owner.email, &attendee.email);
    assert_eq!(
        import(&mut attendee, &import_request(cancel, None)).await,
        summary(0, 1, &[])
    );
    let cancelled = lookup(&mut attendee, &uid).await.expect("copy");
    assert!(cancelled.is_cancelled);
    let error = ok(attendee
        .put(&format!("/api/events/{}", copy.id), json!({"color": "red"}))
        .await
        .expect_error(
            400,
            "Validation Error",
            "Event encryption requires an active encryption session.",
        ));
    assert_eq!(
        error["details"],
        json!({"field": "encryptedContent"}),
        "a plaintext copy in a writable calendar must be sealed to change"
    );
    let edited: Event = ok(attendee
        .put(
            &format!("/api/events/{}", copy.id),
            json!({"color": "red", "encryptedContent": fake_envelope()}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        (edited.color.as_deref(), edited.title.as_str()),
        (Some("red"), "")
    );
    let deleted: EventDeleted = ok(attendee
        .delete(&format!("/api/events/{}", copy.id))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        deleted.message,
        "Cancelled event removed from your calendar"
    );
    assert_no_mail(&app, &owner.email).await;
}

#[tokio::test]
async fn only_the_invited_attendee_can_rsvp() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut attendee = app.user().await;
    let mut stranger = app.user().await;
    let event = invite(&mut owner, &attendee.email).await;
    let copy = staged_copy(&mut attendee, &owner, &event).await;

    let error = ok(owner
        .post(
            &format!("/api/events/{}/rsvp", event.id),
            json!({"status": "accepted"}),
        )
        .await
        .expect_error(
            400,
            "Validation Error",
            "This event does not have an attendee invitation for your account.",
        ));
    assert_eq!(error["details"], json!({"field": "eventId"}));
    for (user, id) in [(&mut attendee, &event.id), (&mut stranger, &copy.id)] {
        ok(user
            .post(
                &format!("/api/events/{id}/rsvp"),
                json!({"status": "accepted"}),
            )
            .await
            .expect_error(400, "Validation Error", NOT_FOUND));
    }
    let error = ok(attendee
        .post(
            &format!("/api/events/{}/rsvp", copy.id),
            json!({"status": "maybe"}),
        )
        .await
        .expect_error(
            400,
            "Validation Error",
            "Invalid enum value. Expected 'accepted' | 'declined' | 'tentative', received 'maybe'",
        ));
    assert_eq!(error["details"]["issues"][0]["path"], json!("status"));
    ok(attendee
        .post(&format!("/api/events/{}/rsvp", copy.id), json!({"status": "pending"}))
        .await
        .expect_error(
            400,
            "Validation Error",
            "Invalid enum value. Expected 'accepted' | 'declined' | 'tentative', received 'pending'",
        ));
    expect_unknown_field(
        &attendee
            .post(
                &format!("/api/events/{}/rsvp", copy.id),
                json!({"status": "accepted", "eventId": event.id}),
            )
            .await,
        "eventId",
    );
    sqlx::query("UPDATE calendar_event SET subscription_id = 'suitesub' WHERE id = $1")
        .bind(&copy.id.0)
        .execute(&app.db)
        .await
        .expect("mark subscribed");
    ok(attendee
        .post(
            &format!("/api/events/{}/rsvp", copy.id),
            json!({"status": "accepted"}),
        )
        .await
        .expect_error(400, "Validation Error", NOT_FOUND));
    assert_eq!(
        lookup(&mut attendee, &event.external_id.clone().expect("uid")).await,
        None,
        "subscription rows are not invitations"
    );
    assert_no_mail(&app, &owner.email).await;
}

/// Every route on someone else's event answers the same not-found error.
async fn assert_unreachable(user: &mut TestUser, event: &Event) {
    let path = format!("/api/events/{}", event.id);
    for response in [
        user.get(&path).await,
        user.put(&path, json!({"color": "red"})).await,
        user.post(&format!("{path}/rsvp"), json!({"status": "accepted"}))
            .await,
        user.delete(&path).await,
    ] {
        ok(response.expect_error(400, "Validation Error", NOT_FOUND));
    }
}

#[tokio::test]
async fn removed_attendees_never_reach_the_organizers_event() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut attendee = app.user().await;
    let event = invite(&mut owner, &attendee.email).await;
    let copy = staged_copy(&mut attendee, &owner, &event).await;
    assert_unreachable(&mut attendee, &event).await;
    let before = row_snapshot(&app.db, "calendar_event", &event.id.0).await;

    let updated: Event = ok(owner
        .put(
            &format!("/api/events/{}", event.id),
            json!({"participants": []}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        people(&updated),
        [person(&owner.email, "organizer", "accepted")]
    );
    assert_unreachable(&mut attendee, &event).await;
    assert_eq!(
        row_snapshot(&app.db, "calendar_event", &event.id.0)
            .await
            .map(|row| row["encrypted_content"].clone()),
        before.map(|row| row["encrypted_content"].clone())
    );
    assert!(
        lookup(&mut attendee, &event.external_id.clone().expect("uid"))
            .await
            .is_some_and(|e| e.id == copy.id),
        "the attendee's own copy stays until the organizer sends a cancellation"
    );
    assert_eq!(
        sent_mail(&app, &attendee.email, 1).await.len(),
        1,
        "removal mails nothing"
    );
}

#[tokio::test]
async fn declining_from_mail_replies_and_records_a_tombstone() {
    let app = TestApp::spawn().await;
    let mut attendee = app.user().await;
    let organizer = guest();
    let uid = format!("{}@example.com", hex(8));
    let ics = request_ics(&uid, "REQUEST", &organizer, &attendee.email);
    let declined: InvitationDeclined = ok(attendee
        .post(
            "/api/events/invitations/decline-ics",
            json!({"icsContent": ics}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(declined, InvitationDeclined { declined: true });
    let replies = sent_mail(&app, &organizer, 1).await;
    assert_eq!(replies.len(), 1);
    assert_eq!(replies[0].subject, "Declined: Planning");
    assert_eq!(
        replies[0].text,
        format!("{} declined the invitation.", attendee.email),
        "a mail decline names the address"
    );
    let reply = unfold(replies[0].ics.as_deref().expect("ics"));
    assert!(reply.contains(&format!("UID:{uid}\r\n")), "{reply}");
    assert!(
        reply.contains(&format!(
            "ATTENDEE;PARTSTAT=DECLINED:mailto:{}\r\n",
            attendee.email
        )),
        "{reply}"
    );

    let tombstone = lookup(&mut attendee, &uid).await.expect("tombstone");
    assert_eq!(tombstone.calendar.name, "Invitations");
    assert!(people(&tombstone).contains(&person(&attendee.email, "attendee", "declined")));
    assert_eq!(
        import(&mut attendee, &import_request(ics.clone(), None)).await,
        summary(0, 0, &[])
    );
    ok(attendee
        .post(
            "/api/events/invitations/decline-ics",
            json!({"icsContent": ics}),
        )
        .await
        .expect_status(200));
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM calendar_event WHERE user_id = $1",
            &attendee.id
        )
        .await,
        1,
        "declining twice keeps one tombstone"
    );
    assert_eq!(sent_mail(&app, &organizer, 2).await.len(), 2);
}

#[tokio::test]
async fn replies_never_go_to_yourself_or_reserved_addresses() {
    let app = TestApp::spawn().await;
    let mut attendee = app.user().await;
    let mut checked = Vec::new();
    for organizer in [
        attendee.email.clone(),
        format!("noreply+{}@example.com", hex(4)),
    ] {
        let uid = format!("{}@example.com", hex(8));
        let ics = request_ics(&uid, "REQUEST", &organizer, &attendee.email);
        ok(attendee
            .post(
                "/api/events/invitations/decline-ics",
                json!({"icsContent": ics}),
            )
            .await
            .expect_status(200));
        checked.push(organizer);
    }
    for organizer in &checked {
        assert_no_mail(&app, organizer).await;
    }
    let empty: InvitationDeclined = ok(attendee
        .post(
            "/api/events/invitations/decline-ics",
            json!({"icsContent": "BEGIN:VCALENDAR\r\nEND:VCALENDAR"}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert!(empty.declined, "nothing to decline still answers declined");
    let error = ok(attendee
        .post(
            "/api/events/invitations/decline-ics",
            json!({"icsContent": ""}),
        )
        .await
        .expect_error(
            400,
            "Validation Error",
            "String must contain at least 1 character(s)",
        ));
    assert_eq!(error["details"]["issues"][0]["path"], json!("icsContent"));
}

#[tokio::test]
async fn invitation_lookups_are_validated_and_scoped() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut stranger = app.user().await;
    let event = invite(&mut owner, &guest()).await;
    let uid = event.external_id.clone().expect("uid");
    assert_eq!(
        lookup(&mut stranger, &uid).await,
        None,
        "scoped to the caller"
    );
    let cases = [
        (
            "externalId=",
            "String must contain at least 1 character(s)",
            "externalId",
        ),
        ("syncRemote=true", "Required", "externalId"),
        (
            "externalId=x&syncRemote=maybe",
            "Expected boolean, received string",
            "syncRemote",
        ),
    ];
    for (query, message, path) in cases {
        let error = ok(owner
            .get(&format!("/api/events/invitations/by-external-id?{query}"))
            .await
            .expect_error(400, "Validation Error", message));
        assert_eq!(
            error["details"]["issues"][0]["path"],
            json!(path),
            "{query}"
        );
    }
    let long = "x".repeat(513);
    ok(owner
        .get(&format!(
            "/api/events/invitations/by-external-id?externalId={long}"
        ))
        .await
        .expect_error(
            400,
            "Validation Error",
            "String must contain at most 512 character(s)",
        ));
    let error = ok(owner
        .get("/api/events/invitations/by-external-id?externalId=%20%20")
        .await
        .expect_error(400, "Validation Error", "External event id is required"));
    assert_eq!(error["details"], json!({"field": "externalId"}));
    for flag in ["true", "false", ""] {
        let found: InvitationLookup = ok(owner
            .get(&format!(
                "/api/events/invitations/by-external-id?externalId=%20{}%20&syncRemote={flag}",
                percent_encode(&uid)
            ))
            .await
            .expect_status(200)
            .and_then(|r| r.dto()));
        assert_eq!(
            found.event.map(|e| e.id),
            Some(event.id.clone()),
            "trimmed, {flag}"
        );
    }
}

#[tokio::test]
async fn invitation_imports_are_validated() {
    let app = TestApp::spawn().await;
    let mut attendee = app.user().await;
    let cases = [
        (
            json!({"icsContent": ""}),
            "String must contain at least 1 character(s)",
            "icsContent",
        ),
        (
            json!({"icsContent": "x", "status": "declined"}),
            "Invalid enum value. Expected 'accepted' | 'tentative', received 'declined'",
            "status",
        ),
        (
            json!({"icsContent": "x", "calendarId": "c".repeat(65)}),
            "String must contain at most 64 character(s)",
            "calendarId",
        ),
        (
            json!({"icsContent": "x", "encryption": [{"externalId": "", "encryptedContent": "x"}]}),
            "String must contain at least 1 character(s)",
            "encryption.0.externalId",
        ),
        (
            json!({"icsContent": "x", "encryption": [{"externalId": "u", "encryptedContent": "x", "blindIndexTokens": [""]}]}),
            "String must contain at least 1 character(s)",
            "encryption.0.blindIndexTokens.0",
        ),
        (
            json!({"icsContent": "x".repeat(1_048_577)}),
            "String must contain at most 1048576 character(s)",
            "icsContent",
        ),
    ];
    for (body, message, path) in cases {
        let error = ok(attendee
            .post("/api/events/invitations/import-ics", body)
            .await
            .expect_error(400, "Validation Error", message));
        assert_eq!(error["details"]["issues"][0]["path"], json!(path), "{path}");
    }
    expect_unknown_field(
        &attendee
            .post(
                "/api/events/invitations/import-ics",
                json!({"icsContent": "x", "encryption": [{"externalId": "u", "encryptedContent": "x", "title": "Plain"}]}),
            )
            .await,
        "title",
    );
    assert_eq!(
        import(
            &mut attendee,
            &import_request("BEGIN:VCALENDAR\r\nEND:VCALENDAR".into(), None)
        )
        .await,
        summary(
            0,
            0,
            &["Decrypted mail invitation: no valid ICS events found."]
        )
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM calendar_event WHERE user_id = $1",
            &attendee.id
        )
        .await,
        0
    );
}

#[tokio::test]
async fn imports_with_ciphertext_store_no_plaintext() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut attendee = app.user().await;
    let personal = calendar_id(&mut attendee, "Personal").await;
    let event = invite(&mut owner, &attendee.email).await;
    let uid = event.external_id.clone().expect("uid");
    let ics = request_ics(&uid, "REQUEST", &owner.email, &attendee.email);
    let staged = staged_copy(&mut attendee, &owner, &event).await;
    assert_eq!(
        stored_content(&app.db, &staged.id.0).await.title,
        "Planning"
    );

    let ciphertext = fake_envelope();
    let mut request = import_request(ics, Some("accepted"));
    request.encryption = Some(vec![InvitationEncryptionEntry {
        external_id: uid.clone(),
        encrypted_content: ciphertext.clone(),
        blind_index_tokens: Some(vec!["invite-token".into()]),
        encryption_key_version: Some(2),
    }]);
    assert_eq!(import(&mut attendee, &request).await, summary(0, 1, &[]));
    assert_eq!(
        stored_content(&app.db, &staged.id.0).await,
        StoredContent {
            title: String::new(),
            description: None,
            location: None,
            encrypted_content: Some(ciphertext),
            blind_index_tokens: Some(r#"["invite-token"]"#.into()),
            encryption_state: "encrypted".into(),
            encryption_key_version: 2,
        },
        "the accepted copy is sealed in place"
    );
    let accepted = lookup(&mut attendee, &uid).await.expect("copy");
    assert_eq!(accepted.calendar.id.0, personal);
    assert!(people(&accepted).contains(&person(&attendee.email, "attendee", "accepted")));

    let sealed: Event = ok(attendee
        .post(
            &format!("/api/events/{}/rsvp", staged.id),
            json!({"status": "tentative"}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(sealed.title, "");
    let replies = sent_mail(&app, &owner.email, 1).await;
    assert_eq!(
        replies
            .iter()
            .map(|m| m.subject.as_str())
            .collect::<Vec<_>>(),
        ["Tentative: Invitation"],
        "a sealed copy replies with a generic title"
    );
}
