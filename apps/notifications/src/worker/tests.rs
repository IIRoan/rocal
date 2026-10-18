use sea_orm::sqlx::{self, PgPool};
use solace_server::db::scratch::ScratchDatabase;

use super::*;

/// A worker with neither mailer nor APNs, so every job ends skipped without leaving the machine.
async fn offline_worker() -> (ScratchDatabase, Worker) {
    let scratch = ScratchDatabase::create().await;
    let db = PgPool::connect(&scratch.url).await.unwrap();
    (scratch, Worker::new(db, Settings::from_pairs(&[])))
}

async fn exec(db: &PgPool, sql: &'static str) {
    sqlx::query(sql).execute(db).await.unwrap();
}

/// User `u1` (ann@solace.test) with event `e1` and its reminder `n1`, due a minute ago.
async fn due_reminder(db: &PgPool) {
    exec(db, r#"INSERT INTO "user" (id, name, email, updated_at) VALUES ('u1', 'Ann', 'ann@solace.test', NOW())"#).await;
    exec(db, "INSERT INTO calendar (id, name, color, user_id, updated_at) VALUES ('c1', 'x', '#000', 'u1', NOW())").await;
    exec(
        db,
        r#"INSERT INTO calendar_event (id, title, start, "end", user_id, calendar_id, updated_at)
           VALUES ('e1', 'x', timezone('UTC', NOW()) + interval '15 minutes', timezone('UTC', NOW()) + interval '75 minutes', 'u1', 'c1', NOW())"#,
    )
    .await;
    exec(
        db,
        "INSERT INTO event_notification (id, event_id, notification_type, minutes_before, notification_time, notification_date_local, created_at, updated_at)
         VALUES ('n1', 'e1', 'push', 15, timezone('UTC', NOW()) - interval '1 minute', '2026-01-01', timezone('UTC', NOW()) - interval '1 hour', NOW())",
    )
    .await;
}

async fn jobs_of(db: &PgPool) -> Vec<(String, String, String)> {
    sqlx::query_as(
        "SELECT channel, status, payload::text FROM notification_job ORDER BY created_at, channel",
    )
    .fetch_all(db)
    .await
    .unwrap()
}

#[tokio::test]
async fn due_reminders_become_one_job_per_channel_once() {
    let (_scratch, worker) = offline_worker().await;
    due_reminder(&worker.db).await;
    assert_eq!(schedule::claim_due(&worker.db, utc_now()).await.unwrap(), 1);
    assert_eq!(schedule::claim_due(&worker.db, utc_now()).await.unwrap(), 0);
    let jobs = jobs_of(&worker.db).await;
    assert_eq!(jobs.len(), 1);
    assert_eq!(
        (jobs[0].0.as_str(), jobs[0].1.as_str()),
        ("email", "pending")
    );
    let payload: Value = serde_json::from_str(&jobs[0].2).unwrap();
    assert_eq!(
        payload,
        json!({"kind": "event_reminder", "eventId": "e1", "minutesBefore": 15})
    );
    let sent: bool = sqlx::query_scalar("SELECT is_sent FROM event_notification WHERE id = 'n1'")
        .fetch_one(&worker.db)
        .await
        .unwrap();
    assert!(sent);
}

#[tokio::test]
async fn a_skipped_push_that_stood_in_for_the_email_queues_it() {
    let (_scratch, worker) = offline_worker().await;
    due_reminder(&worker.db).await;
    exec(
        &worker.db,
        "INSERT INTO push_device (id, user_id, platform, bundle_id, environment, token, token_hash, updated_at)
         VALUES ('d1', 'u1', 'ios', 'onl.solace.calendar', 'production', 'tok', 'hash', NOW())",
    )
    .await;
    exec(
        &worker.db,
        "INSERT INTO mail_directory_entry (id, user_id, email, local_part, domain, stalwart_account_id, stalwart_domain_id, public_key_armored, public_key_fingerprint, updated_at)
         VALUES ('m1', 'u1', 'Ann@solace.test', 'ann', 'solace.test', 'a', 'd', 'k', 'f', NOW())",
    )
    .await;
    worker.tick().await;
    let jobs = jobs_of(&worker.db).await;
    let push = jobs.iter().find(|job| job.0 == "push").unwrap();
    assert_eq!(push.1, "skipped");
    let payload: Value = serde_json::from_str(&push.2).unwrap();
    assert_eq!(payload["emailFallback"], json!(true));
    let email = jobs.iter().find(|job| job.0 == "email").unwrap();
    assert!(!email.2.contains("emailFallback"));
    worker.tick().await;
    let statuses: Vec<String> = jobs_of(&worker.db)
        .await
        .into_iter()
        .map(|job| job.1)
        .collect();
    assert_eq!(statuses, ["skipped", "skipped"]);
}

#[tokio::test]
async fn claims_lease_valid_jobs_and_skip_invalid_payloads() {
    let (_scratch, worker) = offline_worker().await;
    exec(&worker.db, r#"INSERT INTO "user" (id, name, email, updated_at) VALUES ('u1', 'Ann', 'ann@solace.test', NOW())"#).await;
    exec(
        &worker.db,
        r#"INSERT INTO notification_job (id, user_id, kind, channel, payload, updated_at) VALUES
           ('ok', 'u1', 'new_mail', 'push', '{"kind":"new_mail","emailId":"m1"}', NOW()),
           ('bad', 'u1', 'new_mail', 'push', '{"kind":"new_mail","preview":"secret"}', NOW())"#,
    )
    .await;
    let claimed = jobs::claim_pending(&worker.db, 50).await.unwrap();
    assert_eq!(claimed.len(), 1);
    assert_eq!((claimed[0].id.as_str(), claimed[0].attempts), ("ok", 1));
    let rows: Vec<(String, String, Option<String>, bool)> = sqlx::query_as(
        "SELECT id, status, last_error, available_at > timezone('UTC', NOW()) FROM notification_job ORDER BY id",
    )
    .fetch_all(&worker.db)
    .await
    .unwrap();
    assert_eq!(
        rows,
        [
            (
                "bad".into(),
                "skipped".into(),
                Some("invalid payload".into()),
                true
            ),
            ("ok".into(), "pending".into(), None, true),
        ]
    );
}

#[tokio::test]
async fn jobs_past_the_attempt_limit_are_skipped() {
    let (_scratch, worker) = offline_worker().await;
    exec(&worker.db, r#"INSERT INTO "user" (id, name, email, updated_at) VALUES ('u1', 'Ann', 'ann@solace.test', NOW())"#).await;
    exec(
        &worker.db,
        r#"INSERT INTO notification_job (id, user_id, kind, channel, payload, attempts, updated_at)
           VALUES ('j1', 'u1', 'new_mail', 'push', '{"kind":"new_mail"}', 7, NOW())"#,
    )
    .await;
    worker.tick().await;
    let (status, attempts): (String, i32) =
        sqlx::query_as("SELECT status, attempts FROM notification_job WHERE id = 'j1'")
            .fetch_one(&worker.db)
            .await
            .unwrap();
    assert_eq!((status.as_str(), attempts), ("skipped", 8));
}

#[tokio::test]
async fn health_and_status_report_the_worker() {
    let (_scratch, worker) = offline_worker().await;
    let (code, Json(health)) = worker.health();
    assert_eq!(code, StatusCode::OK);
    assert_eq!(
        (
            &health["status"],
            &health["service"],
            &health["push"],
            &health["email"]
        ),
        (
            &json!("healthy"),
            &json!("notifications"),
            &json!(false),
            &json!(false)
        )
    );
    worker.record_error("boom");
    let Json(status) = worker.status_report().await;
    assert_eq!(status["isRunning"], json!(true));
    assert_eq!(status["pendingNotifications"], json!(0));
    assert_eq!(status["errors"][0]["error"], json!("boom"));
    assert_eq!(status.get("lastProcessedAt"), None);
    worker.stop();
    assert_eq!(worker.health().0, StatusCode::SERVICE_UNAVAILABLE);
}

#[tokio::test]
async fn status_keeps_the_newest_fifty_errors() {
    let (_scratch, worker) = offline_worker().await;
    for index in 0..60 {
        worker.record_error(&index.to_string());
    }
    let Json(status) = worker.status_report().await;
    let errors = status["errors"].as_array().unwrap();
    assert_eq!(errors.len(), KEPT_ERRORS);
    assert_eq!(errors[0]["error"], json!("10"));
}
