//! `/api/notifications/event/:eventId`: per-event reminder schedules, their title ciphertext and the reminder field.

use serde_json::{Value, json};
use solace_api_types::notifications::{
    EventNotifications, NotificationDeleteData, NotificationDeleteResult, NotificationSetting,
    NotificationUpdateResult, SkippedNotification, UpdateEventNotificationsRequest,
};

use crate::event_fixtures::{
    FUTURE_END, FUTURE_START, calendar_id, create_event, encrypted_event, insert_calendar,
    insert_plaintext_event, iso_from_now, row_snapshot, to_json,
};
use crate::events::overdue_schedule_shape;
use crate::helpers::{
    Backend, TestApp, TestUser, count, expect_unauthorized, expect_unknown_field, ok,
};

const NOT_FOUND: &str = "Event not found or access denied";

fn title_ciphertext() -> String {
    format!(
        "v1.{}.{}",
        "oKGio6Slpqeoqaqr", "RzKqGz6RlCIjsse98Z5olLmi5f7PQ06_sfA4TvGmoA"
    )
}

fn setting(kind: &str, minutes: i32, enabled: bool) -> NotificationSetting {
    NotificationSetting {
        notification_type: kind.into(),
        minutes_before: minutes,
        is_enabled: enabled,
    }
}

fn update(settings: Vec<NotificationSetting>) -> UpdateEventNotificationsRequest {
    UpdateEventNotificationsRequest {
        notifications: settings,
        encrypted_display_title: None,
        display_title: None,
    }
}

async fn put(user: &mut TestUser, event: &str, body: Value) -> NotificationUpdateResult {
    ok(user
        .put(&format!("/api/notifications/event/{event}"), body)
        .await
        .expect_status(200)
        .and_then(|r| r.dto()))
}

async fn get(user: &mut TestUser, event: &str) -> EventNotifications {
    ok(user
        .get(&format!("/api/notifications/event/{event}"))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()))
}

async fn reminder(app: &TestApp, event: &str) -> Option<i32> {
    sqlx::query_scalar("SELECT reminder FROM calendar_event WHERE id = $1")
        .bind(event)
        .fetch_one(&app.db)
        .await
        .expect("reminder")
}

/// Stored schedules as (type, minutes, title ciphertext), by type then minutes.
async fn schedules(app: &TestApp, event: &str) -> Vec<(String, i32, Option<String>)> {
    sqlx::query_as(
        "SELECT notification_type, minutes_before, encrypted_display_title FROM event_notification \
         WHERE event_id = $1 ORDER BY notification_type, minutes_before",
    )
    .bind(event)
    .fetch_all(&app.db)
    .await
    .expect("schedules")
}

async fn upcoming_event(user: &mut TestUser) -> String {
    let calendar = calendar_id(user, "Work").await;
    let mut request = encrypted_event(&calendar, FUTURE_START, FUTURE_END);
    request.timezone = Some("Europe/Amsterdam".into());
    create_event(user, &request).await.id.0
}

#[tokio::test]
async fn anonymous_callers_are_refused() {
    let app = TestApp::spawn().await;
    let mut anon = app.anonymous();
    expect_unauthorized(&ok(anon.get("/api/notifications/event/x").await));
    expect_unauthorized(&ok(anon
        .put(
            "/api/notifications/event/x",
            to_json(&update(vec![setting("email", 5, true)])),
        )
        .await));
    expect_unauthorized(&ok(anon.delete("/api/notifications/event/x").await));
}

#[tokio::test]
async fn an_update_stores_enabled_schedules_and_reports_skipped_ones() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let event = upcoming_event(&mut owner).await;
    let before_updated: String = sqlx::query_scalar(
        "SELECT to_char(updated_at, 'YYYY-MM-DD\"T\"HH24:MI:SS.MS') FROM calendar_event WHERE id = $1",
    )
    .bind(&event)
    .fetch_one(&app.db)
    .await
    .expect("updated at");

    let result = put(
        &mut owner,
        &event,
        to_json(&update(vec![
            setting("email", 30, true),
            setting("browser", 10, true),
            setting("email", 5, true),
            setting("browser", 60, false),
        ])),
    )
    .await;
    assert_eq!(
        (result.success, result.message.as_str()),
        (true, "Event notifications updated successfully")
    );
    let data = result.data.expect("data");
    assert_eq!(
        (data.event_id.0.as_str(), data.created, data.skipped),
        (event.as_str(), 3, 1)
    );
    let created: Vec<(String, i32, String, String, String, bool)> = data
        .details
        .created_notifications
        .iter()
        .map(|n| {
            (
                n.kind.clone(),
                n.minutes_before,
                n.notification_time.0.clone(),
                n.notification_date_local.clone(),
                n.notification_timezone.clone(),
                n.is_enabled,
            )
        })
        .collect();
    assert_eq!(
        created,
        [
            (
                "email".to_owned(),
                30,
                "2099-03-02T08:30:00.000Z".to_owned(),
                "2099-03-02T09:30:00".to_owned(),
                "Europe/Amsterdam".to_owned(),
                true
            ),
            (
                "browser".to_owned(),
                10,
                "2099-03-02T08:50:00.000Z".to_owned(),
                "2099-03-02T09:50:00".to_owned(),
                "Europe/Amsterdam".to_owned(),
                true
            ),
            (
                "email".to_owned(),
                5,
                "2099-03-02T08:55:00.000Z".to_owned(),
                "2099-03-02T09:55:00".to_owned(),
                "Europe/Amsterdam".to_owned(),
                true
            ),
        ],
        "created in request order"
    );
    assert_eq!(
        data.details.skipped_configurations,
        [SkippedNotification {
            notification_type: "browser".into(),
            minutes_before: 60,
            reason: "disabled".into(),
        }]
    );
    assert_eq!(
        schedules(&app, &event).await,
        [
            ("browser".to_owned(), 10, None),
            ("email".to_owned(), 5, None),
            ("email".to_owned(), 30, None),
        ]
    );
    let ids: Vec<String> =
        sqlx::query_scalar("SELECT id FROM event_notification WHERE event_id = $1 ORDER BY id")
            .bind(&event)
            .fetch_all(&app.db)
            .await
            .expect("ids");
    let mut answered: Vec<String> = data
        .details
        .created_notifications
        .iter()
        .map(|n| n.id.0.clone())
        .collect();
    answered.sort();
    assert_eq!(ids, answered, "the answer names the stored rows");
    assert_eq!(
        reminder(&app, &event).await,
        Some(5),
        "the earliest enabled email reminder"
    );
    let after_updated: String = sqlx::query_scalar(
        "SELECT to_char(updated_at, 'YYYY-MM-DD\"T\"HH24:MI:SS.MS') FROM calendar_event WHERE id = $1",
    )
    .bind(&event)
    .fetch_one(&app.db)
    .await
    .expect("updated at");
    assert!(
        after_updated > before_updated,
        "the reminder write touches the event"
    );

    let listed = get(&mut owner, &event).await;
    assert!(listed.success);
    assert_eq!(
        (listed.data.event_id.0.as_str(), listed.data.count),
        (event.as_str(), 3)
    );
    let order: Vec<(String, i32)> = listed
        .data
        .notifications
        .iter()
        .map(|n| (n.notification_type.clone(), n.minutes_before))
        .collect();
    assert_eq!(
        order,
        [
            ("browser".to_owned(), 10),
            ("email".to_owned(), 5),
            ("email".to_owned(), 30),
        ],
        "listed by type, then lead time"
    );
    let first = &listed.data.notifications[0];
    assert_eq!(
        (
            first.notification_time.0.as_str(),
            first.notification_date_local.as_str(),
            first.notification_timezone.as_str(),
            first.is_enabled,
            first.is_sent
        ),
        (
            "2099-03-02T08:50:00.000Z",
            "2099-03-02T09:50:00",
            "Europe/Amsterdam",
            true,
            false
        )
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM notification_job WHERE user_id = $1",
            &owner.id
        )
        .await,
        0,
        "the worker turns schedules into outbox jobs"
    );
}

#[tokio::test]
async fn the_reminder_field_follows_the_earliest_enabled_email_reminder() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let event = upcoming_event(&mut owner).await;
    put(
        &mut owner,
        &event,
        to_json(&update(vec![
            setting("email", 60, true),
            setting("email", 15, true),
        ])),
    )
    .await;
    assert_eq!(reminder(&app, &event).await, Some(15));
    put(
        &mut owner,
        &event,
        to_json(&update(vec![
            setting("email", 60, true),
            setting("email", 15, false),
        ])),
    )
    .await;
    assert_eq!(
        reminder(&app, &event).await,
        Some(60),
        "disabled ones do not count"
    );
    put(
        &mut owner,
        &event,
        to_json(&update(vec![setting("browser", 5, true)])),
    )
    .await;
    assert_eq!(
        reminder(&app, &event).await,
        None,
        "browser reminders leave it empty"
    );
    assert_eq!(
        schedules(&app, &event).await,
        [("browser".to_owned(), 5, None)]
    );
    put(&mut owner, &event, to_json(&update(vec![]))).await;
    assert_eq!(schedules(&app, &event).await, []);
}

#[tokio::test]
async fn the_title_ciphertext_is_stored_kept_and_cleared() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let event = upcoming_event(&mut owner).await;
    let title = title_ciphertext();
    let mut request = update(vec![
        setting("email", 15, true),
        setting("browser", 5, true),
    ]);
    request.encrypted_display_title = Some(Some(title.clone()));
    put(&mut owner, &event, to_json(&request)).await;
    assert_eq!(
        schedules(&app, &event).await,
        [
            ("browser".to_owned(), 5, Some(title.clone())),
            ("email".to_owned(), 15, Some(title.clone())),
        ]
    );

    put(
        &mut owner,
        &event,
        to_json(&update(vec![setting("email", 20, true)])),
    )
    .await;
    assert_eq!(
        schedules(&app, &event).await,
        [("email".to_owned(), 20, Some(title.clone()))],
        "an omitted title keeps the stored ciphertext"
    );

    let mut legacy = update(vec![setting("email", 25, true)]);
    legacy.display_title = Some(Some("Lunch with Sam".into()));
    put(&mut owner, &event, to_json(&legacy)).await;
    assert_eq!(
        schedules(&app, &event).await,
        [("email".to_owned(), 25, Some(title.clone()))],
        "a plaintext title from shipped binaries is accepted and dropped"
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM event_notification WHERE event_id = $1 AND encrypted_display_title LIKE '%Lunch%'",
            &event
        )
        .await,
        0
    );
    let mut legacy_null = update(vec![setting("email", 25, true)]);
    legacy_null.display_title = Some(None);
    put(&mut owner, &event, to_json(&legacy_null)).await;

    let mut cleared = update(vec![setting("email", 30, true)]);
    cleared.encrypted_display_title = Some(None);
    put(&mut owner, &event, to_json(&cleared)).await;
    assert_eq!(
        schedules(&app, &event).await,
        [("email".to_owned(), 30, None)],
        "null clears it"
    );

    let calendar = calendar_id(&mut owner, "Work").await;
    let plain = insert_plaintext_event(
        &app,
        &owner.id,
        &calendar,
        "Lunch with Sam",
        FUTURE_START,
        FUTURE_END,
    )
    .await;
    put(
        &mut owner,
        &plain,
        to_json(&update(vec![setting("email", 10, true)])),
    )
    .await;
    assert_eq!(
        schedules(&app, &plain).await,
        [("email".to_owned(), 10, None)],
        "the title is never derived from the event row"
    );
}

#[tokio::test]
async fn title_ciphertext_and_settings_are_validated() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let event = upcoming_event(&mut owner).await;
    put(
        &mut owner,
        &event,
        to_json(&update(vec![setting("email", 15, true)])),
    )
    .await;
    let before = schedules(&app, &event).await;
    let one = json!([{"notificationType": "email", "minutesBefore": 15, "isEnabled": true}]);
    let cases = [
        (
            json!({"notifications": one, "encryptedDisplayTitle": "Lunch with Sam"}),
            "Invalid",
            "encryptedDisplayTitle",
        ),
        (
            json!({"notifications": one, "encryptedDisplayTitle": format!("v1.oKGio6Slpqeoqaqr.{}", "A".repeat(1200))}),
            "String must contain at most 1200 character(s)",
            "encryptedDisplayTitle",
        ),
        (
            json!({"notifications": one, "encryptedDisplayTitle": "v1.short.RzKqGz6RlCIjsse98Z5olLmi5f7PQ06"}),
            "Invalid",
            "encryptedDisplayTitle",
        ),
        (
            json!({"notifications": one, "displayTitle": "x".repeat(256)}),
            "String must contain at most 255 character(s)",
            "displayTitle",
        ),
        (json!({}), "Required", "notifications"),
        (
            json!({"notifications": [{"notificationType": "sms", "minutesBefore": 5, "isEnabled": true}]}),
            "Invalid enum value. Expected 'browser' | 'email', received 'sms'",
            "notifications.0.notificationType",
        ),
        (
            json!({"notifications": [{"notificationType": "email", "minutesBefore": 43201, "isEnabled": true}]}),
            "Number must be less than or equal to 43200",
            "notifications.0.minutesBefore",
        ),
        (
            json!({"notifications": [{"notificationType": "email", "minutesBefore": -1, "isEnabled": true}]}),
            "Number must be greater than or equal to 0",
            "notifications.0.minutesBefore",
        ),
        (
            json!({"notifications": [{"notificationType": "email", "minutesBefore": 1.5, "isEnabled": true}]}),
            "Expected integer, received float",
            "notifications.0.minutesBefore",
        ),
        (
            json!({"notifications": [{"notificationType": "email", "minutesBefore": 5, "isEnabled": "yes"}]}),
            "Expected boolean, received string",
            "notifications.0.isEnabled",
        ),
        (
            json!({"notifications": [{"notificationType": "email", "minutesBefore": 5}]}),
            "Required",
            "notifications.0.isEnabled",
        ),
        (
            json!({"notifications": [{"notificationType": "email", "minutesBefore": 5, "isEnabled": true, "channel": "x"}]}),
            "Unrecognized key(s) in object: 'channel'",
            "notifications.0",
        ),
        (
            json!({"notifications": vec![json!({"notificationType": "email", "minutesBefore": 1, "isEnabled": true}); 21]}),
            "Array must contain at most 20 element(s)",
            "notifications",
        ),
    ];
    for (body, message, path) in cases {
        let error = ok(owner
            .put(&format!("/api/notifications/event/{event}"), body)
            .await
            .expect_error(400, "Validation Error", message));
        assert_eq!(error["details"]["issues"][0]["path"], json!(path), "{path}");
    }
    expect_unknown_field(
        &owner
            .put(
                &format!("/api/notifications/event/{event}"),
                json!({"notifications": one, "userId": owner.id}),
            )
            .await,
        "userId",
    );
    let duplicate = ok(owner
        .put(
            &format!("/api/notifications/event/{event}"),
            json!({"notifications": [
                {"notificationType": "email", "minutesBefore": 15, "isEnabled": true},
                {"notificationType": "email", "minutesBefore": 15, "isEnabled": false},
            ]}),
        )
        .await
        .expect_error(
            400,
            "Validation Error",
            "Duplicate notification configurations are not allowed",
        ));
    assert!(duplicate.get("details").is_none());
    assert_eq!(schedules(&app, &event).await, before);
}

#[tokio::test]
async fn past_events_skip_every_schedule() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let event = upcoming_event(&mut owner).await;
    put(
        &mut owner,
        &event,
        to_json(&update(vec![setting("email", 15, true)])),
    )
    .await;
    let start = iso_from_now(&app.db, -7200).await;
    let end = iso_from_now(&app.db, -3600).await;
    ok(owner
        .put(
            &format!("/api/events/{event}"),
            json!({"start": start, "end": end}),
        )
        .await
        .expect_status(200));
    assert_eq!(
        schedules(&app, &event).await,
        [],
        "moving into the past drops schedules"
    );

    let result = put(
        &mut owner,
        &event,
        to_json(&update(vec![
            setting("email", 10, true),
            setting("browser", 5, false),
        ])),
    )
    .await;
    let data = result.data.clone().expect("data");
    assert_eq!(
        result.message,
        "Event is in the past; notifications skipped"
    );
    assert_eq!((data.created, data.skipped), (0, 2));
    assert_eq!(data.details.created_notifications, []);
    assert_eq!(
        data.details
            .skipped_configurations
            .iter()
            .map(|s| (
                s.notification_type.as_str(),
                s.minutes_before,
                s.reason.as_str()
            ))
            .collect::<Vec<_>>(),
        [
            ("email", 10, "event_in_past"),
            ("browser", 5, "event_in_past")
        ]
    );
    assert_eq!(schedules(&app, &event).await, []);
    assert_eq!(
        reminder(&app, &event).await,
        Some(10),
        "the reminder field is still written"
    );
}

#[tokio::test]
async fn an_overdue_schedule_fires_on_the_next_minute() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let start = iso_from_now(&app.db, 2 * 3600).await;
    let end = iso_from_now(&app.db, 3 * 3600).await;
    let event = create_event(&mut owner, &encrypted_event(&calendar, &start, &end))
        .await
        .id
        .0;
    put(
        &mut owner,
        &event,
        to_json(&update(vec![setting("email", 30, true)])),
    )
    .await;
    let before = row_snapshot(&app.db, "calendar_event", &event).await;

    let response = owner
        .put(
            &format!("/api/notifications/event/{event}"),
            to_json(&update(vec![setting("email", 1440, true)])),
        )
        .await;
    match app.backend {
        // TypeScript clamps to the current minute, which breaks chk_notification_time_future and fails the whole transaction.
        Backend::TypeScript => {
            let error = ok(response.expect_error(
                500,
                "Internal Server Error",
                "An unexpected error occurred. If this keeps happening, contact support and include the request id.",
            ));
            assert!(error["requestId"].is_string());
            assert_eq!(
                schedules(&app, &event).await,
                [("email".to_owned(), 30, None)]
            );
            assert_eq!(
                row_snapshot(&app.db, "calendar_event", &event).await,
                before
            );
        }
        Backend::Rust => {
            let result: NotificationUpdateResult =
                ok(response.expect_status(200).and_then(|r| r.dto()));
            let data = result.data.expect("data");
            assert_eq!((data.created, data.skipped), (1, 0));
            assert_eq!(data.details.created_notifications[0].minutes_before, 1440);
            assert_eq!(
                schedules(&app, &event).await,
                [("email".to_owned(), 1440, None)]
            );
            assert_eq!(reminder(&app, &event).await, Some(1440));
            assert_eq!(
                overdue_schedule_shape(&app, &event).await,
                (true, true, true, true)
            );
        }
    }
}

#[tokio::test]
async fn deleting_removes_every_schedule_and_the_reminder_field() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let event = upcoming_event(&mut owner).await;
    put(
        &mut owner,
        &event,
        to_json(&update(vec![
            setting("email", 15, true),
            setting("browser", 5, true),
        ])),
    )
    .await;
    let deleted: NotificationDeleteResult = ok(owner
        .delete(&format!("/api/notifications/event/{event}"))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        deleted,
        NotificationDeleteResult {
            success: true,
            message: "Successfully deleted 2 notifications for event".into(),
            data: Some(NotificationDeleteData {
                event_id: event.clone().into(),
                deleted_count: 2,
            }),
            deleted_count: None,
        }
    );
    assert_eq!(schedules(&app, &event).await, []);
    assert_eq!(reminder(&app, &event).await, None);
    let again: NotificationDeleteResult = ok(owner
        .delete(&format!("/api/notifications/event/{event}"))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        again.message,
        "Successfully deleted 0 notifications for event"
    );
    let listed = get(&mut owner, &event).await;
    assert_eq!((listed.data.count, listed.data.notifications.len()), (0, 0));
}

#[tokio::test]
async fn recurring_instances_and_synced_events_have_no_reminders() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut other = app.user().await;
    let event = upcoming_event(&mut owner).await;
    let feed = insert_calendar(&app, &owner.id, "subscribed", true).await;
    let synced = insert_plaintext_event(
        &app,
        &owner.id,
        &feed,
        "Feed item",
        FUTURE_START,
        FUTURE_END,
    )
    .await;
    sqlx::query("UPDATE calendar_event SET is_synced = true WHERE id = $1")
        .bind(&synced)
        .execute(&app.db)
        .await
        .expect("synced");
    let instance = format!("{event}_2099-03-09T09:00:00.000Z");
    for (is_owner, id) in [
        (true, instance.clone()),
        (true, synced.clone()),
        (false, instance.clone()),
        (false, "missing_2099-03-09T09:00:00.000Z".to_owned()),
    ] {
        let user = if is_owner { &mut owner } else { &mut other };
        let listed = get(user, &id).await;
        assert_eq!(
            to_json(&listed),
            json!({"success": true, "data": {"eventId": id, "notifications": [], "count": 0}})
        );
        let updated = put(user, &id, to_json(&update(vec![setting("email", 5, true)]))).await;
        assert_eq!(
            to_json(&updated),
            json!({"success": true, "message": "No notifications to update for this event type"})
        );
        let deleted: NotificationDeleteResult = ok(user
            .delete(&format!("/api/notifications/event/{id}"))
            .await
            .expect_status(200)
            .and_then(|r| r.dto()));
        assert_eq!(
            deleted,
            NotificationDeleteResult {
                success: true,
                message: "No notifications to delete for this event type".into(),
                data: None,
                deleted_count: Some(0),
            },
            "instance ids answer without any lookup, even for other users"
        );
    }
    assert_eq!(schedules(&app, &event).await, []);
    assert_eq!(schedules(&app, &synced).await, []);
}

#[tokio::test]
async fn other_users_get_not_found() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut other = app.user().await;
    let event = upcoming_event(&mut owner).await;
    put(
        &mut owner,
        &event,
        to_json(&update(vec![setting("email", 15, true)])),
    )
    .await;
    let before = row_snapshot(&app.db, "calendar_event", &event).await;
    for id in [event.as_str(), "missing-event"] {
        let path = format!("/api/notifications/event/{id}");
        for response in [
            other.get(&path).await,
            other
                .put(&path, to_json(&update(vec![setting("email", 5, true)])))
                .await,
            other.delete(&path).await,
        ] {
            let body = ok(response.expect_error(404, "Not Found", NOT_FOUND));
            assert!(body["requestId"].is_string());
        }
    }
    assert_eq!(
        schedules(&app, &event).await,
        [("email".to_owned(), 15, None)]
    );
    assert_eq!(
        row_snapshot(&app.db, "calendar_event", &event).await,
        before
    );
}

#[tokio::test]
async fn calendars_forcing_full_encryption_still_take_reminders() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    sqlx::query("UPDATE calendar SET force_full_encryption = true WHERE id = $1")
        .bind(&calendar)
        .execute(&app.db)
        .await
        .expect("force encryption");
    let event = create_event(
        &mut owner,
        &encrypted_event(&calendar, FUTURE_START, FUTURE_END),
    )
    .await
    .id
    .0;
    let result = put(
        &mut owner,
        &event,
        to_json(&update(vec![setting("email", 15, true)])),
    )
    .await;
    assert_eq!(result.data.map(|d| d.created), Some(1));
    assert_eq!(reminder(&app, &event).await, Some(15));
}

#[tokio::test]
async fn writes_are_rate_limited_per_event_url() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let event = upcoming_event(&mut owner).await;
    let neighbour = upcoming_event(&mut owner).await;
    let path = format!("/api/notifications/event/{event}");
    for attempt in 0..20 {
        let response = if attempt % 2 == 0 {
            owner
                .put(&path, to_json(&update(vec![setting("email", 15, true)])))
                .await
        } else {
            owner.delete(&path).await
        };
        ok(response.expect_status(200));
    }
    for limited in [
        owner.delete(&path).await,
        owner
            .put(&path, to_json(&update(vec![setting("email", 15, true)])))
            .await,
    ] {
        let retry: u64 = limited
            .headers
            .get("retry-after")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse().ok())
            .expect("Retry-After seconds");
        assert!(
            (1..=60).contains(&retry),
            "the rest of the 60 s window: {retry}"
        );
        ok(limited.expect_error(
            429,
            "Too Many Requests",
            &format!("Rate limit exceeded. Try again in {retry} seconds."),
        ));
    }
    get(&mut owner, &event).await;
    put(
        &mut owner,
        &neighbour,
        to_json(&update(vec![setting("email", 15, true)])),
    )
    .await;
}
