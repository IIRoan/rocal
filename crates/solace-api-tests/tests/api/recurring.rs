//! `/api/recurring`: rule validation and preview, common patterns, and scoped series edits and deletes.

use serde_json::{Value, json};
use solace_api_tests::seed::fake_envelope;
use solace_api_types::events::{Event, InvitationContent, ParticipantInput};
use solace_api_types::recurring::{
    EditRecurringRequest, PreviewRecurrenceRequest, RecurrencePatterns, RecurrencePreview,
    RecurrenceRule, RecurrenceRuleInput, RecurrenceValidation, RecurringDeleted, RecurringUpdates,
    ValidateRecurrenceRequest,
};

use crate::event_fixtures::{
    StoredContent, calendar_id, create_event, encrypted_event, insert_calendar,
    insert_plaintext_event, insert_staging_calendar, list_events, row_snapshot, sent_mail,
    stored_content, to_json, unfold,
};
use crate::helpers::{
    Backend, TestApp, TestUser, count, expect_unauthorized, expect_unknown_field, hex, ok,
};

const WEEKLY_FIVE: &str = r#"{"frequency":"weekly","interval":1,"count":5}"#;
const SERIES_START: &str = "2099-03-02T09:00:00.000Z";
const SERIES_END: &str = "2099-03-02T10:30:00.000Z";
const NOT_FOUND: &str = "Recurring event not found or access denied";

fn rule(frequency: &str, interval: i32) -> RecurrenceRule {
    RecurrenceRule {
        frequency: frequency.into(),
        interval,
        count: None,
        until: None,
        timezone: None,
        by_week_day: None,
        by_month_day: None,
        by_month: None,
    }
}

fn preview_request(rule: RecurrenceRuleInput, days: Option<i32>) -> Value {
    to_json(&PreviewRecurrenceRequest {
        event_start: SERIES_START.into(),
        event_end: SERIES_END.into(),
        recurrence_rule: rule,
        preview_days: days,
    })
}

async fn validate(user: &mut TestUser, rule: RecurrenceRuleInput) -> RecurrenceValidation {
    ok(user
        .post(
            "/api/recurring/validate",
            to_json(&ValidateRecurrenceRequest { rule }),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()))
}

async fn preview(user: &mut TestUser, body: Value) -> RecurrencePreview {
    ok(user
        .post("/api/recurring/preview", body)
        .await
        .expect_status(200)
        .and_then(|r| r.dto()))
}

fn dates(preview: &RecurrencePreview) -> Vec<&str> {
    preview
        .instances
        .iter()
        .map(|i| i.date.0.as_str())
        .collect()
}

async fn weekly_series(user: &mut TestUser, calendar: &str) -> Event {
    let mut request = encrypted_event(calendar, SERIES_START, SERIES_END);
    request.recurrence = Some(WEEKLY_FIVE.into());
    request.reminder = Some(Some(10));
    request.timezone = Some("Europe/Amsterdam".into());
    create_event(user, &request).await
}

async fn edit(user: &mut TestUser, series: &str, request: &EditRecurringRequest) -> Event {
    ok(user
        .put(&format!("/api/recurring/event/{series}"), to_json(request))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()))
}

fn edit_request(
    scope: &str,
    occurrence: Option<&str>,
    updates: RecurringUpdates,
) -> EditRecurringRequest {
    EditRecurringRequest {
        edit_scope: scope.into(),
        occurrence_date: occurrence.map(str::to_owned),
        updates,
    }
}

async fn stored_rule(app: &TestApp, id: &str) -> Option<String> {
    sqlx::query_scalar("SELECT recurrence FROM calendar_event WHERE id = $1")
        .bind(id)
        .fetch_one(&app.db)
        .await
        .expect("rule")
}

async fn exceptions(app: &TestApp, series: &str) -> Vec<(String, String, Option<String>)> {
    sqlx::query_as(
        "SELECT to_char(exception_date, 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'), type, modified_event_id \
         FROM recurrence_exception WHERE parent_event_id = $1 ORDER BY exception_date",
    )
    .bind(series)
    .fetch_all(&app.db)
    .await
    .expect("exceptions")
}

#[tokio::test]
async fn anonymous_callers_are_refused() {
    let app = TestApp::spawn().await;
    let mut anon = app.anonymous();
    let validate = to_json(&ValidateRecurrenceRequest {
        rule: RecurrenceRuleInput::Rule(rule("daily", 1)),
    });
    expect_unauthorized(&ok(anon.post("/api/recurring/validate", validate).await));
    let preview = preview_request(RecurrenceRuleInput::Rule(rule("daily", 1)), None);
    expect_unauthorized(&ok(anon.post("/api/recurring/preview", preview).await));
    expect_unauthorized(&ok(anon.get("/api/recurring/patterns").await));
    expect_unauthorized(&ok(anon
        .put(
            "/api/recurring/event/x",
            json!({"editScope": "all", "updates": {}}),
        )
        .await));
    expect_unauthorized(&ok(anon
        .delete("/api/recurring/event/x?deleteScope=all")
        .await));
}

#[tokio::test]
async fn rule_objects_validate_with_a_description() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let mut weekly = rule("weekly", 1);
    weekly.by_week_day = Some(vec![1, 3]);
    let result = validate(&mut user, RecurrenceRuleInput::Rule(weekly.clone())).await;
    assert_eq!(
        result,
        RecurrenceValidation {
            valid: true,
            errors: vec![],
            description: Some("Weekly on Mon, Wed".into()),
            rule: Some(serde_json::to_value(&weekly).expect("rule json")),
        }
    );
    let cases = [
        (
            json!({"frequency": "weekly", "interval": 2, "byWeekDay": [0, 6], "count": 3}),
            "Every 2 weeks on Sun, Sat, 3 times",
        ),
        (
            json!({"frequency": "daily", "interval": 1, "byWeekDay": [1, 2, 3, 4, 5]}),
            "Daily",
        ),
        (
            json!({"frequency": "monthly", "interval": 3, "count": 4}),
            "Every 3 months, 4 times",
        ),
        (
            json!({"frequency": "yearly", "interval": 1, "byMonth": [12], "byMonthDay": [25]}),
            "Yearly",
        ),
        (
            json!({"frequency": "daily", "interval": 10, "timezone": "Asia/Tokyo"}),
            "Every 10 days",
        ),
    ];
    for (rule, description) in cases {
        let result: RecurrenceValidation = ok(user
            .post("/api/recurring/validate", json!({"rule": rule}))
            .await
            .expect_status(200)
            .and_then(|r| r.dto()));
        assert_eq!(result.description.as_deref(), Some(description), "{rule}");
        assert!(result.valid && result.errors.is_empty());
        assert_eq!(to_json(&result.rule), rule);
    }
}

#[tokio::test]
async fn rule_objects_with_semantic_errors_are_reported_invalid() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let cases = [
        (
            json!({"frequency": "daily", "interval": 1, "byMonth": [1]}),
            vec!["byMonth can only be used with yearly frequency"],
        ),
        (
            json!({"frequency": "monthly", "interval": 1, "byWeekDay": [1]}),
            vec!["byWeekDay can only be used with weekly or daily frequency"],
        ),
        (
            json!({"frequency": "weekly", "interval": 1, "byMonthDay": [1], "byMonth": [2]}),
            vec![
                "byMonthDay can only be used with monthly or yearly frequency",
                "byMonth can only be used with yearly frequency",
            ],
        ),
    ];
    for (rule, errors) in cases {
        let result: RecurrenceValidation = ok(user
            .post("/api/recurring/validate", json!({"rule": rule}))
            .await
            .expect_status(200)
            .and_then(|r| r.dto()));
        assert_eq!(
            (result.valid, result.errors, result.description),
            (false, errors.iter().map(|e| e.to_string()).collect(), None),
            "{rule}"
        );
        assert_eq!(to_json(&result.rule), rule);
    }

    // An object `until` stays a string, and describing it throws inside the service.
    let mut until = rule("weekly", 1);
    until.until = Some("2099-12-01T00:00:00.000Z".into());
    assert_eq!(
        validate(&mut user, RecurrenceRuleInput::Rule(until)).await,
        RecurrenceValidation {
            valid: false,
            errors: vec!["Failed to parse recurrence rule".into()],
            description: None,
            rule: None,
        }
    );
}

#[tokio::test]
async fn rule_strings_are_parsed_leniently() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    assert_eq!(
        validate(&mut user, RecurrenceRuleInput::Json("nope".into())).await,
        RecurrenceValidation {
            valid: false,
            errors: vec!["Invalid recurrence rule format".into()],
            description: None,
            rule: None,
        }
    );
    for text in [
        r#"{"frequency":"hourly","interval":1}"#,
        r#"{"frequency":"daily","interval":0}"#,
        r#"{"frequency":"daily"}"#,
        r#"{"frequency":"daily","interval":"1"}"#,
    ] {
        let result = validate(&mut user, RecurrenceRuleInput::Json(text.into())).await;
        assert_eq!(result.errors, ["Invalid recurrence rule format"], "{text}");
    }
    let result = validate(
        &mut user,
        RecurrenceRuleInput::Json(
            r#"{"frequency":"daily","interval":1,"count":2,"until":"2099-01-01"}"#.into(),
        ),
    )
    .await;
    assert_eq!(
        (result.valid, result.errors, result.description),
        (
            false,
            vec!["Cannot specify both count and until date".to_owned()],
            None
        )
    );
    assert_eq!(
        result.rule.as_ref().and_then(|r| r["until"].as_str()),
        Some("2099-01-01T00:00:00.000Z"),
        "a string until comes back as an instant"
    );
    let result = validate(
        &mut user,
        RecurrenceRuleInput::Json(
            r#"{"frequency":"weekly","interval":1,"until":"2099-12-01T00:00:00.000Z"}"#.into(),
        ),
    )
    .await;
    assert_eq!(
        result.description.as_deref(),
        Some("Weekly, until 12/1/2099"),
        "en-US short date"
    );
    let lenient: Value = ok(user
        .post(
            "/api/recurring/validate",
            json!({"rule": r#"{"frequency":"daily","interval":1,"foo":1}"#}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    assert_eq!(
        lenient,
        json!({"valid": true, "errors": [], "description": "Daily", "rule": {"frequency": "daily", "interval": 1, "foo": 1}}),
        "unknown keys in a rule string are echoed back"
    );
}

#[tokio::test]
async fn rule_objects_are_strictly_validated() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let cases = [
        (json!(5), "Invalid input", "rule"),
        (
            json!({"frequency": "hourly", "interval": 1}),
            "Invalid input",
            "rule",
        ),
        (
            json!({"frequency": "daily", "interval": 0}),
            "Number must be greater than or equal to 1",
            "rule.interval",
        ),
        (
            json!({"frequency": "daily", "interval": 1000}),
            "Number must be less than or equal to 999",
            "rule.interval",
        ),
        (
            json!({"frequency": "daily", "interval": 1.5}),
            "Expected integer, received float",
            "rule.interval",
        ),
        (
            json!({"frequency": "daily", "interval": 1, "count": 0}),
            "Number must be greater than or equal to 1",
            "rule.count",
        ),
        (
            json!({"frequency": "daily", "interval": 1, "byWeekDay": [7]}),
            "Number must be less than or equal to 6",
            "rule.byWeekDay.0",
        ),
        (
            json!({"frequency": "monthly", "interval": 1, "byMonthDay": [0]}),
            "Number must be greater than or equal to 1",
            "rule.byMonthDay.0",
        ),
        (
            json!({"frequency": "yearly", "interval": 1, "byMonth": [13]}),
            "Number must be less than or equal to 12",
            "rule.byMonth.0",
        ),
        (
            json!({"frequency": "daily", "interval": 1, "timezone": "Mars/X"}),
            "Invalid timezone identifier",
            "rule.timezone",
        ),
        (
            json!({"frequency": "daily", "interval": 1, "extra": 1}),
            "Unrecognized key(s) in object: 'extra'",
            "rule",
        ),
    ];
    for (rule, message, path) in cases {
        let error = ok(user
            .post("/api/recurring/validate", json!({"rule": rule}))
            .await
            .expect_error(400, "Validation Error", message));
        assert_eq!(error["details"]["issues"][0]["path"], json!(path), "{rule}");
    }
    expect_unknown_field(
        &user
            .post(
                "/api/recurring/validate",
                json!({"rule": "{}", "userId": user.id}),
            )
            .await,
        "userId",
    );
}

#[tokio::test]
async fn previews_cover_ninety_days_by_default() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let daily = preview(
        &mut user,
        preview_request(RecurrenceRuleInput::Rule(rule("daily", 1)), None),
    )
    .await;
    assert_eq!(daily.total_instances, 91, "start through start + 90 days");
    assert_eq!(daily.instances.len(), 91);
    assert_eq!(daily.description, "Daily");
    assert!(daily.instances[0].is_original);
    assert!(daily.instances[1..].iter().all(|i| !i.is_original));
    assert_eq!(
        (dates(&daily)[0], dates(&daily)[90]),
        ("2099-03-02T09:00:00.000Z", "2099-05-31T09:00:00.000Z")
    );
    let week = preview(
        &mut user,
        preview_request(RecurrenceRuleInput::Rule(rule("daily", 1)), Some(7)),
    )
    .await;
    assert_eq!(week.total_instances, 8);
    let year = preview(
        &mut user,
        preview_request(RecurrenceRuleInput::Rule(rule("daily", 1)), Some(365)),
    )
    .await;
    assert_eq!(year.total_instances, 366);

    for (days, message) in [
        (json!(6), "Number must be greater than or equal to 7"),
        (json!(366), "Number must be less than or equal to 365"),
        (json!(7.5), "Expected integer, received float"),
    ] {
        let mut body = preview_request(RecurrenceRuleInput::Rule(rule("daily", 1)), None);
        body["previewDays"] = days;
        let error = ok(user
            .post("/api/recurring/preview", body)
            .await
            .expect_error(400, "Validation Error", message));
        assert_eq!(error["details"]["issues"][0]["path"], json!("previewDays"));
    }
}

#[tokio::test]
async fn previews_expand_like_the_hand_written_engine() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let mut biweekly = rule("weekly", 2);
    biweekly.by_week_day = Some(vec![1, 3]);
    let result = preview(
        &mut user,
        preview_request(RecurrenceRuleInput::Rule(biweekly), Some(30)),
    )
    .await;
    assert_eq!(result.description, "Every 2 weeks on Mon, Wed");
    assert_eq!(
        dates(&result),
        [
            "2099-03-02T09:00:00.000Z",
            "2099-03-04T09:00:00.000Z",
            "2099-03-09T09:00:00.000Z",
            "2099-03-11T09:00:00.000Z",
            "2099-03-16T09:00:00.000Z",
            "2099-03-18T09:00:00.000Z",
            "2099-03-23T09:00:00.000Z",
            "2099-03-25T09:00:00.000Z",
            "2099-03-30T09:00:00.000Z",
            "2099-04-01T09:00:00.000Z",
        ],
        "with weekdays the interval is ignored"
    );

    let zoned = preview(
        &mut user,
        json!({
            "eventStart": "2099-03-23T09:00:00.000Z",
            "eventEnd": "2099-03-23T10:00:00.000Z",
            "recurrenceRule": {"frequency": "weekly", "interval": 1, "count": 3, "timezone": "Europe/Amsterdam"},
            "previewDays": 30,
        }),
    )
    .await;
    assert_eq!(
        dates(&zoned),
        [
            "2099-03-23T09:00:00.000Z",
            "2099-03-30T08:00:00.000Z",
            "2099-04-06T08:00:00.000Z"
        ],
        "10:00 Amsterdam time across the spring change"
    );
    assert_eq!(zoned.description, "Weekly, 3 times");

    let until = preview(
        &mut user,
        preview_request(
            RecurrenceRuleInput::Json(
                r#"{"frequency":"daily","interval":1,"until":"2099-03-04T09:00:00.000Z"}"#.into(),
            ),
            None,
        ),
    )
    .await;
    assert_eq!(
        dates(&until),
        [
            "2099-03-02T09:00:00.000Z",
            "2099-03-03T09:00:00.000Z",
            "2099-03-04T09:00:00.000Z"
        ]
    );
    assert_eq!(until.description, "Daily, until 3/4/2099");

    let mut unchecked = rule("daily", 1);
    unchecked.count = Some(3);
    unchecked.by_month = Some(vec![1]);
    let result = preview(
        &mut user,
        preview_request(RecurrenceRuleInput::Rule(unchecked), None),
    )
    .await;
    assert_eq!(
        (result.total_instances, result.description.as_str()),
        (3, "Daily, 3 times"),
        "previews skip the semantic checks"
    );

    let nowhere = preview(
        &mut user,
        json!({"eventStart": "nope", "eventEnd": "nope", "recurrenceRule": {"frequency": "daily", "interval": 1}}),
    )
    .await;
    assert_eq!(
        (nowhere.total_instances, nowhere.description.as_str()),
        (0, "Daily"),
        "an unreadable start previews nothing"
    );
}

#[tokio::test]
async fn unreadable_preview_rules_fail_with_one_message() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let mut until = rule("daily", 1);
    until.until = Some("2099-03-04T09:00:00.000Z".into());
    for input in [
        RecurrenceRuleInput::Json("not-json".into()),
        RecurrenceRuleInput::Json("{}".into()),
        RecurrenceRuleInput::Rule(until),
    ] {
        let error = ok(user
            .post(
                "/api/recurring/preview",
                preview_request(input.clone(), None),
            )
            .await
            .expect_error(400, "Validation Error", "Failed to generate preview"));
        assert_eq!(
            error["details"],
            json!({"field": "recurrenceRule"}),
            "{input:?}"
        );
    }
    let error = ok(user
        .post(
            "/api/recurring/preview",
            json!({"eventStart": SERIES_START, "recurrenceRule": "{}"}),
        )
        .await
        .expect_error(400, "Validation Error", "Required"));
    assert_eq!(error["details"]["issues"][0]["path"], json!("eventEnd"));
}

#[tokio::test]
async fn common_patterns_are_fixed() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let response = user.get("/api/recurring/patterns").await;
    let patterns: RecurrencePatterns = ok(response.expect_status(200).and_then(|r| r.dto()));
    assert_eq!(
        to_json(&patterns),
        json!({"patterns": {
            "daily": {"rule": {"frequency": "daily", "interval": 1}, "description": "Daily"},
            "weekly": {"rule": {"frequency": "weekly", "interval": 1}, "description": "Weekly"},
            "biweekly": {"rule": {"frequency": "weekly", "interval": 2}, "description": "Every 2 weeks"},
            "monthly": {"rule": {"frequency": "monthly", "interval": 1}, "description": "Monthly"},
            "yearly": {"rule": {"frequency": "yearly", "interval": 1}, "description": "Yearly"},
            "weekdays": {"rule": {"frequency": "weekly", "interval": 1, "byWeekDay": [1, 2, 3, 4, 5]}, "description": "Every weekday"},
        }})
    );
}

#[tokio::test]
async fn editing_one_occurrence_detaches_it_with_the_series_ciphertext() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let series = weekly_series(&mut owner, &calendar).await;

    let detached = edit(
        &mut owner,
        &series.id.0,
        &edit_request(
            "this_only",
            Some("2099-03-16T09:00:00.000Z"),
            RecurringUpdates {
                color: Some("rose".into()),
                ..RecurringUpdates::default()
            },
        ),
    )
    .await;
    assert_ne!(detached.id, series.id);
    assert_eq!(detached.parent_event_id.as_ref(), Some(&series.id));
    assert_eq!(
        (detached.start.0.as_str(), detached.end.0.as_str()),
        ("2099-03-16T09:00:00.000Z", "2099-03-16T10:30:00.000Z"),
        "the occurrence date with the series duration"
    );
    assert_eq!(detached.recurrence, None);
    assert_eq!(detached.color.as_deref(), Some("rose"));
    assert_eq!(
        (detached.reminder, detached.timezone.as_str()),
        (Some(10), "Europe/Amsterdam")
    );
    assert_eq!(detached.external_id, None);
    assert_eq!(detached.calendar.id.0, calendar);
    assert_eq!(
        stored_content(&app.db, &detached.id.0).await,
        stored_content(&app.db, &series.id.0).await,
        "the occurrence keeps the series ciphertext"
    );
    let people = detached.participants.clone().expect("participants");
    assert_eq!(
        people
            .iter()
            .map(|p| (p.email.as_str(), p.role.as_str()))
            .collect::<Vec<_>>(),
        [(owner.email.as_str(), "organizer")]
    );
    assert_eq!(
        exceptions(&app, &series.id.0).await,
        [(
            "2099-03-16T09:00:00.000Z".to_owned(),
            "modified".to_owned(),
            Some(detached.id.0.clone())
        )]
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM event_notification WHERE event_id = $1",
            &detached.id.0
        )
        .await,
        0,
        "detaching does not schedule reminders"
    );

    let moved = edit(
        &mut owner,
        &series.id.0,
        &edit_request(
            "this_only",
            Some("2099-03-23T09:00:00.000Z"),
            RecurringUpdates {
                start: Some("2099-03-24T14:00:00.000Z".into()),
                ..RecurringUpdates::default()
            },
        ),
    )
    .await;
    assert_eq!(
        (moved.start.0.as_str(), moved.end.0.as_str()),
        ("2099-03-24T14:00:00.000Z", "2099-03-24T15:30:00.000Z")
    );
    let error = ok(owner
        .put(
            &format!("/api/recurring/event/{}", series.id),
            to_json(&edit_request(
                "this_only",
                Some("2099-03-23T09:00:00.000Z"),
                RecurringUpdates::default(),
            )),
        )
        .await
        .expect_error(409, "Conflict", "Resource already exists"));
    assert!(error["requestId"].is_string());
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM calendar_event WHERE parent_event_id = $1",
            &series.id.0
        )
        .await,
        3,
        "a second detach of one occurrence fails on the unique exception after inserting its row"
    );
}

#[tokio::test]
async fn content_edits_need_ciphertext_and_store_no_plaintext() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let series = weekly_series(&mut owner, &calendar).await;
    let before = row_snapshot(&app.db, "calendar_event", &series.id.0).await;

    // Plaintext keys fail the schema, so no scope (not even a split) writes anything.
    for (scope, updates) in [
        ("all", json!({"title": "Plain"})),
        ("this_only", json!({"title": "Plain"})),
        ("this_and_future", json!({"title": "Plain"})),
        (
            "all",
            json!({"location": "Room", "encryptedContent": fake_envelope()}),
        ),
        ("all", json!({"description": ""})),
    ] {
        let field = updates
            .as_object()
            .and_then(|fields| fields.keys().find(|key| *key != "encryptedContent"))
            .cloned()
            .expect("plaintext key");
        let error = ok(owner
            .put(
                &format!("/api/recurring/event/{}", series.id),
                json!({"editScope": scope, "occurrenceDate": "2099-03-30T09:00:00.000Z", "updates": updates}),
            )
            .await
            .expect_error(
                400,
                "Validation Error",
                &format!("Unrecognized key(s) in object: '{field}'"),
            ));
        assert_eq!(
            error["details"]["issues"][0]["path"],
            json!("updates"),
            "{scope}"
        );
    }
    assert_eq!(
        row_snapshot(&app.db, "calendar_event", &series.id.0).await,
        before
    );
    assert_eq!(exceptions(&app, &series.id.0).await, []);
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM calendar_event WHERE parent_event_id = $1",
            &series.id.0
        )
        .await,
        0
    );

    let schedule_only = edit(
        &mut owner,
        &series.id.0,
        &edit_request(
            "all",
            None,
            RecurringUpdates {
                start: Some("2099-03-02T08:00:00.000Z".into()),
                color: Some("lime".into()),
                ..RecurringUpdates::default()
            },
        ),
    )
    .await;
    assert_eq!(
        schedule_only.participants, None,
        "whole-series edits without participants return none"
    );
    assert_eq!(
        (schedule_only.start.0.as_str(), schedule_only.end.0.as_str()),
        ("2099-03-02T08:00:00.000Z", SERIES_END),
        "the end is not moved along"
    );
    assert_eq!(
        stored_content(&app.db, &series.id.0)
            .await
            .encrypted_content,
        series.encrypted_content,
        "schedule-only edits leave the content alone"
    );
    assert!(schedule_only.updated_at > series.updated_at);

    let ciphertext = fake_envelope();
    edit(
        &mut owner,
        &series.id.0,
        &edit_request(
            "all",
            None,
            RecurringUpdates {
                encrypted_content: Some(ciphertext.clone()),
                encryption_key_version: Some(4),
                ..RecurringUpdates::default()
            },
        ),
    )
    .await;
    assert_eq!(
        stored_content(&app.db, &series.id.0).await,
        StoredContent {
            title: String::new(),
            description: None,
            location: None,
            encrypted_content: Some(ciphertext.clone()),
            blind_index_tokens: Some("[]".into()),
            encryption_state: "encrypted".into(),
            encryption_key_version: 4,
        },
        "new ciphertext without tokens stores an empty token list"
    );

    let occurrence_ciphertext = fake_envelope();
    let detached = edit(
        &mut owner,
        &series.id.0,
        &edit_request(
            "this_only",
            Some("2099-03-09T09:00:00.000Z"),
            RecurringUpdates {
                encrypted_content: Some(occurrence_ciphertext.clone()),
                blind_index_tokens: Some(vec!["occurrence".into()]),
                ..RecurringUpdates::default()
            },
        ),
    )
    .await;
    assert_eq!(
        stored_content(&app.db, &detached.id.0).await,
        StoredContent {
            title: String::new(),
            description: None,
            location: None,
            encrypted_content: Some(occurrence_ciphertext),
            blind_index_tokens: Some(r#"["occurrence"]"#.into()),
            encryption_state: "encrypted".into(),
            encryption_key_version: 1,
        }
    );
    assert_eq!(
        stored_content(&app.db, &series.id.0)
            .await
            .encrypted_content,
        Some(ciphertext),
        "the series keeps its own ciphertext"
    );
}

#[tokio::test]
async fn this_and_future_splits_the_series() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let series = weekly_series(&mut owner, &calendar).await;

    let future = edit(
        &mut owner,
        &series.id.0,
        &edit_request(
            "this_and_future",
            Some("2099-03-16T09:00:00.000Z"),
            RecurringUpdates {
                start: Some("2099-03-16T13:00:00.000Z".into()),
                ..RecurringUpdates::default()
            },
        ),
    )
    .await;
    assert_eq!(
        stored_rule(&app, &series.id.0).await.as_deref(),
        Some(r#"{"frequency":"weekly","interval":1,"count":5,"until":"2099-03-15T09:00:00.000Z"}"#),
        "the old half ends a day before the split"
    );
    assert_eq!(future.parent_event_id.as_ref(), Some(&series.id));
    assert_eq!(future.recurrence.as_deref(), Some(WEEKLY_FIVE));
    assert_eq!(
        (future.start.0.as_str(), future.end.0.as_str()),
        ("2099-03-16T13:00:00.000Z", "2099-03-16T14:30:00.000Z"),
        "the duration follows the new start"
    );
    assert_eq!(
        stored_content(&app.db, &future.id.0).await,
        stored_content(&app.db, &series.id.0).await
    );
    assert_eq!(exceptions(&app, &series.id.0).await, []);

    let list = list_events(
        &mut owner,
        "2099-03-01T00:00:00.000Z",
        "2099-05-01T00:00:00.000Z",
    )
    .await;
    let starts: Vec<&str> = list.events.iter().map(|e| e.start.0.as_str()).collect();
    assert_eq!(
        starts,
        [
            "2099-03-02T09:00:00.000Z",
            "2099-03-09T09:00:00.000Z",
            "2099-03-16T13:00:00.000Z",
            "2099-03-23T13:00:00.000Z",
            "2099-03-30T13:00:00.000Z",
            "2099-04-06T13:00:00.000Z",
            "2099-04-13T13:00:00.000Z",
        ],
        "the new half restarts its own count"
    );

    let renamed = edit(
        &mut owner,
        &future.id.0,
        &edit_request(
            "this_and_future",
            Some("2099-03-30T13:00:00.000Z"),
            RecurringUpdates {
                recurrence: Some(r#"{"frequency":"daily","interval":1,"count":2}"#.into()),
                ..RecurringUpdates::default()
            },
        ),
    )
    .await;
    assert_eq!(
        renamed.recurrence.as_deref(),
        Some(r#"{"frequency":"daily","interval":1,"count":2}"#)
    );
    assert_eq!(
        (renamed.start.0.as_str(), renamed.parent_event_id.as_ref()),
        ("2099-03-30T13:00:00.000Z", Some(&future.id))
    );
}

#[tokio::test]
async fn splitting_at_the_first_occurrence_empties_the_old_half() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let series = weekly_series(&mut owner, &calendar).await;
    let future = edit(
        &mut owner,
        &series.id.0,
        &edit_request(
            "this_and_future",
            Some(SERIES_START),
            RecurringUpdates::default(),
        ),
    )
    .await;
    let list = list_events(
        &mut owner,
        "2099-03-01T00:00:00.000Z",
        "2099-05-01T00:00:00.000Z",
    )
    .await;
    assert!(
        list.events.iter().all(|e| e.id.0.starts_with(&future.id.0)),
        "the original anchor is not regenerated"
    );
    assert_eq!(list.events.len(), 5);
}

#[tokio::test]
async fn series_and_occurrence_categories_follow_the_edit() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let other = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let insert_category = |user_id: String| {
        let db = app.db.clone();
        async move {
            let id = format!("suitecat{}", hex(8));
            sqlx::query(
                "INSERT INTO event_category (id, name, color, user_id, created_at, updated_at) \
                 VALUES ($1, 'Category', '#16a34a', $2, now(), now())",
            )
            .bind(&id)
            .bind(&user_id)
            .execute(&db)
            .await
            .expect("insert category");
            id
        }
    };
    let first = insert_category(owner.id.clone()).await;
    let second = insert_category(owner.id.clone()).await;
    let foreign = insert_category(other.id.clone()).await;
    let mut request = encrypted_event(&calendar, SERIES_START, SERIES_END);
    request.recurrence = Some(WEEKLY_FIVE.into());
    request.category_id = Some(first.clone().into());
    let series = create_event(&mut owner, &request).await;
    let category = |event: &Event| event.category_id.as_ref().map(|id| id.0.clone());

    let kept = edit(
        &mut owner,
        &series.id.0,
        &edit_request(
            "this_only",
            Some("2099-03-09T09:00:00.000Z"),
            RecurringUpdates::default(),
        ),
    )
    .await;
    assert_eq!(category(&kept), Some(first.clone()));
    let picked = edit(
        &mut owner,
        &series.id.0,
        &edit_request(
            "this_only",
            Some("2099-03-16T09:00:00.000Z"),
            RecurringUpdates {
                category_id: Some(second.clone()),
                ..RecurringUpdates::default()
            },
        ),
    )
    .await;
    assert_eq!(category(&picked), Some(second.clone()));
    let cleared = edit(
        &mut owner,
        &series.id.0,
        &edit_request(
            "this_only",
            Some("2099-03-23T09:00:00.000Z"),
            RecurringUpdates {
                category_id: Some(String::new()),
                ..RecurringUpdates::default()
            },
        ),
    )
    .await;
    assert_eq!(category(&cleared), None);

    let untouched = edit(
        &mut owner,
        &series.id.0,
        &edit_request(
            "all",
            None,
            RecurringUpdates {
                color: Some("red".into()),
                ..RecurringUpdates::default()
            },
        ),
    )
    .await;
    assert_eq!(category(&untouched), Some(first.clone()));
    let error = ok(owner
        .put(
            &format!("/api/recurring/event/{}", series.id),
            json!({"editScope": "all", "updates": {"categoryId": foreign}}),
        )
        .await
        .expect_error(
            400,
            "Validation Error",
            "Invalid category or category does not belong to user",
        ));
    assert_eq!(error["details"], json!({"field": "categoryId"}));
    let series_cleared = edit(
        &mut owner,
        &series.id.0,
        &edit_request(
            "all",
            None,
            RecurringUpdates {
                category_id: Some(String::new()),
                ..RecurringUpdates::default()
            },
        ),
    )
    .await;
    assert_eq!(category(&series_cleared), None);
    assert_eq!(series_cleared.category, None);
}

#[tokio::test]
async fn sealed_edits_drop_the_plaintext_colour_and_category() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let mut request = encrypted_event(&calendar, SERIES_START, SERIES_END);
    request.recurrence = Some(WEEKLY_FIVE.into());
    request.color = Some("red".into());
    let series = create_event(&mut owner, &request).await;
    let sealed = || RecurringUpdates {
        encrypted_content: Some(fake_envelope()),
        attributes_encrypted: Some(true),
        color: Some("blue".into()),
        category_id: Some("not-a-category".into()),
        ..RecurringUpdates::default()
    };

    let occurrence = edit(
        &mut owner,
        &series.id.0,
        &edit_request("this_only", Some("2099-03-09T09:00:00.000Z"), sealed()),
    )
    .await;
    assert_eq!((&occurrence.color, &occurrence.category_id), (&None, &None));
    let whole = edit(
        &mut owner,
        &series.id.0,
        &edit_request("all", None, sealed()),
    )
    .await;
    assert_eq!((&whole.color, &whole.category_id), (&None, &None));
}

#[tokio::test]
async fn edits_cannot_target_other_users_or_read_only_calendars() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut other = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let foreign = calendar_id(&mut other, "Work").await;
    let feed = insert_calendar(&app, &owner.id, "subscribed", false).await;
    let series = weekly_series(&mut owner, &calendar).await;
    let before = row_snapshot(&app.db, "calendar_event", &series.id.0).await;
    for (target, message) in [
        (
            &foreign,
            "Invalid calendar or calendar does not belong to user",
        ),
        (&feed, "Cannot move events to a read-only calendar."),
    ] {
        for scope in ["all", "this_only", "this_and_future"] {
            let error = ok(owner
                .put(
                    &format!("/api/recurring/event/{}", series.id),
                    json!({"editScope": scope, "occurrenceDate": "2099-03-09T09:00:00.000Z", "updates": {"calendarId": target}}),
                )
                .await
                .expect_error(400, "Validation Error", message));
            assert_eq!(error["details"], json!({"field": "calendarId"}));
        }
    }
    assert_eq!(
        row_snapshot(&app.db, "calendar_event", &series.id.0).await,
        before
    );
    assert_eq!(exceptions(&app, &series.id.0).await, []);
    let family = calendar_id(&mut owner, "Family").await;
    let moved = edit(
        &mut owner,
        &series.id.0,
        &edit_request(
            "all",
            None,
            RecurringUpdates {
                calendar_id: Some(family.clone().into()),
                ..RecurringUpdates::default()
            },
        ),
    )
    .await;
    assert_eq!(moved.calendar.id.0, family);
}

/// A plaintext series row, as feed sync, staged invitations or a released feed leave one.
async fn plaintext_series(app: &TestApp, user_id: &str, calendar: &str) -> String {
    let id =
        insert_plaintext_event(app, user_id, calendar, "Standup", SERIES_START, SERIES_END).await;
    sqlx::query("UPDATE calendar_event SET recurrence = $2, description = 'Agenda' WHERE id = $1")
        .bind(&id)
        .bind(WEEKLY_FIVE)
        .execute(&app.db)
        .await
        .expect("series rule");
    id
}

#[tokio::test]
async fn feed_series_and_invitation_copies_stay_read_only_and_plaintext_never_moves_in() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let work = calendar_id(&mut owner, "Work").await;
    let feed = plaintext_series(
        &app,
        &owner.id,
        &insert_calendar(&app, &owner.id, "subscribed", true).await,
    )
    .await;
    sqlx::query("UPDATE calendar_event SET is_synced = true WHERE id = $1")
        .bind(&feed)
        .execute(&app.db)
        .await
        .expect("synced");
    let copy = plaintext_series(
        &app,
        &owner.id,
        &insert_staging_calendar(&app, &owner.id).await,
    )
    .await;
    sqlx::query(
        "INSERT INTO event_participant (id, event_id, user_id, email, status, role, updated_at) \
         VALUES ($1, $2, $3, $4, 'pending', 'attendee', now())",
    )
    .bind(format!("suitepart{}", hex(8)))
    .bind(&copy)
    .bind(&owner.id)
    .bind(&owner.email)
    .execute(&app.db)
    .await
    .expect("attendee row");
    // A deleted feed's calendar turns writable while its events stay plaintext.
    let released = plaintext_series(
        &app,
        &owner.id,
        &insert_calendar(&app, &owner.id, "owned", false).await,
    )
    .await;
    let before = [
        row_snapshot(&app.db, "calendar_event", &feed).await,
        row_snapshot(&app.db, "calendar_event", &copy).await,
        row_snapshot(&app.db, "calendar_event", &released).await,
    ];
    let cases = [
        (
            &feed,
            "Cannot edit synced events. Synced events are read-only.",
            None,
        ),
        (
            &copy,
            "Imported invitation events are read-only for attendees.",
            None,
        ),
        (
            &released,
            "Event encryption requires an active encryption session.",
            Some("encryptedContent"),
        ),
    ];
    for (series, message, field) in cases {
        for scope in ["all", "this_only", "this_and_future"] {
            for updates in [
                json!({"calendarId": work}),
                json!({"start": "2099-03-09T08:00:00.000Z"}),
            ] {
                let error = ok(owner
                    .put(
                        &format!("/api/recurring/event/{series}"),
                        json!({"editScope": scope, "occurrenceDate": "2099-03-09T09:00:00.000Z", "updates": updates}),
                    )
                    .await
                    .expect_error(400, "Validation Error", message));
                assert_eq!(
                    error["details"].get("field").and_then(Value::as_str),
                    field,
                    "{scope} {updates}"
                );
            }
        }
    }
    ok(owner
        .delete(&format!("/api/recurring/event/{feed}?deleteScope=all"))
        .await
        .expect_error(
            400,
            "Validation Error",
            "Cannot delete synced events. Synced events are read-only.",
        ));
    assert_eq!(
        [
            row_snapshot(&app.db, "calendar_event", &feed).await,
            row_snapshot(&app.db, "calendar_event", &copy).await,
            row_snapshot(&app.db, "calendar_event", &released).await,
        ],
        before
    );
    for series in [&feed, &copy, &released] {
        assert_eq!(exceptions(&app, series).await, []);
        assert_eq!(
            count(
                &app.db,
                "SELECT count(*) FROM calendar_event WHERE parent_event_id = $1",
                series
            )
            .await,
            0
        );
    }

    let sealed = edit(
        &mut owner,
        &released,
        &edit_request(
            "this_only",
            Some("2099-03-09T09:00:00.000Z"),
            RecurringUpdates {
                calendar_id: Some(work.clone().into()),
                encrypted_content: Some(fake_envelope()),
                ..RecurringUpdates::default()
            },
        ),
    )
    .await;
    assert_eq!(sealed.calendar.id.0, work);
    let stored = stored_content(&app.db, &sealed.id.0).await;
    assert_eq!(
        (
            stored.title.as_str(),
            stored.description,
            stored.location,
            stored.encryption_state.as_str()
        ),
        ("", None, None, "encrypted"),
        "ciphertext lets the occurrence in, without the series' plaintext"
    );
}

#[tokio::test]
async fn edit_requests_are_validated() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut other = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let series = weekly_series(&mut owner, &calendar).await;
    let single = create_event(
        &mut owner,
        &encrypted_event(&calendar, SERIES_START, SERIES_END),
    )
    .await;
    let path = format!("/api/recurring/event/{}", series.id);
    let before = row_snapshot(&app.db, "calendar_event", &series.id.0).await;

    let cases = [
        (
            json!({"editScope": "sometimes", "updates": {}}),
            "Invalid enum value. Expected 'this_only' | 'this_and_future' | 'all', received 'sometimes'",
            "editScope",
        ),
        (json!({"editScope": "all"}), "Required", "updates"),
        (
            json!({"editScope": "all", "updates": {"invitationContent": {"title": "x"}}}),
            "Invitation content is only accepted with encrypted content and participants.",
            "updates.invitationContent",
        ),
        (
            json!({"editScope": "all", "updates": {"reminder": "5"}}),
            "Expected number, received string",
            "updates.reminder",
        ),
        (
            json!({"editScope": "all", "updates": {"timezone": "Nowhere"}}),
            "Invalid timezone identifier",
            "updates.timezone",
        ),
        (
            json!({"editScope": "all", "updates": {"color": "plaid"}}),
            "Color must be one of: blue, orange, violet, rose, emerald, red, cyan, lime, amber, indigo, pink, teal or a valid hex color (e.g., #FF0000)",
            "updates.color",
        ),
        (
            json!({"editScope": "all", "updates": {"participants": [{"email": "admin@solace.onl"}]}}),
            "Cannot invite system or administrative email addresses",
            "updates.participants.0.email",
        ),
    ];
    for (body, message, path_name) in cases {
        let error =
            ok(owner
                .put(&path, body.clone())
                .await
                .expect_error(400, "Validation Error", message));
        assert_eq!(
            error["details"]["issues"][0]["path"],
            json!(path_name),
            "{body}"
        );
    }
    expect_unknown_field(
        &owner
            .put(
                &path,
                json!({"editScope": "all", "updates": {}, "userId": other.id}),
            )
            .await,
        "userId",
    );
    let error = ok(owner
        .put(
            &path,
            json!({"editScope": "all", "updates": {"userId": other.id}}),
        )
        .await
        .expect_error(
            400,
            "Validation Error",
            "Unrecognized key(s) in object: 'userId'",
        ));
    assert_eq!(error["details"]["issues"][0]["path"], json!("updates"));
    for scope in ["this_only", "this_and_future"] {
        let error = ok(owner
            .put(&path, json!({"editScope": scope, "updates": {}}))
            .await
            .expect_error(
                400,
                "Validation Error",
                &format!("Occurrence date is required for '{scope}' edit"),
            ));
        assert_eq!(error["details"], json!({"field": "occurrenceDate"}));
    }
    ok(owner
        .put(
            &path,
            json!({"editScope": "this_only", "occurrenceDate": "nonsense", "updates": {}}),
        )
        .await
        .expect_error(
            500,
            "Internal Server Error",
            "An unexpected error occurred. If this keeps happening, contact support and include the request id.",
        ));
    for (user, id) in [(&mut owner, &single.id.0), (&mut other, &series.id.0)] {
        let body = ok(user
            .put(
                &format!("/api/recurring/event/{id}"),
                json!({"editScope": "all", "updates": {"color": "red"}}),
            )
            .await
            .expect_error(400, "Validation Error", NOT_FOUND));
        assert!(body.get("details").is_none());
    }
    assert_eq!(
        row_snapshot(&app.db, "calendar_event", &series.id.0).await,
        before
    );
    assert_eq!(exceptions(&app, &series.id.0).await, []);

    let truncated = edit(
        &mut owner,
        &series.id.0,
        &edit_request(
            "all",
            None,
            RecurringUpdates {
                reminder: Some(1.5),
                ..RecurringUpdates::default()
            },
        ),
    )
    .await;
    assert_eq!(
        truncated.reminder,
        Some(1),
        "a fractional reminder is truncated"
    );
}

#[tokio::test]
async fn scoped_edits_invite_new_attendees_with_transient_content() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let series = weekly_series(&mut owner, &calendar).await;
    for (scope, occurrence) in [
        ("this_only", Some("2099-03-09T09:00:00.000Z")),
        ("this_and_future", Some("2099-03-23T09:00:00.000Z")),
        ("all", None),
    ] {
        let guest = format!("guest-{}@example.com", hex(6));
        let ciphertext = fake_envelope();
        let saved = edit(
            &mut owner,
            &series.id.0,
            &edit_request(
                scope,
                occurrence,
                RecurringUpdates {
                    encrypted_content: Some(ciphertext.clone()),
                    invitation_content: Some(InvitationContent {
                        title: "Private meeting".into(),
                        description: Some("Agenda".into()),
                        location: None,
                    }),
                    participants: Some(vec![ParticipantInput {
                        email: guest.clone(),
                        display_name: None,
                        role: None,
                        status: None,
                    }]),
                    ..RecurringUpdates::default()
                },
            ),
        )
        .await;
        let mut people: Vec<(String, String)> = saved
            .participants
            .clone()
            .expect("participants")
            .into_iter()
            .map(|p| (p.email, p.role))
            .collect();
        people.sort();
        let mut expected = vec![
            (guest.clone(), "attendee".to_owned()),
            (owner.email.clone(), "organizer".to_owned()),
        ];
        expected.sort();
        assert_eq!(people, expected, "{scope}");
        assert_eq!(
            stored_content(&app.db, &saved.id.0).await.encrypted_content,
            Some(ciphertext),
            "{scope}"
        );
        let leaked = count(
            &app.db,
            "SELECT count(*) FROM calendar_event WHERE user_id = $1 \
             AND (title LIKE '%Private meeting%' OR description LIKE '%Agenda%')",
            &owner.id,
        )
        .await;
        assert_eq!(leaked, 0, "invitation content is never stored ({scope})");

        let mail = sent_mail(&app, &guest, 1).await;
        assert_eq!(mail.len(), 1, "{scope}");
        assert!(
            mail[0]
                .subject
                .starts_with("Invitation: Private meeting @ "),
            "{}",
            mail[0].subject
        );
        let ics = unfold(mail[0].ics.as_deref().expect("invite.ics"));
        assert!(ics.contains("METHOD:REQUEST\r\n"), "{ics}");
        assert!(ics.contains("SUMMARY:Private meeting\r\n"), "{ics}");
        assert!(ics.contains("DESCRIPTION:Agenda\r\n"), "{ics}");
        let uid = saved
            .external_id
            .clone()
            .unwrap_or_else(|| format!("{}@solace-calendar.local", saved.id));
        assert!(ics.contains(&format!("UID:{uid}\r\n")), "{ics}");
        assert!(ics.contains(&format!("mailto:{guest}\r\n")), "{ics}");
    }
}

#[tokio::test]
async fn detached_occurrences_inherit_attendees_without_new_invitations() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let guest = format!("guest-{}@example.com", hex(6));
    let mut request = encrypted_event(&calendar, SERIES_START, SERIES_END);
    request.recurrence = Some(WEEKLY_FIVE.into());
    request.participants = Some(vec![ParticipantInput {
        email: guest.clone(),
        display_name: None,
        role: None,
        status: Some("accepted".into()),
    }]);
    request.invitation_content = Some(InvitationContent {
        title: "Weekly sync".into(),
        description: None,
        location: None,
    });
    let series = create_event(&mut owner, &request).await;
    assert_eq!(sent_mail(&app, &guest, 1).await.len(), 1);

    let detached = edit(
        &mut owner,
        &series.id.0,
        &edit_request(
            "this_only",
            Some("2099-03-09T09:00:00.000Z"),
            RecurringUpdates {
                start: Some("2099-03-09T11:00:00.000Z".into()),
                ..RecurringUpdates::default()
            },
        ),
    )
    .await;
    let mut people: Vec<(String, String, String, String)> = detached
        .participants
        .clone()
        .expect("participants")
        .into_iter()
        .map(|p| (p.email, p.display_name, p.role, p.status))
        .collect();
    people.sort();
    let mut expected = vec![
        (
            guest.clone(),
            guest.clone(),
            "attendee".to_owned(),
            "accepted".to_owned(),
        ),
        (
            owner.email.clone(),
            owner.name.clone(),
            "organizer".to_owned(),
            "accepted".to_owned(),
        ),
    ];
    expected.sort();
    assert_eq!(people, expected);
    tokio::time::sleep(std::time::Duration::from_millis(750)).await;
    assert_eq!(
        sent_mail(&app, &guest, 1).await.len(),
        1,
        "the copy does not re-invite"
    );
}

#[tokio::test]
async fn deleting_one_occurrence_records_a_deleted_exception() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let series = weekly_series(&mut owner, &calendar).await;
    let path = |occurrence: &str| {
        format!(
            "/api/recurring/event/{}?deleteScope=this_only&occurrenceDate={occurrence}",
            series.id
        )
    };
    let deleted: RecurringDeleted = ok(owner
        .delete(&path("2099-03-09T09:00:00.000Z"))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        deleted,
        RecurringDeleted {
            success: true,
            message: "Single occurrence deleted successfully".into(),
            deleted_event_id: series.id.clone(),
            action: "delete_occurrence".into(),
        }
    );
    ok(owner
        .delete(&path("2099-03-09T09:00:00.000Z"))
        .await
        .expect_status(200));

    let detached = edit(
        &mut owner,
        &series.id.0,
        &edit_request(
            "this_only",
            Some("2099-03-16T09:00:00.000Z"),
            RecurringUpdates::default(),
        ),
    )
    .await;
    ok(owner
        .delete(&path("2099-03-16T09:00:00.000Z"))
        .await
        .expect_status(200));
    assert_eq!(
        exceptions(&app, &series.id.0).await,
        [
            (
                "2099-03-09T09:00:00.000Z".to_owned(),
                "deleted".to_owned(),
                None
            ),
            (
                "2099-03-16T09:00:00.000Z".to_owned(),
                "deleted".to_owned(),
                Some(detached.id.0.clone())
            ),
        ],
        "an existing modified exception turns into a deletion and keeps its link"
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM calendar_event WHERE id = $1",
            &detached.id.0
        )
        .await,
        1,
        "the detached row itself stays"
    );
}

#[tokio::test]
async fn deleting_this_and_future_ends_the_series() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let series = weekly_series(&mut owner, &calendar).await;
    let deleted: RecurringDeleted = ok(owner
        .delete(&format!(
            "/api/recurring/event/{}?deleteScope=this_and_future&occurrenceDate=2099-03-23T09:00:00.000Z",
            series.id
        ))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        deleted,
        RecurringDeleted {
            success: true,
            message: "Future occurrences deleted successfully".into(),
            deleted_event_id: series.id.clone(),
            action: "delete_future".into(),
        }
    );
    assert_eq!(
        stored_rule(&app, &series.id.0).await.as_deref(),
        Some(r#"{"frequency":"weekly","interval":1,"count":5,"until":"2099-03-22T09:00:00.000Z"}"#)
    );
    let list = list_events(
        &mut owner,
        "2099-03-01T00:00:00.000Z",
        "2099-05-01T00:00:00.000Z",
    )
    .await;
    assert_eq!(list.events.len(), 3);
}

#[tokio::test]
async fn single_bulk_and_calendar_deletes_take_the_series_exceptions() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let doomed = insert_calendar(&app, &owner.id, "owned", false).await;
    let mut excepted = Vec::new();
    for calendar in [&calendar, &calendar, &doomed] {
        let series = weekly_series(&mut owner, calendar).await;
        ok(owner
            .delete(&format!(
                "/api/recurring/event/{}?deleteScope=this_only&occurrenceDate=2099-03-09T09:00:00.000Z",
                series.id
            ))
            .await
            .expect_status(200));
        assert_eq!(exceptions(&app, &series.id.0).await.len(), 1);
        excepted.push(series.id.0);
    }
    ok(owner
        .delete(&format!("/api/events/{}", excepted[0]))
        .await
        .expect_status(200));
    ok(owner
        .post(
            "/api/events/bulk",
            json!({"action": "delete", "eventIds": [excepted[1]]}),
        )
        .await
        .expect_status(200));
    ok(owner
        .delete(&format!("/api/calendars/{doomed}"))
        .await
        .expect_status(200));
    for series in &excepted {
        assert_eq!(
            count(
                &app.db,
                "SELECT count(*) FROM calendar_event WHERE id = $1",
                series
            )
            .await,
            0
        );
        let left = exceptions(&app, series).await.len();
        match app.backend {
            // recurrence_exception has no foreign key, and TypeScript leaves it behind.
            Backend::TypeScript => assert_eq!(left, 1, "{series}"),
            Backend::Rust => assert_eq!(left, 0, "{series}"),
        }
    }
}

#[tokio::test]
async fn deleting_all_removes_the_series_and_its_children() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let series = weekly_series(&mut owner, &calendar).await;
    let detached = edit(
        &mut owner,
        &series.id.0,
        &edit_request(
            "this_only",
            Some("2099-03-09T09:00:00.000Z"),
            RecurringUpdates::default(),
        ),
    )
    .await;
    let future = edit(
        &mut owner,
        &series.id.0,
        &edit_request(
            "this_and_future",
            Some("2099-03-23T09:00:00.000Z"),
            RecurringUpdates::default(),
        ),
    )
    .await;
    let grandchild = edit(
        &mut owner,
        &future.id.0,
        &edit_request(
            "this_only",
            Some("2099-03-30T09:00:00.000Z"),
            RecurringUpdates::default(),
        ),
    )
    .await;
    ok(owner
        .delete(&format!(
            "/api/recurring/event/{}?deleteScope=this_only&occurrenceDate=2099-03-16T09:00:00.000Z",
            series.id
        ))
        .await
        .expect_status(200));

    let deleted: RecurringDeleted = ok(owner
        .delete(&format!(
            "/api/recurring/event/{}?deleteScope=all",
            series.id
        ))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        deleted,
        RecurringDeleted {
            success: true,
            message: "Entire recurring series deleted successfully".into(),
            deleted_event_id: series.id.clone(),
            action: "delete_all".into(),
        }
    );
    for (id, expected) in [
        (&series.id.0, 0),
        (&detached.id.0, 0),
        (&future.id.0, 0),
        (&grandchild.id.0, 1),
    ] {
        assert_eq!(
            count(
                &app.db,
                "SELECT count(*) FROM calendar_event WHERE id = $1",
                id
            )
            .await,
            expected,
            "only direct children go"
        );
    }
    assert_eq!(exceptions(&app, &series.id.0).await, []);
    assert_eq!(
        exceptions(&app, &future.id.0).await.len(),
        1,
        "the split half's own exceptions are left behind"
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM event_notification WHERE event_id = $1",
            &series.id.0
        )
        .await,
        0
    );
}

#[tokio::test]
async fn delete_requests_are_validated() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut other = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let series = weekly_series(&mut owner, &calendar).await;
    let single = create_event(
        &mut owner,
        &encrypted_event(&calendar, SERIES_START, SERIES_END),
    )
    .await;
    let base = format!("/api/recurring/event/{}", series.id);
    let before = row_snapshot(&app.db, "calendar_event", &series.id.0).await;
    for (query, message) in [
        ("", "Required"),
        (
            "?deleteScope=nope",
            "Invalid enum value. Expected 'this_only' | 'this_and_future' | 'all', received 'nope'",
        ),
    ] {
        let error = ok(owner.delete(&format!("{base}{query}")).await.expect_error(
            400,
            "Validation Error",
            message,
        ));
        assert_eq!(error["details"]["issues"][0]["path"], json!("deleteScope"));
    }
    expect_unknown_field(
        &owner
            .delete(&format!("{base}?deleteScope=all&userId={}", other.id))
            .await,
        "userId",
    );
    for scope in ["this_only", "this_and_future"] {
        let error = ok(owner
            .delete(&format!("{base}?deleteScope={scope}"))
            .await
            .expect_error(
                400,
                "Validation Error",
                &format!("Occurrence date is required for '{scope}' delete"),
            ));
        assert_eq!(error["details"], json!({"field": "occurrenceDate"}));
    }
    ok(owner
        .delete(&format!("{base}?deleteScope=this_only&occurrenceDate=nonsense"))
        .await
        .expect_error(
            500,
            "Internal Server Error",
            "An unexpected error occurred. If this keeps happening, contact support and include the request id.",
        ));
    for (user, id) in [(&mut owner, &single.id.0), (&mut other, &series.id.0)] {
        for scope in ["all", "this_only&occurrenceDate=2099-03-09T09:00:00.000Z"] {
            ok(user
                .delete(&format!("/api/recurring/event/{id}?deleteScope={scope}"))
                .await
                .expect_error(400, "Validation Error", NOT_FOUND));
        }
    }
    assert_eq!(
        row_snapshot(&app.db, "calendar_event", &series.id.0).await,
        before
    );
    assert_eq!(exceptions(&app, &series.id.0).await, []);
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM calendar_event WHERE id = $1",
            &single.id.0
        )
        .await,
        1
    );
}
