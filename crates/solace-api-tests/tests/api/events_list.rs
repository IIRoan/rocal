//! `GET /api/events` range listing with recurrence expansion, `/api/events/search` and `/api/events/search-corpus`.

use serde_json::{Value, json};
use solace_api_types::events::{Event, EventSearchCorpus, EventSearchResults, RecurrenceException};
use solace_api_types::recurring::RecurringDeleted;

use crate::event_fixtures::{
    DEFAULT_CALENDARS, FUTURE_END, FUTURE_START, calendar_id, create_event, encrypted_event,
    insert_calendar, insert_plaintext_event, list_events, seed_default_calendars,
};
use crate::helpers::{TestApp, TestUser, count, hex, ok};

const MARCH_START: &str = "2099-03-01T00:00:00.000Z";
const MARCH_END: &str = "2099-03-31T23:59:59.000Z";

fn ids(events: &[Event]) -> Vec<String> {
    events.iter().map(|event| event.id.0.clone()).collect()
}

fn starts(events: &[Event]) -> Vec<String> {
    events.iter().map(|event| event.start.0.clone()).collect()
}

async fn insert_participant(
    app: &TestApp,
    event_id: &str,
    user_id: Option<&str>,
    email: &str,
    role: &str,
    status: &str,
) {
    sqlx::query(
        "INSERT INTO event_participant (id, event_id, user_id, email, display_name, role, status, created_at, updated_at) \
         VALUES ($1, $2, $3, $4, NULL, $5, $6, now(), now())",
    )
    .bind(format!("suitepart{}", hex(8)))
    .bind(event_id)
    .bind(user_id)
    .bind(email)
    .bind(role)
    .bind(status)
    .execute(&app.db)
    .await
    .expect("insert participant");
}

async fn insert_category(app: &TestApp, user_id: &str, name: &str, active: bool) -> String {
    let id = format!("suitecat{}", hex(8));
    sqlx::query(
        "INSERT INTO event_category (id, name, color, is_active, user_id, created_at, updated_at) \
         VALUES ($1, $2, '#16a34a', $3, $4, now(), now())",
    )
    .bind(&id)
    .bind(name)
    .bind(active)
    .bind(user_id)
    .execute(&app.db)
    .await
    .expect("insert category");
    id
}

async fn series(user: &mut TestUser, calendar: &str, start: &str, end: &str, rule: &str) -> Event {
    let mut request = encrypted_event(calendar, start, end);
    request.recurrence = Some(rule.into());
    create_event(user, &request).await
}

async fn search(user: &mut TestUser, query: &str) -> EventSearchResults {
    ok(user
        .get(&format!("/api/events/search?{query}"))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()))
}

async fn corpus(user: &mut TestUser, query: &str) -> EventSearchCorpus {
    ok(user
        .get(&format!("/api/events/search-corpus?{query}"))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()))
}

#[tokio::test]
async fn the_first_list_creates_no_calendars() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let sql = "SELECT count(*) FROM calendar WHERE user_id = $1";
    assert_eq!(count(&app.db, sql, &user.id).await, 0);

    let list = list_events(&mut user, MARCH_START, MARCH_END).await;
    assert_eq!(
        (
            list.events.len(),
            list.categories.len(),
            list.calendars.len()
        ),
        (0, 0, 0)
    );
    assert_eq!(
        count(&app.db, sql, &user.id).await,
        0,
        "clients seed the encrypted set"
    );

    seed_default_calendars(&mut user).await;
    let list = list_events(&mut user, MARCH_START, MARCH_END).await;
    let colors: Vec<(&str, bool)> = list
        .calendars
        .iter()
        .map(|c| (c.color.as_str(), c.is_default))
        .collect();
    assert_eq!(colors.len(), 3);
    assert_eq!(colors[0], (DEFAULT_CALENDARS[0].1, true), "default first");
    assert!(list.calendars.iter().all(|c| c.user_id.0 == user.id
        && c.name.is_empty()
        && c.encrypted_name.is_some()
        && c.encryption_state == "encrypted"
        && c.kind == "owned"));
}
#[tokio::test]
async fn the_range_must_be_valid() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    for (query, path) in [
        (format!("start={MARCH_START}"), "end"),
        (format!("end={MARCH_END}"), "start"),
    ] {
        let error = ok(user
            .get(&format!("/api/events?{query}"))
            .await
            .expect_error(400, "Validation Error", "Required"));
        assert_eq!(error["details"]["issues"][0]["path"], json!(path));
    }
    let cases = [
        (
            format!("start=nope&end={MARCH_END}"),
            "Invalid start date format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)",
        ),
        (
            format!("start={MARCH_START}&end=nope"),
            "Invalid end date format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)",
        ),
        (
            format!("start={MARCH_END}&end={MARCH_START}"),
            "End date must be after start date",
        ),
        (
            format!("start={MARCH_START}&end={MARCH_START}"),
            "End date must be after start date",
        ),
        (
            format!("start=&end={MARCH_END}"),
            "Start and end date parameters are required",
        ),
    ];
    for (query, message) in cases {
        let error = ok(user
            .get(&format!("/api/events?{query}"))
            .await
            .expect_error(400, "Validation Error", message));
        assert!(error.get("details").is_none(), "{query}: {error}");
    }
    let list = list_events(&mut user, "2099-03-01", "2099-03-02").await;
    assert!(list.events.is_empty(), "date-only bounds parse");
}

#[tokio::test]
async fn events_overlapping_the_range_are_listed_by_start() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let mut other = app.user().await;
    let calendar = calendar_id(&mut user, "Work").await;
    let other_calendar = calendar_id(&mut other, "Work").await;
    let range_start = "2099-03-10T00:00:00.000Z";
    let range_end = "2099-03-11T00:00:00.000Z";
    let mut created = Vec::new();
    for (start, end) in [
        ("2099-03-10T15:00:00.000Z", "2099-03-10T16:00:00.000Z"),
        ("2099-03-09T22:00:00.000Z", "2099-03-10T01:00:00.000Z"),
        ("2099-03-09T00:00:00.000Z", "2099-03-12T00:00:00.000Z"),
        ("2099-03-10T23:30:00.000Z", "2099-03-11T02:00:00.000Z"),
        ("2099-03-11T00:00:00.000Z", "2099-03-11T01:00:00.000Z"),
        ("2099-03-09T23:00:00.000Z", "2099-03-10T00:00:00.000Z"),
    ] {
        created.push(create_event(&mut user, &encrypted_event(&calendar, start, end)).await);
    }
    for (start, end) in [
        ("2099-03-08T10:00:00.000Z", "2099-03-08T11:00:00.000Z"),
        ("2099-03-11T00:00:01.000Z", "2099-03-11T01:00:00.000Z"),
    ] {
        create_event(&mut user, &encrypted_event(&calendar, start, end)).await;
    }
    create_event(
        &mut other,
        &encrypted_event(
            &other_calendar,
            "2099-03-10T12:00:00.000Z",
            "2099-03-10T13:00:00.000Z",
        ),
    )
    .await;

    let list = list_events(&mut user, range_start, range_end).await;
    assert_eq!(
        starts(&list.events),
        [
            "2099-03-09T00:00:00.000Z",
            "2099-03-09T22:00:00.000Z",
            "2099-03-09T23:00:00.000Z",
            "2099-03-10T15:00:00.000Z",
            "2099-03-10T23:30:00.000Z",
            "2099-03-11T00:00:00.000Z",
        ],
        "bounds are inclusive and spans count"
    );
    assert!(list.events.iter().all(|e| e.user_id.0 == user.id));
    let first = list
        .events
        .iter()
        .find(|e| e.id == created[0].id)
        .expect("listed");
    assert_eq!(first.is_recurring_instance, None);
    assert_eq!(first.recurrence_exceptions, None);
    assert_eq!(
        (first.calendar.id.0.as_str(), first.calendar.name.as_str()),
        (calendar.as_str(), "")
    );
    assert_eq!(
        first.participants.as_ref().map(|p| p[0].role.as_str()),
        Some("organizer")
    );
}

#[tokio::test]
async fn recurring_series_expand_into_instances() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar = calendar_id(&mut user, "Work").await;
    let weekly = series(
        &mut user,
        &calendar,
        "2099-03-02T09:00:00.000Z",
        "2099-03-02T10:30:00.000Z",
        r#"{"frequency":"weekly","interval":1,"count":4}"#,
    )
    .await;

    let list = list_events(&mut user, MARCH_START, MARCH_END).await;
    assert_eq!(
        ids(&list.events),
        [
            weekly.id.0.clone(),
            format!("{}_2099-03-09T09:00:00.000Z", weekly.id),
            format!("{}_2099-03-16T09:00:00.000Z", weekly.id),
            format!("{}_2099-03-23T09:00:00.000Z", weekly.id),
        ]
    );
    let original = &list.events[0];
    assert_eq!(original.is_recurring_instance, Some(false));
    assert_eq!(original.parent_event_id, None);
    assert_eq!(original.recurrence_exceptions, Some(vec![]));
    let instance = &list.events[1];
    assert_eq!(instance.is_recurring_instance, Some(true));
    assert_eq!(instance.parent_event_id.as_ref(), Some(&weekly.id));
    assert_eq!(
        (instance.start.0.as_str(), instance.end.0.as_str()),
        ("2099-03-09T09:00:00.000Z", "2099-03-09T10:30:00.000Z"),
        "instances keep the series duration"
    );
    assert_eq!(instance.encrypted_content, weekly.encrypted_content);
    assert_eq!(instance.recurrence, weekly.recurrence);
    assert_eq!(instance.created_at, weekly.created_at);

    let later = list_events(
        &mut user,
        "2099-03-10T00:00:00.000Z",
        "2099-03-20T00:00:00.000Z",
    )
    .await;
    assert_eq!(
        ids(&later.events),
        [format!("{}_2099-03-16T09:00:00.000Z", weekly.id)],
        "the series row only appears when its own start is in range"
    );
    let after = list_events(
        &mut user,
        "2099-03-24T00:00:00.000Z",
        "2099-06-01T00:00:00.000Z",
    )
    .await;
    assert!(after.events.is_empty(), "count ends the series");
}

#[tokio::test]
async fn recurrence_rules_expand_like_the_hand_written_engine() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar = calendar_id(&mut user, "Work").await;
    let cases = [
        (
            "2099-03-02T09:00:00.000Z",
            r#"{"frequency":"daily","interval":1,"byWeekDay":[1,2,3,4,5],"count":7}"#,
            vec![
                "2099-03-02T09:00:00.000Z",
                "2099-03-03T09:00:00.000Z",
                "2099-03-04T09:00:00.000Z",
                "2099-03-05T09:00:00.000Z",
                "2099-03-06T09:00:00.000Z",
                "2099-03-09T09:00:00.000Z",
                "2099-03-10T09:00:00.000Z",
            ],
        ),
        (
            "2099-03-02T09:00:00.000Z",
            r#"{"frequency":"weekly","interval":2,"byWeekDay":[1,3],"count":4}"#,
            vec![
                "2099-03-02T09:00:00.000Z",
                "2099-03-04T09:00:00.000Z",
                "2099-03-09T09:00:00.000Z",
                "2099-03-11T09:00:00.000Z",
            ],
        ),
        (
            "2099-01-31T09:00:00.000Z",
            r#"{"frequency":"monthly","interval":1,"count":3}"#,
            vec![
                "2099-01-31T09:00:00.000Z",
                "2099-02-28T09:00:00.000Z",
                "2099-03-28T09:00:00.000Z",
            ],
        ),
        (
            "2099-01-15T09:00:00.000Z",
            r#"{"frequency":"monthly","interval":1,"byMonthDay":[31],"count":3}"#,
            vec![
                "2099-01-15T09:00:00.000Z",
                "2099-02-28T09:00:00.000Z",
                "2099-03-31T09:00:00.000Z",
            ],
        ),
        (
            "2099-02-03T09:00:00.000Z",
            r#"{"frequency":"daily","interval":3,"until":"2099-02-09T09:00:00.000Z"}"#,
            vec![
                "2099-02-03T09:00:00.000Z",
                "2099-02-06T09:00:00.000Z",
                "2099-02-09T09:00:00.000Z",
            ],
        ),
        (
            "2099-02-10T09:00:00.000Z",
            r#"{"frequency":"yearly","interval":1,"byMonth":[3],"byMonthDay":[5],"count":2}"#,
            vec!["2099-02-10T09:00:00.000Z", "2100-03-05T09:00:00.000Z"],
        ),
    ];
    for (start, rule, expected) in cases {
        let end = start.replace("T09:00", "T10:00");
        let created = series(&mut user, &calendar, start, &end, rule).await;
        let list = list_events(
            &mut user,
            "2099-01-01T00:00:00.000Z",
            "2100-12-31T00:00:00.000Z",
        )
        .await;
        let got: Vec<String> = list
            .events
            .iter()
            .filter(|e| e.id == created.id || e.parent_event_id.as_ref() == Some(&created.id))
            .map(|e| e.start.0.clone())
            .collect();
        assert_eq!(got, expected, "{rule}");
        ok(user
            .delete(&format!("/api/events/{}", created.id))
            .await
            .expect_status(200));
    }
}

#[tokio::test]
async fn timezone_rules_keep_the_wall_clock_across_dst() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar = calendar_id(&mut user, "Work").await;
    let zoned = series(
        &mut user,
        &calendar,
        "2099-10-19T08:00:00.000Z",
        "2099-10-19T09:00:00.000Z",
        r#"{"frequency":"weekly","interval":1,"count":3,"timezone":"Europe/Amsterdam"}"#,
    )
    .await;
    let floating = series(
        &mut user,
        &calendar,
        "2099-10-19T08:30:00.000Z",
        "2099-10-19T09:30:00.000Z",
        r#"{"frequency":"weekly","interval":1,"count":3}"#,
    )
    .await;
    let list = list_events(
        &mut user,
        "2099-10-01T00:00:00.000Z",
        "2099-11-30T00:00:00.000Z",
    )
    .await;
    let of = |id: &str| -> Vec<String> {
        list.events
            .iter()
            .filter(|e| e.id.0.starts_with(id))
            .map(|e| e.start.0.clone())
            .collect()
    };
    assert_eq!(
        of(&zoned.id.0),
        [
            "2099-10-19T08:00:00.000Z",
            "2099-10-26T09:00:00.000Z",
            "2099-11-02T09:00:00.000Z"
        ],
        "10:00 Amsterdam time on both sides of the change"
    );
    assert_eq!(
        of(&floating.id.0),
        [
            "2099-10-19T08:30:00.000Z",
            "2099-10-26T08:30:00.000Z",
            "2099-11-02T08:30:00.000Z"
        ],
        "a rule without a timezone repeats in UTC"
    );
    let zoned_end = list
        .events
        .iter()
        .find(|e| e.id.0 == format!("{}_2099-10-26T09:00:00.000Z", zoned.id))
        .expect("instance");
    assert_eq!(zoned_end.end.0, "2099-10-26T10:00:00.000Z");
}

#[tokio::test]
async fn listed_series_apply_their_occurrence_exceptions() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar = calendar_id(&mut user, "Work").await;
    let weekly = series(
        &mut user,
        &calendar,
        "2099-03-02T09:00:00.000Z",
        "2099-03-02T10:00:00.000Z",
        r#"{"frequency":"weekly","interval":1,"count":4}"#,
    )
    .await;
    let deleted: RecurringDeleted = ok(user
        .delete(&format!(
            "/api/recurring/event/{}?deleteScope=this_only&occurrenceDate=2099-03-09T09:00:00.000Z",
            weekly.id
        ))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(deleted.action, "delete_occurrence");
    let modified: Event = ok(user
        .put(
            &format!("/api/recurring/event/{}", weekly.id),
            json!({
                "editScope": "this_only",
                "occurrenceDate": "2099-03-16T09:00:00.000Z",
                "updates": {"start": "2099-03-16T14:00:00.000Z", "end": "2099-03-16T15:00:00.000Z"},
            }),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));

    let list = list_events(&mut user, MARCH_START, MARCH_END).await;
    assert_eq!(
        ids(&list.events),
        [
            weekly.id.0.clone(),
            modified.id.0.clone(),
            format!("{}_2099-03-23T09:00:00.000Z", weekly.id),
        ],
        "the deleted occurrence is gone and the modified one lists once, as its own row"
    );
    let kinds = |event: &Event| -> Vec<(String, String, Option<String>)> {
        event
            .recurrence_exceptions
            .iter()
            .flatten()
            .map(|e| {
                (
                    e.exception_date.0.clone(),
                    e.kind.clone(),
                    e.modified_event_id.as_ref().map(|id| id.0.clone()),
                )
            })
            .collect()
    };
    let expected = vec![
        (
            "2099-03-09T09:00:00.000Z".to_owned(),
            "deleted".to_owned(),
            None,
        ),
        (
            "2099-03-16T09:00:00.000Z".to_owned(),
            "modified".to_owned(),
            Some(modified.id.0.clone()),
        ),
    ];
    assert_eq!(kinds(&list.events[0]), expected);
    assert_eq!(kinds(&list.events[2]), expected, "instances carry them too");
    let detached = &list.events[1];
    assert_eq!(detached.parent_event_id.as_ref(), Some(&weekly.id));
    assert_eq!(
        (
            detached.recurrence.as_deref(),
            detached.is_recurring_instance
        ),
        (None, None)
    );
    assert_eq!(detached.start.0, "2099-03-16T14:00:00.000Z");
    let stored: Vec<(String, String, Option<String>)> = sqlx::query_as(
        "SELECT to_char(exception_date, 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'), type, modified_event_id \
         FROM recurrence_exception WHERE parent_event_id = $1 ORDER BY exception_date",
    )
    .bind(&weekly.id.0)
    .fetch_all(&app.db)
    .await
    .expect("exceptions");
    assert_eq!(
        stored,
        [
            (
                "2099-03-09T09:00:00.000Z".to_owned(),
                "deleted".to_owned(),
                None
            ),
            (
                "2099-03-16T09:00:00.000Z".to_owned(),
                "modified".to_owned(),
                Some(modified.id.0.clone())
            ),
        ]
    );
    let exceptions: Vec<RecurrenceException> = ok(user
        .get("/api/events/search-corpus?limit=200")
        .await
        .expect_status(200)
        .and_then(|r| r.dto::<EventSearchCorpus>()))
    .events
    .into_iter()
    .filter_map(|e| e.recurrence_exceptions)
    .flatten()
    .collect();
    assert!(exceptions.is_empty(), "the corpus does not load exceptions");
}

#[tokio::test]
async fn a_split_series_lists_both_halves_and_the_detached_row_once() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar = calendar_id(&mut user, "Work").await;
    let weekly = series(
        &mut user,
        &calendar,
        "2099-03-02T09:00:00.000Z",
        "2099-03-02T10:00:00.000Z",
        r#"{"frequency":"weekly","interval":1}"#,
    )
    .await;
    let future: Event = ok(user
        .put(
            &format!("/api/recurring/event/{}", weekly.id),
            json!({
                "editScope": "this_and_future",
                "occurrenceDate": "2099-03-16T09:00:00.000Z",
                "updates": {"start": "2099-03-16T11:00:00.000Z"},
            }),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    let detached: Event = ok(user
        .put(
            &format!("/api/recurring/event/{}", future.id),
            json!({
                "editScope": "this_only",
                "occurrenceDate": "2099-03-23T11:00:00.000Z",
                "updates": {"start": "2099-03-24T11:00:00.000Z", "end": "2099-03-24T12:00:00.000Z"},
            }),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));

    let list = list_events(&mut user, MARCH_START, MARCH_END).await;
    // The moved occurrence's generated slot on 2099-03-23 is excepted.
    assert_eq!(
        ids(&list.events),
        [
            weekly.id.0.clone(),
            format!("{}_2099-03-09T09:00:00.000Z", weekly.id),
            future.id.0.clone(),
            detached.id.0.clone(),
            format!("{}_2099-03-30T11:00:00.000Z", future.id),
        ],
        "the old half stops before the split"
    );
    assert_eq!(list.events[2].parent_event_id.as_ref(), Some(&weekly.id));
    assert_eq!(list.events[2].is_recurring_instance, Some(false));
    let detached_row = list
        .events
        .iter()
        .find(|e| e.id == detached.id)
        .expect("detached row");
    assert_eq!(detached_row.parent_event_id.as_ref(), Some(&future.id));
}

#[tokio::test]
async fn rows_with_unreadable_rules_are_dropped_except_standups() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    // Feed events are the plaintext rows the server still reads.
    let calendar = insert_calendar(&app, &user.id, "subscribed", true).await;
    let garbage = insert_plaintext_event(
        &app,
        &user.id,
        &calendar,
        "Garbage rule",
        "2099-03-02T09:00:00.000Z",
        "2099-03-02T09:15:00.000Z",
    )
    .await;
    let standup = insert_plaintext_event(
        &app,
        &user.id,
        &calendar,
        "Team Standup",
        "2099-03-06T09:00:00.000Z",
        "2099-03-06T09:15:00.000Z",
    )
    .await;
    for (id, rule) in [(&garbage, "not json"), (&standup, "{}")] {
        sqlx::query("UPDATE calendar_event SET recurrence = $2 WHERE id = $1")
            .bind(id)
            .bind(rule)
            .execute(&app.db)
            .await
            .expect("rule");
    }
    let list = list_events(
        &mut user,
        "2099-03-01T00:00:00.000Z",
        "2099-03-10T23:00:00.000Z",
    )
    .await;
    assert_eq!(
        ids(&list.events),
        [
            standup.clone(),
            format!("{standup}_2099-03-09T09:00:00.000Z"),
            format!("{standup}_2099-03-10T09:00:00.000Z"),
        ],
        "an empty rule on a standup becomes weekdays; other unreadable rules list nothing"
    );
}

#[tokio::test]
async fn declined_invitation_copies_are_hidden_everywhere() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar = calendar_id(&mut user, "Work").await;
    let mut visible_request = encrypted_event(&calendar, FUTURE_START, FUTURE_END);
    visible_request.blind_index_tokens = Some(vec!["shared-token".into()]);
    let visible = create_event(&mut user, &visible_request).await;
    let mut declined_request = encrypted_event(
        &calendar,
        "2099-03-02T11:00:00.000Z",
        "2099-03-02T12:00:00.000Z",
    );
    declined_request.blind_index_tokens = Some(vec!["shared-token".into()]);
    let declined = create_event(&mut user, &declined_request).await;
    let mut organizer_request = encrypted_event(
        &calendar,
        "2099-03-02T13:00:00.000Z",
        "2099-03-02T14:00:00.000Z",
    );
    organizer_request.blind_index_tokens = Some(vec!["shared-token".into()]);
    let own = create_event(&mut user, &organizer_request).await;
    sqlx::query("DELETE FROM event_participant WHERE event_id = $1")
        .bind(&declined.id.0)
        .execute(&app.db)
        .await
        .expect("drop organizer");
    insert_participant(
        &app,
        &declined.id.0,
        None,
        "boss@example.com",
        "organizer",
        "accepted",
    )
    .await;
    insert_participant(
        &app,
        &declined.id.0,
        Some(&user.id),
        &user.email,
        "attendee",
        "declined",
    )
    .await;
    sqlx::query("UPDATE event_participant SET status = 'declined' WHERE event_id = $1")
        .bind(&own.id.0)
        .execute(&app.db)
        .await
        .expect("organizer declined");

    let list = list_events(&mut user, MARCH_START, MARCH_END).await;
    assert_eq!(
        ids(&list.events),
        [visible.id.0.clone(), own.id.0.clone()],
        "only attendee declines hide an event"
    );
    let found = search(&mut user, "q=zz&blindIndexTokens=shared-token").await;
    assert_eq!(found.total, 3, "the count still includes the declined copy");
    let mut found_ids: Vec<String> = found.events.iter().map(|e| e.id.0.clone()).collect();
    found_ids.sort();
    let mut expected = vec![visible.id.0.clone(), own.id.0.clone()];
    expected.sort();
    assert_eq!(found_ids, expected);
    let indexed = corpus(&mut user, "limit=200").await;
    assert_eq!(indexed.total, 2, "the corpus filters before counting");
    assert!(!indexed.events.iter().any(|e| e.id == declined.id));
}

#[tokio::test]
async fn categories_are_active_ones_by_name() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let mut other = app.user().await;
    let calendar = calendar_id(&mut user, "Work").await;
    let zeta = insert_category(&app, &user.id, "Zeta", true).await;
    let alpha = insert_category(&app, &user.id, "Alpha", true).await;
    insert_category(&app, &user.id, "Archived", false).await;
    insert_category(&app, &other.id, "Foreign", true).await;
    let mut request = encrypted_event(&calendar, FUTURE_START, FUTURE_END);
    request.category_id = Some(zeta.clone().into());
    let event = create_event(&mut user, &request).await;
    assert_eq!(
        event.category.as_ref().map(|c| c.name.as_str()),
        Some("Zeta")
    );

    let list = list_events(&mut user, MARCH_START, MARCH_END).await;
    let names: Vec<&str> = list.categories.iter().map(|c| c.name.as_str()).collect();
    assert_eq!(names, ["Alpha", "Zeta"]);
    assert_eq!(list.categories[0].id.0, alpha);
    assert_eq!(
        list.events[0].category.as_ref().map(|c| c.id.0.as_str()),
        Some(zeta.as_str())
    );
    assert!(
        list_events(&mut other, MARCH_START, MARCH_END)
            .await
            .events
            .is_empty()
    );
}

#[tokio::test]
async fn search_finds_encrypted_events_by_blind_index_token() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let mut other = app.user().await;
    let calendar = calendar_id(&mut user, "Work").await;
    let other_calendar = calendar_id(&mut other, "Work").await;
    let token_a = format!("tok-a-{}", hex(6));
    let token_c = format!("tok-c-{}", hex(6));
    let mut first = encrypted_event(
        &calendar,
        "2099-03-02T09:00:00.000Z",
        "2099-03-02T10:00:00.000Z",
    );
    first.blind_index_tokens = Some(vec![token_a.clone(), "tok-b".into()]);
    let first = create_event(&mut user, &first).await;
    let mut second = encrypted_event(
        &calendar,
        "2099-03-05T09:00:00.000Z",
        "2099-03-05T10:00:00.000Z",
    );
    second.blind_index_tokens = Some(vec![token_c.clone()]);
    let second = create_event(&mut user, &second).await;
    let mut foreign = encrypted_event(&other_calendar, FUTURE_START, FUTURE_END);
    foreign.blind_index_tokens = Some(vec![token_a.clone()]);
    create_event(&mut other, &foreign).await;

    let found = search(&mut user, &format!("q=zz&blindIndexTokens={token_a}")).await;
    assert_eq!(found.total, 1);
    let hit = &found.events[0];
    assert_eq!(hit.id, first.id);
    assert_eq!(hit.encrypted_content, first.encrypted_content);
    assert_eq!(hit.blind_index_tokens, first.blind_index_tokens);
    assert_eq!(hit.title, "");
    let label = hit.calendar.as_ref().expect("calendar label");
    assert_eq!(
        (label.id.as_str(), label.name.as_str(), label.color.as_str()),
        (calendar.as_str(), "", "#3b82f6")
    );
    assert_eq!(hit.category, None);
    assert_eq!(hit.participants.len(), 1);
    assert_eq!(hit.participants[0].email, user.email);

    let both = search(
        &mut user,
        &format!("q=zz&blindIndexTokens=%20{token_a}%20,,{token_c}"),
    )
    .await;
    assert_eq!(
        both.events.iter().map(|e| e.id.clone()).collect::<Vec<_>>(),
        [second.id.clone(), first.id.clone()],
        "tokens are trimmed; equal rank sorts by start, newest first"
    );
    let blank = search(&mut user, &format!("q=%20%20&blindIndexTokens={token_c}")).await;
    assert_eq!(
        (blank.total, blank.events.len()),
        (1, 1),
        "a blank query adds no match-all plaintext clause"
    );
    let nothing = search(&mut user, "q=%20%20").await;
    assert_eq!((nothing.total, nothing.events.len()), (0, 0));
}

#[tokio::test]
async fn search_matches_plaintext_rows_by_words_and_title_substring() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    // Feed events are the plaintext rows the server still reads.
    let calendar = insert_calendar(&app, &user.id, "subscribed", true).await;
    let review = insert_plaintext_event(
        &app,
        &user.id,
        &calendar,
        "Quarterly planning review",
        "2099-03-02T09:00:00.000Z",
        "2099-03-02T10:00:00.000Z",
    )
    .await;
    let lunch = insert_plaintext_event(
        &app,
        &user.id,
        &calendar,
        "Lunch",
        "2099-03-03T09:00:00.000Z",
        "2099-03-03T10:00:00.000Z",
    )
    .await;
    sqlx::query("UPDATE calendar_event SET description = 'Bring the budget notes' WHERE id = $1")
        .bind(&lunch)
        .execute(&app.db)
        .await
        .expect("description");
    insert_plaintext_event(
        &app,
        &user.id,
        &calendar,
        "Dentist",
        "2099-03-04T09:00:00.000Z",
        "2099-03-04T10:00:00.000Z",
    )
    .await;

    let found = search(&mut user, "q=plan").await;
    assert_eq!(
        (
            found.total,
            found
                .events
                .iter()
                .map(|e| e.id.0.clone())
                .collect::<Vec<_>>()
        ),
        (1, vec![review.clone()])
    );
    assert_eq!(found.events[0].title, "Quarterly planning review");
    let found = search(&mut user, "q=terly").await;
    assert_eq!(found.total, 1, "titles also match as substrings");
    let found = search(&mut user, "q=budget").await;
    assert_eq!(
        found
            .events
            .iter()
            .map(|e| e.id.0.clone())
            .collect::<Vec<_>>(),
        [lunch],
        "descriptions match as words"
    );
    let found = search(&mut user, "q=udge").await;
    assert_eq!(found.total, 0, "descriptions do not match as substrings");

    let ranged = search(
        &mut user,
        "q=plan&startDate=2099-03-03T00:00:00.000Z&endDate=2099-03-05T00:00:00.000Z",
    )
    .await;
    assert_eq!(ranged.total, 0, "both bounds filter by overlap");
    let half = search(&mut user, "q=plan&startDate=2099-03-03T00:00:00.000Z").await;
    assert_eq!(half.total, 1, "a single bound is ignored");
}

/// Hits are a subset of the row with trimmed calendar and category labels, exactly the keys `SearchEvent` and `SearchLabel` declare.
#[tokio::test]
async fn search_hits_carry_trimmed_calendar_and_category_labels() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    // Feed events are the plaintext rows the server still reads.
    let calendar = insert_calendar(&app, &user.id, "subscribed", true).await;
    let category = ok(user
        .post(
            "/api/categories",
            json!({"encryptedName": "focus-ciphertext", "color": "blue"}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    let event = insert_plaintext_event(
        &app,
        &user.id,
        &calendar,
        "Standup",
        "2099-03-02T09:00:00.000Z",
        "2099-03-02T09:15:00.000Z",
    )
    .await;
    sqlx::query("UPDATE calendar_event SET category_id = $1 WHERE id = $2")
        .bind(category["id"].as_str())
        .bind(&event)
        .execute(&app.db)
        .await
        .expect("category");

    let found = ok(user
        .get("/api/events/search?q=standup")
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    let keys = |value: &Value| {
        let mut keys: Vec<String> = value.as_object().expect("object").keys().cloned().collect();
        keys.sort();
        keys
    };
    let hit = &found["events"][0];
    assert_eq!(
        keys(hit),
        [
            "allDay",
            "blindIndexTokens",
            "calendar",
            "calendarId",
            "category",
            "categoryId",
            "color",
            "createdAt",
            "description",
            "encryptedContent",
            "encryptionKeyVersion",
            "encryptionState",
            "end",
            "id",
            "location",
            "participants",
            "recurrence",
            "start",
            "timezone",
            "title",
            "updatedAt",
            "userId",
        ]
    );
    let label = [
        "color",
        "encryptedName",
        "encryptionKeyVersion",
        "id",
        "name",
    ];
    assert_eq!(keys(&hit["calendar"]), label);
    assert_eq!(keys(&hit["category"]), label);
    assert_eq!(
        (
            &hit["calendar"]["id"],
            &hit["category"]["name"],
            &hit["category"]["encryptedName"]
        ),
        (&json!(calendar), &json!(""), &json!("focus-ciphertext"))
    );
}

#[tokio::test]
async fn search_paging_coerces_query_strings_like_zod() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    // Feed events are the plaintext rows the server still reads.
    let calendar = insert_calendar(&app, &user.id, "subscribed", true).await;
    for day in 2..=4 {
        insert_plaintext_event(
            &app,
            &user.id,
            &calendar,
            "Standing meeting",
            &format!("2099-03-0{day}T09:00:00.000Z"),
            &format!("2099-03-0{day}T10:00:00.000Z"),
        )
        .await;
    }
    let page = search(&mut user, "q=meeting&limit=1&offset=1").await;
    assert_eq!(page.total, 3);
    assert_eq!(
        page.events
            .iter()
            .map(|e| e.start.0.as_str())
            .collect::<Vec<_>>(),
        ["2099-03-03T09:00:00.000Z"]
    );
    let defaults = search(&mut user, "q=meeting&limit=&offset=").await;
    assert_eq!(defaults.events.len(), 3, "empty numbers count as absent");
    let cases = [
        ("q=a", "String must contain at least 2 character(s)", "q"),
        ("limit=5", "Required", "q"),
        (
            "q=meeting&limit=0",
            "Number must be greater than or equal to 1",
            "limit",
        ),
        (
            "q=meeting&limit=51",
            "Number must be less than or equal to 50",
            "limit",
        ),
        (
            "q=meeting&limit=abc",
            "Expected number, received nan",
            "limit",
        ),
        (
            "q=meeting&limit=1.5",
            "Expected integer, received float",
            "limit",
        ),
        (
            "q=meeting&offset=-1",
            "Number must be greater than or equal to 0",
            "offset",
        ),
    ];
    for (query, message, path) in cases {
        let error = ok(user
            .get(&format!("/api/events/search?{query}"))
            .await
            .expect_error(400, "Validation Error", message));
        assert_eq!(
            error["details"]["issues"][0]["path"],
            json!(path),
            "{query}"
        );
    }
}

#[tokio::test]
async fn the_search_corpus_pages_by_update_time() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar = calendar_id(&mut user, "Work").await;
    let mut created = Vec::new();
    for _ in 0..3 {
        created.push(
            create_event(
                &mut user,
                &encrypted_event(&calendar, FUTURE_START, FUTURE_END),
            )
            .await,
        );
    }
    ok(user
        .put(
            &format!("/api/events/{}", created[0].id),
            json!({"color": "red"}),
        )
        .await
        .expect_status(200));
    let order = [
        created[1].id.clone(),
        created[2].id.clone(),
        created[0].id.clone(),
    ];

    let first = corpus(&mut user, "limit=2").await;
    assert_eq!((first.total, first.next_offset), (3, Some(2)));
    assert_eq!(
        first
            .events
            .iter()
            .map(|e| e.id.clone())
            .collect::<Vec<_>>(),
        order[..2]
    );
    assert_eq!(first.events[0].participants.as_ref().map(Vec::len), Some(1));
    let rest = corpus(&mut user, "limit=2&offset=2").await;
    assert_eq!((rest.total, rest.next_offset), (3, None));
    assert_eq!(
        rest.events.iter().map(|e| e.id.clone()).collect::<Vec<_>>(),
        order[2..]
    );
    let all = corpus(&mut user, "").await;
    assert_eq!((all.events.len(), all.next_offset), (3, None));

    let after = &first.events[1].updated_at.0;
    let changed = corpus(&mut user, &format!("updatedAfter={after}")).await;
    assert_eq!(
        changed
            .events
            .iter()
            .map(|e| e.id.clone())
            .collect::<Vec<_>>(),
        [created[0].id.clone()]
    );
    assert_eq!(changed.total, 1);

    let error = ok(user
        .get("/api/events/search-corpus?updatedAfter=yesterday")
        .await
        .expect_error(
            400,
            "Validation Error",
            "Invalid updatedAfter date format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)",
        ));
    assert!(error.get("details").is_none());
    for (query, message, path) in [
        (
            "limit=201",
            "Number must be less than or equal to 200",
            "limit",
        ),
        (
            "limit=0",
            "Number must be greater than or equal to 1",
            "limit",
        ),
        ("offset=x", "Expected number, received nan", "offset"),
    ] {
        let error = ok(user
            .get(&format!("/api/events/search-corpus?{query}"))
            .await
            .expect_error(400, "Validation Error", message));
        assert_eq!(
            error["details"]["issues"][0]["path"],
            json!(path),
            "{query}"
        );
    }
}

#[tokio::test]
async fn other_users_never_see_each_others_events() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut other = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let mut request = encrypted_event(&calendar, FUTURE_START, FUTURE_END);
    request.blind_index_tokens = Some(vec!["private-token".into()]);
    request.recurrence = Some(r#"{"frequency":"daily","interval":1,"count":3}"#.into());
    create_event(&mut owner, &request).await;
    let feed = insert_calendar(&app, &owner.id, "subscribed", true).await;
    insert_plaintext_event(
        &app,
        &owner.id,
        &feed,
        "Owner meeting",
        FUTURE_START,
        FUTURE_END,
    )
    .await;

    let list = list_events(&mut other, MARCH_START, MARCH_END).await;
    assert!(list.events.is_empty() && list.categories.is_empty());
    assert!(list.calendars.iter().all(|c| c.user_id.0 == other.id));
    let found = search(&mut other, "q=meeting&blindIndexTokens=private-token").await;
    assert_eq!((found.total, found.events.len()), (0, 0));
    let indexed = corpus(&mut other, "").await;
    assert_eq!((indexed.total, indexed.events.len()), (0, 0));
    let raw: Value = ok(other
        .get("/api/events/search-corpus")
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    assert_eq!(raw, json!({"events": [], "total": 0, "nextOffset": null}));
}
