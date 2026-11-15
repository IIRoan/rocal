//! `/api/events/trash`: deletes move events into the owner's trash, restores bring them back under the same ids and ciphertext, purges delete for good.

use serde_json::{Value, json};
use solace_api_types::SuccessMessage;
use solace_api_types::events::{
    BulkEventResult, Event, EventDeleted, ParticipantInput, TrashedEvent, TrashedEventList,
};
use solace_api_types::recurring::RecurringDeleted;
use sqlx::PgPool;

use crate::event_fixtures::{
    FUTURE_END, FUTURE_START, calendar_id, create_event, encrypted_event, list_events, row_snapshot,
};
use crate::helpers::{TestApp, TestUser, count, expect_unauthorized, hex, ok};

const NOT_FOUND: &str = "Trashed event not found";

async fn trash(user: &mut TestUser) -> Vec<TrashedEvent> {
    ok(user
        .get("/api/events/trash")
        .await
        .expect_status(200)
        .and_then(|r| r.dto::<TrashedEventList>()))
    .events
}

async fn delete(user: &mut TestUser, id: &str) -> String {
    let deleted: EventDeleted = ok(user
        .delete(&format!("/api/events/{id}"))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    deleted.trash_id.expect("trash id").0
}

async fn restore(user: &mut TestUser, trash_id: &str) -> Event {
    ok(user
        .post(&format!("/api/events/trash/{trash_id}/restore"), json!({}))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()))
}

async fn trash_rows(db: &PgPool, user: &TestUser) -> i64 {
    count(
        db,
        "SELECT count(*) FROM event_trash WHERE user_id = $1",
        &user.id,
    )
    .await
}

/// A row as JSON without `updated_at`, which a restore stamps.
async fn snapshot(db: &PgPool, table: &str, id: &str) -> Option<Value> {
    row_snapshot(db, table, id).await.map(|mut row| {
        if let Some(row) = row.as_object_mut() {
            row.remove("updated_at");
        }
        row
    })
}

/// `(id, minutes_before, is_sent)` of an event's reminders, by minutes.
async fn reminders(db: &PgPool, event_id: &str) -> Vec<(String, i32, bool)> {
    sqlx::query_as(
        "SELECT id, minutes_before, is_sent FROM event_notification WHERE event_id = $1 ORDER BY minutes_before",
    )
    .bind(event_id)
    .fetch_all(db)
    .await
    .expect("reminders")
}

/// `(email, role, status)` of an event's participants, by email.
async fn participants(db: &PgPool, event_id: &str) -> Vec<(String, String, String)> {
    sqlx::query_as(
        "SELECT p.email, p.role, p.status FROM event_participant p WHERE p.event_id = $1 ORDER BY p.email",
    )
    .bind(event_id)
    .fetch_all(db)
    .await
    .expect("participants")
}

/// `(date, type, modified event)` of a series' exceptions, oldest first.
async fn exceptions(db: &PgPool, series_id: &str) -> Vec<(String, String, Option<String>)> {
    sqlx::query_as(
        "SELECT to_char(exception_date, 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'), type, modified_event_id \
         FROM recurrence_exception WHERE parent_event_id = $1 ORDER BY exception_date",
    )
    .bind(series_id)
    .fetch_all(db)
    .await
    .expect("exceptions")
}

#[tokio::test]
async fn a_deleted_event_waits_in_the_trash_and_comes_back_unchanged() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let mut request = encrypted_event(&calendar, FUTURE_START, FUTURE_END);
    request.participants = Some(vec![ParticipantInput {
        email: "guest@example.com".into(),
        display_name: Some("Guest".into()),
        role: None,
        status: Some("tentative".into()),
    }]);
    let event = create_event(&mut owner, &request).await;
    ok(owner
        .put(
            &format!("/api/notifications/event/{}", event.id),
            json!({"notifications": [
                {"notificationType": "browser", "minutesBefore": 15, "isEnabled": true},
                {"notificationType": "email", "minutesBefore": 60, "isEnabled": true},
            ]}),
        )
        .await
        .expect_status(200));
    sqlx::query(
        "UPDATE event_notification SET is_sent = true WHERE event_id = $1 AND minutes_before = 60",
    )
    .bind(&event.id.0)
    .execute(&app.db)
    .await
    .expect("mark sent");
    let row = snapshot(&app.db, "calendar_event", &event.id.0).await;
    let people = participants(&app.db, &event.id.0).await;
    let unsent = reminders(&app.db, &event.id.0).await[0].clone();

    let trash_id = delete(&mut owner, &event.id.0).await;
    ok(owner
        .get(&format!("/api/events/{}", event.id))
        .await
        .expect_error(400, "Validation Error", "Event not found or access denied"));
    assert!(reminders(&app.db, &event.id.0).await.is_empty());
    assert!(participants(&app.db, &event.id.0).await.is_empty());

    let listed = trash(&mut owner).await;
    assert_eq!(listed.len(), 1);
    let entry = &listed[0];
    assert_eq!(
        (
            entry.id.0.as_str(),
            &entry.event_id,
            entry.calendar_id.0.as_str()
        ),
        (trash_id.as_str(), &event.id, calendar.as_str())
    );
    assert_eq!(
        (
            entry.title.as_str(),
            entry.encrypted_content.as_ref(),
            entry.calendar_missing
        ),
        ("", event.encrypted_content.as_ref(), false),
        "the trash holds ciphertext only"
    );
    assert_eq!(
        (entry.start.0.as_str(), entry.end.0.as_str()),
        (FUTURE_START, FUTURE_END)
    );
    let purge_at: String = sqlx::query_scalar(
        "SELECT to_char(trashed_at + interval '30 days', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') FROM event_trash WHERE id = $1",
    )
    .bind(&trash_id)
    .fetch_one(&app.db)
    .await
    .expect("trashed at");
    assert_eq!(entry.purge_at.0, purge_at);

    let restored = restore(&mut owner, &trash_id).await;
    assert_eq!(
        (
            &restored.id,
            &restored.encrypted_content,
            restored.calendar_id.0.as_str()
        ),
        (&event.id, &event.encrypted_content, calendar.as_str())
    );
    assert_eq!(snapshot(&app.db, "calendar_event", &event.id.0).await, row);
    assert_eq!(
        reminders(&app.db, &event.id.0).await,
        [unsent],
        "only the unsent upcoming reminder comes back"
    );
    assert_eq!(participants(&app.db, &event.id.0).await, people);
    assert!(trash(&mut owner).await.is_empty());
    ok(owner
        .post(&format!("/api/events/trash/{trash_id}/restore"), json!({}))
        .await
        .expect_error(404, "Not Found", NOT_FOUND));
}

#[tokio::test]
async fn a_series_comes_back_with_its_exceptions_and_detached_occurrence() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let mut request = encrypted_event(
        &calendar,
        "2099-03-02T09:00:00.000Z",
        "2099-03-02T10:00:00.000Z",
    );
    request.recurrence = Some(r#"{"frequency":"weekly","interval":1,"count":4}"#.into());
    let series = create_event(&mut owner, &request).await;
    let only: RecurringDeleted = ok(owner
        .delete(&format!(
            "/api/recurring/event/{}?deleteScope=this_only&occurrenceDate=2099-03-09T09:00:00.000Z",
            series.id
        ))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(only.trash_id, None, "one occurrence is deleted for good");
    let detached: Event = ok(owner
        .put(
            &format!("/api/recurring/event/{}", series.id),
            json!({
                "editScope": "this_only",
                "occurrenceDate": "2099-03-16T09:00:00.000Z",
                "updates": {"start": "2099-03-16T14:00:00.000Z", "end": "2099-03-16T15:00:00.000Z"},
            }),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(trash_rows(&app.db, &owner).await, 0);
    let listed = |events: Vec<Event>| events.into_iter().map(|e| e.id.0).collect::<Vec<_>>();
    let before = listed(
        list_events(
            &mut owner,
            "2099-03-01T00:00:00.000Z",
            "2099-03-31T23:59:59.000Z",
        )
        .await
        .events,
    );
    let stored = exceptions(&app.db, &series.id.0).await;
    assert_eq!(stored.len(), 2);

    let deleted: RecurringDeleted = ok(owner
        .delete(&format!(
            "/api/recurring/event/{}?deleteScope=all",
            series.id
        ))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    let trash_id = deleted.trash_id.expect("trash id").0;
    for id in [&series.id.0, &detached.id.0] {
        assert_eq!(row_snapshot(&app.db, "calendar_event", id).await, None);
    }
    assert!(exceptions(&app.db, &series.id.0).await.is_empty());
    assert_eq!(
        trash(&mut owner).await[0].recurrence.as_deref(),
        Some(r#"{"frequency":"weekly","interval":1,"count":4}"#)
    );

    restore(&mut owner, &trash_id).await;
    assert_eq!(
        listed(
            list_events(
                &mut owner,
                "2099-03-01T00:00:00.000Z",
                "2099-03-31T23:59:59.000Z"
            )
            .await
            .events
        ),
        before
    );
    assert_eq!(exceptions(&app.db, &series.id.0).await, stored);
}

#[tokio::test]
async fn a_detached_occurrence_restored_alone_relinks_to_its_series() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let mut request = encrypted_event(
        &calendar,
        "2099-03-02T09:00:00.000Z",
        "2099-03-02T10:00:00.000Z",
    );
    request.recurrence = Some(r#"{"frequency":"weekly","interval":1,"count":4}"#.into());
    let series = create_event(&mut owner, &request).await;
    let detached: Event = ok(owner
        .put(
            &format!("/api/recurring/event/{}", series.id),
            json!({
                "editScope": "this_only",
                "occurrenceDate": "2099-03-16T09:00:00.000Z",
                "updates": {"start": "2099-03-16T14:00:00.000Z", "end": "2099-03-16T15:00:00.000Z"},
            }),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    let linked = exceptions(&app.db, &series.id.0).await;

    let trash_id = delete(&mut owner, &detached.id.0).await;
    assert_eq!(
        exceptions(&app.db, &series.id.0).await[0].2,
        None,
        "the series forgets the deleted occurrence"
    );
    restore(&mut owner, &trash_id).await;
    assert_eq!(exceptions(&app.db, &series.id.0).await, linked);
}

#[tokio::test]
async fn a_restore_without_its_calendar_lands_in_the_default_one_and_drops_a_deleted_category() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let work = calendar_id(&mut owner, "Work").await;
    let personal = calendar_id(&mut owner, "Personal").await;
    let category = format!("suitecat{}", hex(8));
    sqlx::query(
        "INSERT INTO event_category (id, name, color, is_active, user_id, created_at, updated_at) \
         VALUES ($1, '', '#16a34a', true, $2, now(), now())",
    )
    .bind(&category)
    .bind(&owner.id)
    .execute(&app.db)
    .await
    .expect("insert category");
    let mut request = encrypted_event(&work, FUTURE_START, FUTURE_END);
    request.category_id = Some(category.clone().into());
    let event = create_event(&mut owner, &request).await;
    assert_eq!(
        event.category_id.as_ref().map(|id| id.0.as_str()),
        Some(category.as_str())
    );
    let trash_id = delete(&mut owner, &event.id.0).await;
    for (table, id) in [("event_category", &category), ("calendar", &work)] {
        sqlx::query(&format!("DELETE FROM {table} WHERE id = $1"))
            .bind(id)
            .execute(&app.db)
            .await
            .expect("delete");
    }
    assert!(trash(&mut owner).await[0].calendar_missing);

    let restored = restore(&mut owner, &trash_id).await;
    assert_eq!(
        (restored.id, restored.calendar_id.0, restored.category_id),
        (event.id, personal, None)
    );
}

#[tokio::test]
async fn the_trash_is_private_to_its_owner() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut other = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let event = create_event(
        &mut owner,
        &encrypted_event(&calendar, FUTURE_START, FUTURE_END),
    )
    .await;
    let trash_id = delete(&mut owner, &event.id.0).await;

    assert!(trash(&mut other).await.is_empty());
    ok(other
        .post(&format!("/api/events/trash/{trash_id}/restore"), json!({}))
        .await
        .expect_error(404, "Not Found", NOT_FOUND));
    ok(other
        .delete(&format!("/api/events/trash/{trash_id}"))
        .await
        .expect_error(404, "Not Found", NOT_FOUND));
    ok(other.delete("/api/events/trash").await.expect_status(200));
    let mut anonymous = app.anonymous();
    expect_unauthorized(&ok(anonymous.get("/api/events/trash").await));
    expect_unauthorized(&ok(anonymous.delete("/api/events/trash").await));
    expect_unauthorized(&ok(anonymous
        .post(&format!("/api/events/trash/{trash_id}/restore"), json!({}))
        .await));
    expect_unauthorized(&ok(anonymous
        .delete(&format!("/api/events/trash/{trash_id}"))
        .await));
    assert_eq!(trash_rows(&app.db, &owner).await, 1);
    assert_eq!(
        row_snapshot(&app.db, "calendar_event", &event.id.0).await,
        None
    );
}

#[tokio::test]
async fn bulk_deletes_trash_each_event_once_and_purges_delete_for_good() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let single = create_event(
        &mut owner,
        &encrypted_event(&calendar, FUTURE_START, FUTURE_END),
    )
    .await;
    let mut request = encrypted_event(
        &calendar,
        "2099-03-02T09:00:00.000Z",
        "2099-03-02T10:00:00.000Z",
    );
    request.recurrence = Some(r#"{"frequency":"weekly","interval":1,"count":4}"#.into());
    let series = create_event(&mut owner, &request).await;
    let detached: Event = ok(owner
        .put(
            &format!("/api/recurring/event/{}", series.id),
            json!({
                "editScope": "this_only",
                "occurrenceDate": "2099-03-16T09:00:00.000Z",
                "updates": {"start": "2099-03-16T14:00:00.000Z", "end": "2099-03-16T15:00:00.000Z"},
            }),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));

    let bulk: BulkEventResult = ok(owner
        .post(
            "/api/events/bulk",
            json!({"action": "delete", "eventIds": [single.id, series.id, detached.id]}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(bulk.events_processed, 3);
    let listed = trash(&mut owner).await;
    let mut roots: Vec<&str> = listed
        .iter()
        .map(|entry| entry.event_id.0.as_str())
        .collect();
    roots.sort_unstable();
    let mut expected = [single.id.0.as_str(), series.id.0.as_str()];
    expected.sort_unstable();
    assert_eq!(roots, expected, "the occurrence goes with its series");

    let purged: SuccessMessage = ok(owner
        .delete(&format!("/api/events/trash/{}", listed[0].id))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert!(purged.success);
    assert_eq!(trash(&mut owner).await.len(), 1);
    ok(owner
        .delete(&format!("/api/events/trash/{}", listed[0].id))
        .await
        .expect_error(404, "Not Found", NOT_FOUND));
    ok(owner.delete("/api/events/trash").await.expect_status(200));
    assert_eq!(trash_rows(&app.db, &owner).await, 0);
    ok(owner
        .post(
            &format!("/api/events/trash/{}/restore", listed[1].id),
            json!({}),
        )
        .await
        .expect_error(404, "Not Found", NOT_FOUND));
}

#[tokio::test]
async fn racing_deletes_of_one_event_leave_one_trash_entry() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let mut twin = owner.agent.clone();
    let mut events = Vec::new();
    // Two requests interleave most of the time, not every time, so several races run.
    for round in 0..6 {
        let request = encrypted_event(&calendar, FUTURE_START, FUTURE_END);
        let id = create_event(&mut owner, &request).await.id.0;
        let single = format!("/api/events/{id}");
        let (first, second) = if round % 2 == 0 {
            tokio::join!(owner.agent.delete(&single), twin.delete(&single))
        } else {
            let bulk = json!({"action": "delete", "eventIds": [id]});
            tokio::join!(
                owner.agent.delete(&single),
                twin.post("/api/events/bulk", bulk)
            )
        };
        for response in [first, second].map(ok) {
            assert!(
                matches!(response.status.as_u16(), 200 | 400),
                "{}",
                response.status
            );
        }
        events.push(id);
    }

    let mut roots: Vec<String> = trash(&mut owner)
        .await
        .into_iter()
        .map(|entry| entry.event_id.0)
        .collect();
    roots.sort_unstable();
    events.sort_unstable();
    assert_eq!(roots, events, "a raced delete trashes the event once");
}

#[tokio::test]
async fn the_trash_lists_its_newest_500_entries() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let calendar = calendar_id(&mut owner, "Work").await;
    let event = create_event(
        &mut owner,
        &encrypted_event(&calendar, FUTURE_START, FUTURE_END),
    )
    .await;
    let newest = delete(&mut owner, &event.id.0).await;
    sqlx::query(
        "INSERT INTO event_trash (id, user_id, event_id, calendar_id, rows, trashed_at) \
         SELECT id || g, user_id, event_id, calendar_id, rows, trashed_at - g * interval '1 minute' \
         FROM event_trash, generate_series(1, 500) g WHERE id = $1",
    )
    .bind(&newest)
    .execute(&app.db)
    .await
    .expect("older entries");

    let listed = trash(&mut owner).await;
    assert_eq!(listed.len(), 500);
    assert_eq!(
        (listed[0].id.0.as_str(), listed[499].id.0.clone()),
        (newest.as_str(), format!("{newest}499"))
    );
}
