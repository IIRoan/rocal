//! Calendar ICS share links and the public `/api/calendars/shared/:token` feed.

use reqwest::Method;
use serde_json::json;
use solace_api_tests::client::ApiResponse;
use solace_api_types::calendars::{
    CalendarShareLink, CreateCalendarRequest, DisableShareLinkResponse,
};

use crate::calendars::{
    CalendarRow, EVENT_STAMP, EventRow, calendar_row, create_calendar, create_calendar_with,
    event_row, insert_calendar, insert_event,
};
use crate::helpers::{
    TestApp, TestUser, expect_invalid, expect_plain_error, expect_unauthorized,
    expect_unknown_field, hex, ok,
};

const NOT_FOUND: &str = "Calendar not found or access denied";
const FEED_NOT_FOUND: &str = "Shared calendar not found";

fn share_link_path(calendar_id: &str) -> String {
    format!("/api/calendars/{calendar_id}/share-link")
}

/// Enables sharing with no request body at all, as shipped clients do.
async fn enable(user: &mut TestUser, calendar_id: &str) -> CalendarShareLink {
    ok(user
        .agent
        .send(Method::POST, &share_link_path(calendar_id), None, &[])
        .await
        .and_then(|r| r.expect_status(200))
        .and_then(|r| r.dto()))
}

fn token_of(link: &CalendarShareLink) -> String {
    let url = link.share_url.as_deref().expect("share url");
    url.rsplit('/').next().expect("token").to_owned()
}

async fn feed(app: &TestApp, token: &str) -> ApiResponse {
    ok(app
        .anonymous()
        .get(&format!("/api/calendars/shared/{token}"))
        .await)
}

fn expect_feed_not_found(response: &ApiResponse) {
    let body = ok(response.expect_error(404, "Not Found", FEED_NOT_FOUND));
    assert!(body["requestId"].is_string(), "{body}");
}

fn header<'a>(response: &'a ApiResponse, name: &str) -> &'a str {
    response
        .headers
        .get(name)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
}

/// RFC 5545 folding as the backend does it: greedy per code point, 75 octets, then 74 after the leading space.
fn fold(line: &str) -> String {
    let mut folded = String::new();
    let (mut octets, mut limit) = (0, 75);
    for character in line.chars() {
        if octets > 0 && octets + character.len_utf8() > limit {
            folded.push_str("\r\n ");
            (octets, limit) = (0, 74);
        }
        folded.push(character);
        octets += character.len_utf8();
    }
    folded
}

fn ics(lines: &[String]) -> String {
    let folded: Vec<String> = lines.iter().map(|line| fold(line)).collect();
    format!("{}\r\n", folded.join("\r\n"))
}

async fn share_state(app: &TestApp, calendar_id: &str) -> (bool, Option<String>) {
    sqlx::query_as("SELECT ics_share_enabled, ics_share_token FROM calendar WHERE id = $1")
        .bind(calendar_id)
        .fetch_one(&app.db)
        .await
        .expect("calendar")
}

#[tokio::test]
async fn anonymous_callers_are_refused() {
    let app = TestApp::spawn().await;
    let mut anon = app.anonymous();
    let path = share_link_path("some-id");
    expect_unauthorized(&ok(anon.get(&path).await));
    expect_unauthorized(&ok(anon.post(&path, json!({})).await));
    expect_unauthorized(&ok(anon.delete(&path).await));
}

#[tokio::test]
async fn a_new_calendar_is_not_shared() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar = create_calendar(&mut user, "Private", "blue").await;
    let link: CalendarShareLink = ok(user
        .get(&share_link_path(&calendar.id.0))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        link,
        CalendarShareLink {
            calendar_id: calendar.id.clone(),
            calendar_name: "Private".into(),
            enabled: false,
            share_url: None,
        }
    );
    assert_eq!(share_state(&app, &calendar.id.0).await, (false, None));
}

#[tokio::test]
async fn enabling_issues_a_public_url_and_keeps_its_token() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar = create_calendar(&mut user, "Team", "blue").await;
    let path = share_link_path(&calendar.id.0);

    let link = enable(&mut user, &calendar.id.0).await;
    let token = token_of(&link);
    assert_eq!(token.len(), 40);
    assert!(token.chars().all(|c| c.is_ascii_alphanumeric()), "{token}");
    // The test backends run with BACKEND_URL set to their own base URL.
    assert_eq!(
        link,
        CalendarShareLink {
            calendar_id: calendar.id.clone(),
            calendar_name: "Team".into(),
            enabled: true,
            share_url: Some(format!(
                "{}/api/calendars/shared/{token}",
                app.public_api_url
            )),
        }
    );
    assert_eq!(
        share_state(&app, &calendar.id.0).await,
        (true, Some(token.clone()))
    );

    for body in [json!({}), json!(null), json!({"regenerate": false})] {
        let again: CalendarShareLink = ok(user
            .post(&path, body)
            .await
            .expect_status(200)
            .and_then(|r| r.dto()));
        assert_eq!(again, link, "enabling again keeps the token");
    }
    let read: CalendarShareLink = ok(user.get(&path).await.dto());
    assert_eq!(read, link);
    let listed = calendar_row(&app.db, &calendar.id.0).await.expect("row");
    assert_eq!(listed["ics_share_token"], json!(token));

    let response = feed(&app, &token).await;
    assert_eq!(response.status.as_u16(), 200);
    assert_eq!(
        response.text(),
        ics(&[
            "BEGIN:VCALENDAR".into(),
            "VERSION:2.0".into(),
            "PRODID:-//Solace Calendar//Calendar Export//EN".into(),
            "CALSCALE:GREGORIAN".into(),
            "METHOD:PUBLISH".into(),
            "X-WR-CALNAME:Team".into(),
            format!("X-WR-CALDESC:Shared calendar from {}", user.name),
            "X-WR-TIMEZONE:Europe/Amsterdam".into(),
            format!("URL:{}", link.share_url.clone().expect("url")),
            "END:VCALENDAR".into(),
        ]),
        "an empty calendar falls back to the default timezone"
    );
}

#[tokio::test]
async fn regenerating_rotates_the_token_and_revokes_the_old_feed() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar = create_calendar(&mut user, "Team", "blue").await;
    let old = token_of(&enable(&mut user, &calendar.id.0).await);

    let rotated: CalendarShareLink = ok(user
        .post(
            &share_link_path(&calendar.id.0),
            json!({"regenerate": true}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    let new = token_of(&rotated);
    assert_ne!(new, old);
    assert!(rotated.enabled);
    assert_eq!(
        share_state(&app, &calendar.id.0).await,
        (true, Some(new.clone()))
    );

    expect_feed_not_found(&feed(&app, &old).await);
    assert_eq!(feed(&app, &new).await.status.as_u16(), 200);
}

#[tokio::test]
async fn disabling_revokes_the_feed_until_a_new_link_is_issued() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar = create_calendar(&mut user, "Team", "blue").await;
    let path = share_link_path(&calendar.id.0);
    let old = token_of(&enable(&mut user, &calendar.id.0).await);
    let before = calendar_row(&app.db, &calendar.id.0).await.expect("row");

    let disabled: DisableShareLinkResponse = ok(user
        .delete(&path)
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(disabled, DisableShareLinkResponse { success: true });
    assert_eq!(share_state(&app, &calendar.id.0).await, (false, None));
    let after = calendar_row(&app.db, &calendar.id.0).await.expect("row");
    assert_ne!(
        after["updated_at"], before["updated_at"],
        "updatedAt is bumped"
    );
    expect_feed_not_found(&feed(&app, &old).await);
    let read: CalendarShareLink = ok(user.get(&path).await.dto());
    assert_eq!((read.enabled, read.share_url), (false, None));

    let again: DisableShareLinkResponse = ok(user
        .delete(&path)
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert!(again.success, "disabling twice is fine");

    let reissued = token_of(&enable(&mut user, &calendar.id.0).await);
    assert_ne!(reissued, old, "a disabled link never comes back");
    expect_feed_not_found(&feed(&app, &old).await);
    assert_eq!(feed(&app, &reissued).await.status.as_u16(), 200);
}

#[tokio::test]
async fn the_feed_serves_top_level_plaintext_events_as_ics() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar = create_calendar(&mut user, "Team, Feed; Ü", "blue").await;
    let elsewhere = create_calendar(&mut user, "Elsewhere", "blue").await;
    let id = &calendar.id.0;
    let standup = insert_event(
        &app.db,
        &user.id,
        id,
        EventRow {
            title: "Standup, daily; team",
            description: Some("Line one\nline two"),
            location: Some("Room 4"),
            start: Some("2026-11-02 09:00:00"),
            end: Some("2026-11-02 09:30:00"),
            timezone: Some("Europe/Amsterdam"),
            ..Default::default()
        },
    )
    .await;
    let holiday = insert_event(
        &app.db,
        &user.id,
        id,
        EventRow {
            title: "Holiday",
            start: Some("2026-12-24 23:00:00"),
            end: Some("2026-12-25 22:59:59"),
            all_day: true,
            timezone: Some("Europe/Amsterdam"),
            ..Default::default()
        },
    )
    .await;
    let recurring = insert_event(
        &app.db,
        &user.id,
        id,
        EventRow {
            title: "Weekly sync",
            start: Some("2026-10-05 10:00:00"),
            end: Some("2026-10-05 10:00:00"),
            timezone: Some("America/New_York"),
            recurrence: Some(
                r#"{"frequency":"weekly","interval":2,"byWeekDay":[1,3],"until":"2027-01-01T00:00:00.000Z"}"#,
            ),
            external_id: Some("ext-uid-123@example.com"),
            ..Default::default()
        },
    )
    .await;
    let long_location = "Grüße aus München – Konferenzraum Süd, Gebäude 7, Etage 3".repeat(2);
    let offsite = insert_event(
        &app.db,
        &user.id,
        id,
        EventRow {
            title: "Offsite",
            location: Some(&long_location),
            start: Some("2026-11-20 08:00:00"),
            end: Some("2026-11-20 16:00:00"),
            ..Default::default()
        },
    )
    .await;
    // Detached instances and other calendars stay out of the feed.
    insert_event(
        &app.db,
        &user.id,
        id,
        EventRow {
            title: "Moved instance",
            parent_event_id: Some(&recurring),
            ..Default::default()
        },
    )
    .await;
    insert_event(
        &app.db,
        &user.id,
        &elsewhere.id.0,
        EventRow {
            title: "Not shared",
            ..Default::default()
        },
    )
    .await;
    // Participants are not exported.
    sqlx::query(
        "INSERT INTO event_participant (id, event_id, email, display_name, status, role, created_at, updated_at) \
         VALUES ($1, $2, 'guest@example.com', 'Guest', 'accepted', 'attendee', now(), now())",
    )
    .bind(format!("suitepart{}", hex(6)))
    .bind(&standup)
    .execute(&app.db)
    .await
    .expect("insert participant");
    let link = enable(&mut user, id).await;
    let token = token_of(&link);

    let response = feed(&app, &token).await;
    assert_eq!(response.status.as_u16(), 200, "{}", response.text());
    assert_eq!(
        header(&response, "content-type"),
        "text/calendar; charset=utf-8"
    );
    assert_eq!(
        header(&response, "content-disposition"),
        "inline; filename=\"team-feed.ics\""
    );
    assert_eq!(header(&response, "cache-control"), "no-store, max-age=0");

    let body = response.text();
    let stamp = body
        .split("\r\n")
        .find_map(|line| line.strip_prefix("DTSTAMP:"))
        .expect("DTSTAMP")
        .to_owned();
    assert!(
        stamp.len() == 16 && stamp.as_bytes()[8] == b'T' && stamp.ends_with('Z'),
        "{stamp}"
    );
    let stamped = |uid: String, rest: &[&str]| {
        let mut lines = vec![
            "BEGIN:VEVENT".to_owned(),
            format!("UID:{uid}"),
            format!("DTSTAMP:{stamp}"),
            "CREATED:20261001T080000Z".into(),
            "LAST-MODIFIED:20261001T080000Z".into(),
        ];
        lines.extend(rest.iter().map(|line| (*line).to_owned()));
        lines.push("END:VEVENT".into());
        lines
    };
    let mut expected: Vec<String> = vec![
        "BEGIN:VCALENDAR".into(),
        "VERSION:2.0".into(),
        "PRODID:-//Solace Calendar//Calendar Export//EN".into(),
        "CALSCALE:GREGORIAN".into(),
        "METHOD:PUBLISH".into(),
        "X-WR-CALNAME:Team\\, Feed\\; Ü".into(),
        format!("X-WR-CALDESC:Shared calendar from {}", user.name),
        "X-WR-TIMEZONE:America/New_York".into(),
        format!("URL:{}/api/calendars/shared/{token}", app.public_api_url),
    ];
    expected.extend(stamped(
        "ext-uid-123@example.com".into(),
        &[
            "SUMMARY:Weekly sync",
            "DTSTART:20261005T100000Z",
            "DTEND:20261005T110000Z",
            "RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20270101T000000Z;BYDAY=MO,WE",
        ],
    ));
    expected.extend(stamped(
        format!("{standup}@solace-calendar.local"),
        &[
            "SUMMARY:Standup\\, daily\\; team",
            "DTSTART:20261102T090000Z",
            "DTEND:20261102T093000Z",
            "DESCRIPTION:Line one\\nline two",
            "LOCATION:Room 4",
        ],
    ));
    let location_line = format!("LOCATION:{}", long_location.replace(',', "\\,"));
    expected.extend(stamped(
        format!("{offsite}@solace-calendar.local"),
        &[
            "SUMMARY:Offsite",
            "DTSTART:20261120T080000Z",
            "DTEND:20261120T160000Z",
            &location_line,
        ],
    ));
    expected.extend(stamped(
        format!("{holiday}@solace-calendar.local"),
        &[
            "SUMMARY:Holiday",
            "DTSTART;VALUE=DATE:20261225",
            "DTEND;VALUE=DATE:20261226",
        ],
    ));
    expected.push("END:VCALENDAR".into());
    assert_eq!(body, ics(&expected));
    assert!(body.contains("\r\n "), "long lines are folded");
}

#[tokio::test]
async fn the_feed_token_may_carry_an_ics_suffix_and_spaces() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar = create_calendar(&mut user, "Team", "blue").await;
    let token = token_of(&enable(&mut user, &calendar.id.0).await);
    for (requested, source) in [
        (format!("{token}.ics"), format!("{token}.ics")),
        (format!("{token}.ICS"), format!("{token}.ICS")),
        (format!("%20{token}%20"), format!("%20{token}%20")),
    ] {
        let response = feed(&app, &requested).await;
        assert_eq!(response.status.as_u16(), 200, "{requested}");
        let unfolded = response.text().replace("\r\n ", "");
        let url = format!(
            "URL:{}/api/calendars/shared/{source}\r\n",
            app.public_api_url
        );
        assert!(
            unfolded.contains(&url),
            "the feed links the token as requested: {unfolded}"
        );
    }
}

#[tokio::test]
async fn unknown_or_blank_tokens_are_not_found() {
    let app = TestApp::spawn().await;
    for token in ["nope", "%20", ".ics", "%20.ICS"] {
        expect_feed_not_found(&feed(&app, token).await);
    }
}

#[tokio::test]
async fn encrypted_events_block_sharing_and_the_feed() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let sealed = EventRow {
        title: "",
        encrypted_content: Some(r#"{"version":1}"#),
        encryption_state: Some("encrypted"),
        ..Default::default()
    };

    let locked = create_calendar(&mut user, "Locked", "blue").await;
    insert_event(&app.db, &user.id, &locked.id.0, sealed).await;
    expect_plain_error(
        &user.post(&share_link_path(&locked.id.0), json!({})).await,
        "ICS sharing is unavailable while this calendar contains encrypted events.",
    );
    assert_eq!(share_state(&app, &locked.id.0).await, (false, None));

    let shared = create_calendar(&mut user, "Shared", "blue").await;
    let token = token_of(&enable(&mut user, &shared.id.0).await);
    let parent = insert_event(
        &app.db,
        &user.id,
        &shared.id.0,
        EventRow {
            title: "Visible",
            ..Default::default()
        },
    )
    .await;
    let child = EventRow {
        title: "",
        encrypted_content: Some(r#"{"version":1}"#),
        encryption_state: Some("encrypted"),
        parent_event_id: Some(&parent),
        ..Default::default()
    };
    insert_event(&app.db, &user.id, &shared.id.0, child).await;
    // The feed ignores detached instances, but enabling again counts them.
    let response = feed(&app, &token).await;
    assert_eq!(response.status.as_u16(), 200);
    assert!(response.text().contains("SUMMARY:Visible"));
    expect_plain_error(
        &user.post(&share_link_path(&shared.id.0), json!({})).await,
        "ICS sharing is unavailable while this calendar contains encrypted events.",
    );

    let top_level = EventRow {
        title: "",
        encrypted_content: Some(r#"{"version":1}"#),
        encryption_state: Some("encrypted"),
        ..Default::default()
    };
    insert_event(&app.db, &user.id, &shared.id.0, top_level).await;
    let blocked = feed(&app, &token).await;
    let body = ok(blocked.expect_error(
        400,
        "Validation Error",
        "This shared calendar contains encrypted event details and cannot be exported.",
    ));
    assert!(body.get("details").is_none(), "{body}");
}

#[tokio::test]
async fn disabling_drops_plaintext_shadows_beside_ciphertext() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar = create_calendar(&mut user, "Shared", "blue").await;
    let elsewhere = create_calendar(&mut user, "Elsewhere", "blue").await;
    enable(&mut user, &calendar.id.0).await;
    let shadow = |state| EventRow {
        title: "Shadow title",
        description: Some("Shadow body"),
        location: Some("Shadow room"),
        encrypted_content: Some(r#"{"version":1}"#),
        encryption_state: Some(state),
        ..Default::default()
    };
    let shadow_write =
        insert_event(&app.db, &user.id, &calendar.id.0, shadow("shadow_write")).await;
    let marked_plaintext =
        insert_event(&app.db, &user.id, &calendar.id.0, shadow("plaintext")).await;
    let sealed = insert_event(&app.db, &user.id, &calendar.id.0, shadow("encrypted")).await;
    let plain = insert_event(
        &app.db,
        &user.id,
        &calendar.id.0,
        EventRow {
            title: "Plain",
            description: Some("Plain body"),
            ..Default::default()
        },
    )
    .await;
    let other = insert_event(&app.db, &user.id, &elsewhere.id.0, shadow("shadow_write")).await;
    let untouched = [
        (sealed.clone(), event_row(&app.db, &sealed).await),
        (plain.clone(), event_row(&app.db, &plain).await),
        (other.clone(), event_row(&app.db, &other).await),
    ];

    ok(user
        .delete(&share_link_path(&calendar.id.0))
        .await
        .expect_status(200));

    for event in [shadow_write, marked_plaintext] {
        let row = event_row(&app.db, &event).await.expect("event");
        assert_eq!(
            (
                &row["title"],
                &row["description"],
                &row["location"],
                &row["encryption_state"]
            ),
            (&json!(""), &json!(null), &json!(null), &json!("encrypted"))
        );
        assert_eq!(row["encrypted_content"], json!(r#"{"version":1}"#));
        assert_ne!(row["updated_at"], json!(EVENT_STAMP), "updatedAt is bumped");
    }
    for (event, before) in untouched {
        assert_eq!(event_row(&app.db, &event).await, before);
    }
}

#[tokio::test]
async fn synced_calendars_cannot_be_shared() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let synced = insert_calendar(
        &app.db,
        &user.id,
        CalendarRow {
            name: "Synced",
            kind: "subscribed",
            is_sync_only: true,
            ..Default::default()
        },
    )
    .await;
    let path = share_link_path(&synced);
    let message = "Cannot share a synced calendar. This calendar is read-only and synced from an external subscription.";
    expect_plain_error(&user.get(&path).await, message);
    expect_plain_error(&user.post(&path, json!({})).await, message);
    expect_plain_error(
        &user.delete(&path).await,
        "Cannot modify sharing for a synced calendar.",
    );
    assert_eq!(share_state(&app, &synced).await, (false, None));
}

#[tokio::test]
async fn other_users_calendars_behave_as_not_found() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut other = app.user().await;
    let calendar = create_calendar(&mut owner, "Team", "blue").await;
    let token = token_of(&enable(&mut owner, &calendar.id.0).await);
    let path = share_link_path(&calendar.id.0);

    expect_plain_error(&other.get(&path).await, NOT_FOUND);
    expect_plain_error(
        &other.post(&path, json!({"regenerate": true})).await,
        NOT_FOUND,
    );
    expect_plain_error(&other.delete(&path).await, NOT_FOUND);
    expect_plain_error(
        &owner.get(&share_link_path("no-such-calendar")).await,
        NOT_FOUND,
    );

    assert_eq!(
        share_state(&app, &calendar.id.0).await,
        (true, Some(token.clone()))
    );
    assert_eq!(feed(&app, &token).await.status.as_u16(), 200);
}

#[tokio::test]
async fn the_share_link_body_is_validated() {
    let app = TestApp::spawn().await;
    let mut victim = app.user().await;
    let mut user = app.user().await;
    let calendar = create_calendar(&mut user, "Team", "blue").await;
    let path = share_link_path(&calendar.id.0);

    expect_invalid(
        &user.post(&path, json!({"regenerate": "yes"})).await,
        "Expected boolean, received string",
        "regenerate",
    );
    expect_invalid(
        &user.post(&path, json!({"regenerate": null})).await,
        "Expected boolean, received null",
        "regenerate",
    );
    expect_invalid(
        &user.post(&path, json!([])).await,
        "Expected object, received array",
        "root",
    );
    expect_unknown_field(
        &user.post(&path, json!({"userId": victim.id})).await,
        "userId",
    );
    assert_eq!(share_state(&app, &calendar.id.0).await, (false, None));

    let victims = create_calendar(&mut victim, "Victim", "blue").await;
    assert_eq!(share_state(&app, &victims.id.0).await, (false, None));
}

#[tokio::test]
async fn encrypted_calendar_names_leave_as_a_neutral_label() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar = create_calendar_with(
        &mut user,
        &CreateCalendarRequest {
            color: "blue".into(),
            encrypted_name: Some("ciphertext".into()),
            ..Default::default()
        },
    )
    .await;
    // Without a display name the feed names the owner by mail address.
    sqlx::query("UPDATE \"user\" SET name = '' WHERE id = $1")
        .bind(&user.id)
        .execute(&app.db)
        .await
        .expect("blank name");

    let link = enable(&mut user, &calendar.id.0).await;
    assert_eq!(link.calendar_name, "", "the stored name, not the label");
    let response = feed(&app, &token_of(&link)).await;
    assert_eq!(
        header(&response, "content-disposition"),
        "inline; filename=\"solace-calendar.ics\""
    );
    let unfolded = response.text().replace("\r\n ", "");
    assert!(
        unfolded.contains("\r\nX-WR-CALNAME:Solace calendar\r\n"),
        "{unfolded}"
    );
    assert!(
        unfolded.contains(&format!(
            "\r\nX-WR-CALDESC:Shared calendar from {}\r\n",
            user.email
        )),
        "{unfolded}"
    );
}
