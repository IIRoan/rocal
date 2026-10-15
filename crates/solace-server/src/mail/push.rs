//! `lib/mail-push-enqueue.ts` and `lib/inbound-mail-push.ts`: one `new_mail` outbox job per inbound email, holding only `emailId`/`accountId`.

use std::collections::{HashMap, HashSet};

use sea_orm::{ConnectionTrait, DbErr, SqlErr};
use serde_json::Value;
use solace_api_types::mail::{MailCalendarImportSummary, MailSyncCollection, MailSyncResult};

use super::queries;
use crate::http::zod::js_trim;
use crate::notifications::job_payload::new_mail_payload;
use crate::telemetry::{log_ref, redact_pii};

/// `enqueueInboundMailPush`: queues each email of the user's mailbox once, unless app notifications are off; the iOS NSE fetches sender and subject itself.
pub async fn enqueue<C: ConnectionTrait>(
    db: &C,
    account_id: &str,
    user_id: &str,
    email_ids: &[String],
) -> Result<(), DbErr> {
    let email_ids = unique_ids(email_ids);
    if email_ids.is_empty() {
        return Ok(());
    }
    let user_ref = log_ref(user_id);
    if queries::push_notifications(db, user_id).await? == Some(false) {
        tracing::info!(
            user_ref,
            inbound_count = email_ids.len(),
            "Skipped mail push; app notifications are disabled"
        );
        return Ok(());
    }
    let (mut enqueued, mut skipped_duplicate) = (0, 0);
    for email_id in &email_ids {
        let payload = match new_mail_payload(1, Some(email_id), Some(account_id)) {
            Ok(payload) => payload,
            Err(error) => {
                tracing::warn!(email_ref = log_ref(email_id), reason = %error, "Rejected mail push payload");
                continue;
            }
        };
        if queries::new_mail_job_exists(db, user_id, email_id).await? {
            skipped_duplicate += 1;
            continue;
        }
        match insert_job(db, user_id, payload).await {
            Ok(true) => enqueued += 1,
            Ok(false) => skipped_duplicate += 1,
            Err(error) => tracing::warn!(
                user_ref,
                email_ref = log_ref(email_id),
                error = %redact_pii(&error.to_string()),
                "Failed to enqueue mail push"
            ),
        }
    }
    let email_refs: Vec<String> = email_ids.iter().map(|id| log_ref(id)).collect();
    tracing::info!(
        user_ref,
        inbound_count = email_ids.len(),
        enqueued_count = enqueued,
        skipped_duplicate_count = skipped_duplicate,
        email_refs = ?email_refs,
        "Enqueued inbound mail push"
    );
    Ok(())
}

/// `false` when the pending-push unique index already holds this email, because a concurrent delivery queued it first.
async fn insert_job<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    payload: Value,
) -> Result<bool, DbErr> {
    match queries::insert_new_mail_job(db, user_id, payload).await {
        Ok(()) => Ok(true),
        Err(error) if matches!(error.sql_err(), Some(SqlErr::UniqueConstraintViolation(_))) => {
            Ok(false)
        }
        Err(error) => Err(error),
    }
}

/// `mergeInboundMailPushItems`: trimmed, non-blank and first occurrence kept.
fn unique_ids(email_ids: &[String]) -> Vec<String> {
    unique_strings(email_ids.iter().map(|id| js_trim(id).to_owned()))
}

fn unique_strings(values: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut seen = HashSet::new();
    values
        .into_iter()
        .filter(|value| !value.is_empty() && seen.insert(value.clone()))
        .collect()
}

/// A later record replaces an earlier one with the same `id` in its place, as a JavaScript `Map` does.
fn unique_records(records: impl IntoIterator<Item = Value>) -> Vec<Value> {
    let mut positions = HashMap::new();
    let mut unique: Vec<Value> = Vec::new();
    for record in records {
        let id = record.get("id").map(Value::to_string).unwrap_or_default();
        match positions.get(&id) {
            Some(&position) => unique[position] = record,
            None => {
                positions.insert(id, unique.len());
                unique.push(record);
            }
        }
    }
    unique
}

fn merge_collection(pending: MailSyncCollection, next: MailSyncCollection) -> MailSyncCollection {
    MailSyncCollection {
        created: unique_strings(pending.created.into_iter().chain(next.created)),
        updated: unique_strings(pending.updated.into_iter().chain(next.updated)),
        destroyed: unique_strings(pending.destroyed.into_iter().chain(next.destroyed)),
        records: unique_records(pending.records.into_iter().chain(next.records)),
        ..next
    }
}

/// `coalescePendingMailSync`: folds a sync result into the one still waiting to be sent, keeping the newer states.
pub fn coalesce_pending_mail_sync(
    pending: Option<MailSyncResult>,
    next: Option<MailSyncResult>,
) -> Option<MailSyncResult> {
    let Some(next) = next else {
        return pending;
    };
    let Some(pending) = pending else {
        return Some(next);
    };
    let (earlier, later) = (pending.calendar_import, next.calendar_import);
    Some(MailSyncResult {
        changed_types: unique_strings(pending.changed_types.into_iter().chain(next.changed_types)),
        email: merge_collection(pending.email, next.email),
        mailbox: merge_collection(pending.mailbox, next.mailbox),
        thread: merge_collection(pending.thread, next.thread),
        calendar_import: MailCalendarImportSummary {
            messages_scanned: earlier.messages_scanned + later.messages_scanned,
            ics_parts_found: earlier.ics_parts_found + later.ics_parts_found,
            events_created: earlier.events_created + later.events_created,
            events_updated: earlier.events_updated + later.events_updated,
            events_deleted: earlier.events_deleted + later.events_deleted,
            errors: unique_strings(earlier.errors.into_iter().chain(later.errors)),
        },
        ..next
    })
}

#[cfg(test)]
pub(super) mod tests {
    use sea_orm::{ConnectionTrait, DatabaseConnection};

    use super::*;
    use crate::db::scratch::ScratchDatabase;

    pub const USER: &str = "mail-push-test-user";

    pub async fn seed_user(db: &DatabaseConnection) {
        db.execute_unprepared(&format!(
            "INSERT INTO \"user\" (id, name, email, email_verified, created_at, updated_at) \
             VALUES ('{USER}', 'Mail Push', 'mail-push@example.com', true, now(), now())"
        ))
        .await
        .unwrap();
    }

    pub async fn email_ids(db: &DatabaseConnection) -> Vec<String> {
        let rows = db
            .query_all_raw(sea_orm::Statement::from_string(
                db.get_database_backend(),
                format!(
                    "SELECT payload->>'emailId' AS id FROM notification_job \
                     WHERE user_id = '{USER}' AND kind = 'new_mail' ORDER BY created_at, id"
                ),
            ))
            .await
            .unwrap();
        rows.iter()
            .map(|row| row.try_get::<String>("", "id").unwrap())
            .collect()
    }

    #[tokio::test]
    async fn no_items_queue_nothing() {
        // A disconnected database fails any query, so nothing was read or written.
        let db = DatabaseConnection::default();
        assert!(enqueue(&db, "acct-1", USER, &[]).await.is_ok());
        assert!(
            enqueue(&db, "acct-1", USER, &[" ".into(), String::new()])
                .await
                .is_ok()
        );
    }

    #[tokio::test]
    async fn rejects_invalid_new_mail_payloads() {
        let database = ScratchDatabase::create().await;
        seed_user(&database.db).await;
        let too_long = "e".repeat(129);
        enqueue(&database.db, "acct-1", USER, &[too_long])
            .await
            .unwrap();
        enqueue(&database.db, &"a".repeat(129), USER, &["in-1".into()])
            .await
            .unwrap();
        assert!(email_ids(&database.db).await.is_empty());
    }

    #[tokio::test]
    async fn unique_violations_count_as_duplicates() {
        let database = ScratchDatabase::create().await;
        seed_user(&database.db).await;
        let payload = new_mail_payload(1, Some("in-1"), Some("acct-1")).unwrap();
        assert!(
            insert_job(&database.db, USER, payload.clone())
                .await
                .unwrap()
        );
        assert!(
            !insert_job(&database.db, USER, payload).await.unwrap(),
            "the pending-push index refused the second job"
        );
        assert_eq!(email_ids(&database.db).await, ["in-1"]);
    }

    #[tokio::test]
    async fn only_a_skipped_push_is_queued_again() {
        let database = ScratchDatabase::create().await;
        seed_user(&database.db).await;
        let ids = [" in-1 ".to_owned(), "in-2".into(), "in-1".into()];
        enqueue(&database.db, "acct-1", USER, &ids).await.unwrap();
        assert_eq!(email_ids(&database.db).await, ["in-1", "in-2"]);
        let all = ["in-1".to_owned(), "in-2".into(), "in-3".into()];
        enqueue(&database.db, "acct-1", USER, &all[..2])
            .await
            .unwrap();
        assert_eq!(
            email_ids(&database.db).await,
            ["in-1", "in-2"],
            "pending pushes"
        );
        database
            .db
            .execute_unprepared(
                "UPDATE notification_job SET status = CASE payload->>'emailId' WHEN 'in-1' THEN 'sent' ELSE 'skipped' END",
            )
            .await
            .unwrap();
        enqueue(&database.db, "acct-1", USER, &all).await.unwrap();
        let mut queued = email_ids(&database.db).await;
        queued.sort();
        assert_eq!(queued, ["in-1", "in-2", "in-2", "in-3"]);
    }
}
