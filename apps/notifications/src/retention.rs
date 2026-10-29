//! Hourly deletes of ephemeral rows in bounded batches that never block the job claimer; logs carry counts only.

use sea_orm::sqlx::{self, PgPool};
use time::{Duration, PrimitiveDateTime};

/// Rows deleted per statement.
pub const BATCH_SIZE: i64 = 500;
/// Batches per rule per run; leftovers go next run.
pub const MAX_BATCHES_PER_RULE: usize = 200;

/// One bounded delete: `$1` is the cutoff, `$2` the batch size. Keep `apps/notifications/README.md` in sync.
pub struct Rule {
    pub name: &'static str,
    pub retention_days: i64,
    pub query: String,
}

fn batch_delete(name: &'static str, retention_days: i64, table: &str, filter: &str) -> Rule {
    Rule {
        name,
        retention_days,
        query: format!(
            r#"DELETE FROM "{table}" WHERE id IN (SELECT id FROM "{table}" WHERE {filter} LIMIT $2 FOR UPDATE SKIP LOCKED)"#
        ),
    }
}

/// Every cleanup; pending notification jobs, leased ones included, are never selected.
pub fn rules() -> Vec<Rule> {
    vec![
        // Expired Better Auth sessions and verification values are unusable.
        batch_delete("session", 1, "session", "expires_at < $1"),
        batch_delete("verification", 1, "verification", "expires_at < $1"),
        // Accepted invites stay: they are the inviter's history.
        batch_delete(
            "invite_expired",
            30,
            "invite",
            "status = 'pending' AND expires_at < $1",
        ),
        batch_delete(
            "invite_revoked",
            30,
            "invite",
            "status = 'revoked' AND updated_at < $1",
        ),
        batch_delete(
            "invite_abandoned_claim",
            30,
            "invite",
            "status = 'claimed' AND claimed_at < $1",
        ),
        // Sent jobs are also the new-mail push dedupe window.
        batch_delete(
            "notification_job_sent",
            7,
            "notification_job",
            "status = 'sent' AND updated_at < $1",
        ),
        batch_delete(
            "notification_job_dead",
            30,
            "notification_job",
            "status NOT IN ('pending', 'sent') AND updated_at < $1",
        ),
        batch_delete(
            "notification_log",
            30,
            "notification_log",
            "created_at < $1",
        ),
        // The app re-registers its device on launch.
        batch_delete("push_device", 180, "push_device", "last_seen_at < $1"),
    ]
}

/// Deleted rows per rule, and an error per failed rule; a failing rule does not stop the others.
pub async fn run_rules(
    db: &PgPool,
    now: PrimitiveDateTime,
    rules: &[Rule],
    batch_size: i64,
    max_batches: usize,
) -> (Vec<(&'static str, u64)>, Vec<String>) {
    let mut deleted = Vec::new();
    let mut errors = Vec::new();
    for rule in rules {
        let cutoff = now - Duration::days(rule.retention_days);
        let mut total = 0;
        for _ in 0..max_batches {
            // Built only from the constant table names and filters above.
            match sqlx::query(sqlx::AssertSqlSafe(rule.query.as_str()))
                .bind(cutoff)
                .bind(batch_size)
                .execute(db)
                .await
            {
                Ok(done) => {
                    total += done.rows_affected();
                    if done.rows_affected() < batch_size.unsigned_abs() {
                        break;
                    }
                }
                Err(error) => {
                    errors.push(format!("retention {}: {error}", rule.name));
                    break;
                }
            }
        }
        deleted.push((rule.name, total));
    }
    (deleted, errors)
}

#[cfg(test)]
mod tests {
    use solace_server::db::scratch::ScratchDatabase;

    use super::*;

    #[test]
    fn pending_jobs_are_never_selected() {
        for rule in rules()
            .iter()
            .filter(|rule| rule.query.contains("notification_job"))
        {
            assert!(!rule.query.contains("'pending' AND"), "{}", rule.name);
            assert!(rule.query.contains("LIMIT $2 FOR UPDATE SKIP LOCKED"));
        }
    }

    #[test]
    fn windows_match_the_readme() {
        let windows: Vec<(&str, i64)> = rules()
            .iter()
            .map(|rule| (rule.name, rule.retention_days))
            .collect();
        assert_eq!(
            windows,
            [
                ("session", 1),
                ("verification", 1),
                ("invite_expired", 30),
                ("invite_revoked", 30),
                ("invite_abandoned_claim", 30),
                ("notification_job_sent", 7),
                ("notification_job_dead", 30),
                ("notification_log", 30),
                ("push_device", 180),
            ]
        );
    }

    async fn insert_log(db: &PgPool, id: &str, age_days: i64) {
        sqlx::query(
            "INSERT INTO notification_log (id, event_id, user_id, notification_type, minutes_before, sent_at, status, created_at) VALUES ($1, 'e', 'u', 'push', 5, NOW(), 'sent', timezone('UTC', NOW()) - make_interval(days => $2::int))",
        )
        .bind(id)
        .bind(i32::try_from(age_days).unwrap())
        .execute(db)
        .await
        .unwrap();
    }

    fn now() -> PrimitiveDateTime {
        let now = time::OffsetDateTime::now_utc();
        PrimitiveDateTime::new(now.date(), now.time())
    }

    #[tokio::test]
    async fn batches_run_until_a_short_batch_and_stop_at_the_bound() {
        let scratch = ScratchDatabase::create().await;
        let db = PgPool::connect(&scratch.url).await.unwrap();
        for index in 0..5 {
            insert_log(&db, &format!("old{index}"), 40).await;
        }
        insert_log(&db, "recent", 1).await;
        let logs: Vec<Rule> = rules()
            .into_iter()
            .filter(|rule| rule.name == "notification_log")
            .collect();
        let (deleted, errors) = run_rules(&db, now(), &logs, 2, 2).await;
        assert_eq!((deleted, errors.len()), (vec![("notification_log", 4)], 0));
        let (deleted, _) = run_rules(&db, now(), &logs, 2, 10).await;
        assert_eq!(deleted, [("notification_log", 1)]);
        let left: Vec<(String,)> = sqlx::query_as("SELECT id FROM notification_log")
            .fetch_all(&db)
            .await
            .unwrap();
        assert_eq!(left, [("recent".to_owned(),)]);
    }

    #[tokio::test]
    async fn a_failing_rule_does_not_stop_the_others() {
        let scratch = ScratchDatabase::create().await;
        let db = PgPool::connect(&scratch.url).await.unwrap();
        insert_log(&db, "old", 40).await;
        let mut broken = rules();
        broken.retain(|rule| rule.name == "notification_log");
        broken.insert(0, batch_delete("missing", 1, "no_such_table", "id < $1"));
        let (deleted, errors) =
            run_rules(&db, now(), &broken, BATCH_SIZE, MAX_BATCHES_PER_RULE).await;
        assert_eq!(deleted, [("missing", 0), ("notification_log", 1)]);
        assert_eq!(errors.len(), 1);
        assert!(errors[0].starts_with("retention missing:"));
    }
}
