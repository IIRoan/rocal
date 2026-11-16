//! `GET /api/e2ee/upgrades` and the writes that clear it: what an account still stores in an older form, by id, and the re-seals.

use serde_json::json;
use solace_api_tests::seed::fake_envelope;
use solace_api_types::e2ee::EncryptionUpgrades;
use solace_api_types::events::EventDeleted;
use solace_api_types::notifications::{NotificationSetting, SealedReminders};
use sqlx::PgPool;

use crate::event_fixtures::{FUTURE_END, FUTURE_START, calendar_id, create_event, encrypted_event};
use crate::helpers::{TestApp, TestUser, expect_unauthorized, hex, ok};
use crate::notifications::{lead_ciphertext, title_ciphertext};

async fn upgrades(user: &mut TestUser) -> EncryptionUpgrades {
    ok(user
        .get("/api/e2ee/upgrades")
        .await
        .expect_status(200)
        .and_then(|r| r.dto()))
}

/// A sealed event an older client saved with its colour in the readable column.
async fn legacy_event(user: &mut TestUser) -> String {
    let calendar = calendar_id(user, "Work").await;
    let mut request = encrypted_event(&calendar, FUTURE_START, FUTURE_END);
    request.color = Some("#3b82f6".into());
    create_event(user, &request).await.id.0
}

/// Reminders as an older client set them: no sealed title, no sealed leads.
async fn legacy_reminders(user: &mut TestUser, event: &str) {
    let settings: Vec<NotificationSetting> = [("browser", 15), ("email", 60)]
        .into_iter()
        .map(|(kind, minutes)| NotificationSetting {
            notification_type: kind.into(),
            minutes_before: minutes,
            is_enabled: true,
            encrypted_lead: None,
        })
        .collect();
    ok(user
        .put(
            &format!("/api/notifications/event/{event}"),
            json!({"notifications": settings}),
        )
        .await
        .expect_status(200));
}

async fn stored_content(db: &PgPool, event: &str) -> (Option<String>, Option<String>) {
    sqlx::query_as("SELECT encrypted_content, color FROM calendar_event WHERE id = $1")
        .bind(event)
        .fetch_one(db)
        .await
        .expect("event row")
}

/// (id, minutes, time, sent, title, lead) of each reminder, by minutes.
type ReminderRow = (String, i32, String, bool, Option<String>, Option<String>);

async fn reminders(db: &PgPool, event: &str) -> Vec<ReminderRow> {
    sqlx::query_as(
        "SELECT id, minutes_before, notification_time::text, is_sent, encrypted_display_title, encrypted_lead \
         FROM event_notification WHERE event_id = $1 ORDER BY minutes_before",
    )
    .bind(event)
    .fetch_all(db)
    .await
    .expect("reminders")
}

/// A re-seal as current clients send it: bound to the row id, over the ciphertext they read.
fn seal_body(content: &str, expected: &str) -> serde_json::Value {
    json!({"encryptedContent": content, "encryptionKeyVersion": 2, "expectedEncryptedContent": expected})
}

fn reminders_body() -> serde_json::Value {
    json!({
        "encryptedDisplayTitle": title_ciphertext(),
        "leads": [
            {"minutesBefore": 15, "encryptedLead": lead_ciphertext('a')},
            {"minutesBefore": 60, "encryptedLead": lead_ciphertext('b')},
        ],
    })
}

#[tokio::test]
async fn anonymous_callers_are_refused() {
    let app = TestApp::spawn().await;
    let mut anon = app.anonymous();
    expect_unauthorized(&ok(anon.get("/api/e2ee/upgrades").await));
    expect_unauthorized(&ok(anon
        .put("/api/notifications/event/x/sealed", reminders_body())
        .await));
}

#[tokio::test]
async fn the_report_lists_what_an_older_client_left_readable_until_it_is_resealed() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let mut other = app.user().await;
    let event = legacy_event(&mut user).await;
    legacy_reminders(&mut user, &event).await;
    ok(user.get("/api/settings").await.expect_status(200));

    let report = upgrades(&mut user).await;
    assert_eq!(
        report.events_with_readable_attributes,
        vec![event.clone().into()]
    );
    assert_eq!(
        report.events_with_unsealed_reminders,
        vec![event.clone().into()]
    );
    assert_eq!(
        report.events_with_unbound_content,
        vec![event.clone().into()]
    );
    assert!(report.unsealed_settings);
    assert_eq!(report.readable_invitations, 0);
    let theirs = upgrades(&mut other).await;
    assert!(theirs.events_with_readable_attributes.is_empty());
    assert!(theirs.events_with_unsealed_reminders.is_empty());
    assert!(theirs.events_with_unbound_content.is_empty());

    let (read, _) = stored_content(&app.db, &event).await;
    let resealed = fake_envelope();
    ok(user
        .post(
            &format!("/api/events/{event}/seal-encryption"),
            seal_body(&resealed, &read.expect("ciphertext")),
        )
        .await
        .expect_status(200));
    assert_eq!(
        stored_content(&app.db, &event).await,
        (Some(resealed), None),
        "the new ciphertext carries the colour, so the readable column is cleared"
    );

    let before = reminders(&app.db, &event).await;
    let sealed: SealedReminders = ok(user
        .put(
            &format!("/api/notifications/event/{event}/sealed"),
            reminders_body(),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(sealed.updated, 2);
    let after = reminders(&app.db, &event).await;
    for (old, new) in before.iter().zip(&after) {
        assert_eq!(
            (&old.0, old.1, &old.2),
            (&new.0, new.1, &new.2),
            "sealing never reschedules"
        );
        assert_eq!(new.4.as_deref(), Some(title_ciphertext().as_str()));
    }
    assert_eq!(
        after.iter().map(|r| r.5.clone()).collect::<Vec<_>>(),
        vec![Some(lead_ciphertext('a')), Some(lead_ciphertext('b'))]
    );

    ok(user
        .put(
            "/api/settings",
            json!({"encryptedPreferences": fake_envelope(), "expectedEncryptedPreferences": null}),
        )
        .await
        .expect_status(200));
    assert_eq!(
        upgrades(&mut user).await,
        EncryptionUpgrades {
            events_with_readable_attributes: vec![],
            events_with_unsealed_reminders: vec![],
            events_with_unbound_content: vec![],
            trash_with_unbound_content: 0,
            readable_invitations: 0,
            unsealed_settings: false,
            subscriptions_with_readable_names: vec![],
            subscriptions_with_readable_urls: vec![],
        }
    );
}

#[tokio::test]
async fn unbound_content_in_the_trash_is_counted_until_a_restore_lists_it_for_binding() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar = calendar_id(&mut user, "Work").await;
    let legacy = create_event(
        &mut user,
        &encrypted_event(&calendar, FUTURE_START, FUTURE_END),
    )
    .await
    .id;
    let mut bound = encrypted_event(&calendar, FUTURE_START, FUTURE_END);
    bound.id = Some(hex(16).into());
    bound.encryption_key_version = Some(2);
    let bound = create_event(&mut user, &bound).await.id;
    let mut trash_ids = Vec::new();
    for event in [&legacy, &bound] {
        let deleted: EventDeleted = ok(user
            .delete(&format!("/api/events/{event}"))
            .await
            .expect_status(200)
            .and_then(|r| r.dto()));
        trash_ids.push(deleted.trash_id.expect("trash id"));
    }

    let report = upgrades(&mut user).await;
    assert!(report.events_with_unbound_content.is_empty());
    assert_eq!(
        report.trash_with_unbound_content, 1,
        "only the legacy entry keeps the account from being marked bound"
    );
    assert_eq!(
        upgrades(&mut app.user().await)
            .await
            .trash_with_unbound_content,
        0
    );

    ok(user
        .post(
            &format!("/api/events/trash/{}/restore", trash_ids[0]),
            json!({}),
        )
        .await
        .expect_status(200));
    let report = upgrades(&mut user).await;
    assert_eq!(report.events_with_unbound_content, vec![legacy]);
    assert_eq!(report.trash_with_unbound_content, 0);
}

#[tokio::test]
async fn a_trash_between_the_live_and_trashed_reads_never_reports_the_account_bound() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar = calendar_id(&mut user, "Work").await;
    let legacy = create_event(
        &mut user,
        &encrypted_event(&calendar, FUTURE_START, FUTURE_END),
    )
    .await
    .id
    .0;
    let (db, event) = (&app.db, &legacy);
    // Holding the events table parks the report's live reads while this "trash" moves the event.
    let trash = async move {
        let mut lock = db.begin().await.expect("transaction");
        let pid: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
            .fetch_one(&mut *lock)
            .await
            .expect("backend pid");
        sqlx::query("LOCK TABLE calendar_event IN ACCESS EXCLUSIVE MODE")
            .execute(&mut *lock)
            .await
            .expect("table lock");
        let blocked = "SELECT count(*) FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))";
        for attempt in 0.. {
            let waiting: i64 = sqlx::query_scalar(blocked)
                .bind(pid)
                .fetch_one(db)
                .await
                .expect("blocked queries");
            if waiting > 0 {
                break;
            }
            assert!(attempt < 1200, "the report never reached the events table");
            tokio::time::sleep(std::time::Duration::from_millis(25)).await;
        }
        // Reads that do not wait on the lock finish first.
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        sqlx::query(
            "INSERT INTO event_trash (id, user_id, event_id, calendar_id, rows) \
             SELECT $2, e.user_id, e.id, e.calendar_id, jsonb_build_object('events', jsonb_build_array(to_jsonb(e))) \
             FROM calendar_event e WHERE e.id = $1",
        )
        .bind(event)
        .bind(hex(12))
        .execute(&mut *lock)
        .await
        .expect("trash copy");
        sqlx::query("DELETE FROM calendar_event WHERE id = $1")
            .bind(event)
            .execute(&mut *lock)
            .await
            .expect("delete event");
        lock.commit().await.expect("commit");
    };
    let (report, ()) = tokio::join!(upgrades(&mut user), trash);
    assert!(
        !report.events_with_unbound_content.is_empty() || report.trash_with_unbound_content > 0,
        "unbound content was reported nowhere: {report:?}"
    );
}

#[tokio::test]
async fn a_reseal_over_a_ciphertext_that_changed_since_it_was_read_is_refused() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let mut other = app.user().await;
    let event = legacy_event(&mut user).await;
    let stored = stored_content(&app.db, &event).await;

    let stale = user
        .post(
            &format!("/api/events/{event}/seal-encryption"),
            seal_body(&fake_envelope(), &fake_envelope()),
        )
        .await;
    assert_eq!(stale.status.as_u16(), 409);
    assert_eq!(stored_content(&app.db, &event).await, stored);

    let foreign = other
        .post(
            &format!("/api/events/{event}/seal-encryption"),
            seal_body(&fake_envelope(), stored.0.as_deref().unwrap_or_default()),
        )
        .await;
    assert_eq!(foreign.status.as_u16(), 400);
    assert!(
        foreign.text().contains("Event not found or access denied"),
        "{}",
        foreign.text()
    );
    assert_eq!(stored_content(&app.db, &event).await, stored);
}

#[tokio::test]
async fn sealing_reminders_leaves_sent_ones_and_other_users_alone() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let mut other = app.user().await;
    let event = legacy_event(&mut user).await;
    legacy_reminders(&mut user, &event).await;
    sqlx::query(
        "UPDATE event_notification SET is_sent = true WHERE event_id = $1 AND minutes_before = 60",
    )
    .bind(&event)
    .execute(&app.db)
    .await
    .expect("mark sent");

    let foreign = other
        .put(
            &format!("/api/notifications/event/{event}/sealed"),
            reminders_body(),
        )
        .await;
    assert_eq!(foreign.status.as_u16(), 404);
    assert!(
        reminders(&app.db, &event)
            .await
            .iter()
            .all(|r| r.5.is_none())
    );

    let malformed = user
        .put(
            &format!("/api/notifications/event/{event}/sealed"),
            json!({"leads": [{"minutesBefore": 15, "encryptedLead": "15"}]}),
        )
        .await;
    assert_eq!(malformed.status.as_u16(), 400);

    let sealed: SealedReminders = ok(user
        .put(
            &format!("/api/notifications/event/{event}/sealed"),
            reminders_body(),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(sealed.updated, 1);
    let rows = reminders(&app.db, &event).await;
    assert_eq!(
        rows.iter().map(|r| (r.1, r.5.clone())).collect::<Vec<_>>(),
        vec![(15, Some(lead_ciphertext('a'))), (60, None)],
        "a sent reminder keeps what it went out with"
    );
}
