//! Due `event_notification` rows become one `notification_job` per channel, in the transaction that marks them sent.

use sea_orm::sqlx::{self, Executor, PgPool, Postgres};
use serde_json::json;
use time::PrimitiveDateTime;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Due {
    pub id: String,
    pub event_id: String,
    pub user_id: String,
    pub minutes_before: i32,
    pub email: bool,
    pub push: bool,
    pub has_push_device: bool,
    /// The account email is the user's own Solace mailbox.
    pub mails_to_own_mailbox: bool,
}

const CLAIM_DUE: &str = r#"
    SELECT
        en.id,
        en.event_id,
        ce.user_id,
        en.minutes_before,
        COALESCE(us."emailNotifications", TRUE),
        COALESCE(us.push_notifications, TRUE),
        EXISTS (
            SELECT 1 FROM push_device pd
            WHERE pd.user_id = ce.user_id AND pd.is_enabled = TRUE
        ),
        EXISTS (
            SELECT 1 FROM mail_directory_entry mde
            WHERE mde.user_id = ce.user_id AND LOWER(mde.email) = LOWER(u.email)
        )
    FROM event_notification en
    INNER JOIN calendar_event ce ON ce.id = en.event_id
    INNER JOIN "user" u ON u.id = ce.user_id
    LEFT JOIN user_settings us ON us.user_id = ce.user_id
    WHERE en.notification_time <= $1
      AND en.is_enabled = TRUE
      AND en.is_sent = FALSE
    ORDER BY en.notification_time ASC
    LIMIT 50
    FOR UPDATE OF en SKIP LOCKED
"#;

const INSERT_JOB: &str = r#"
    INSERT INTO notification_job (
        id, user_id, kind, channel, event_id, payload, status, attempts, available_at, created_at, updated_at
    ) VALUES ($1, $2, 'event_reminder', $3, $4, $5::jsonb, 'pending', 0, NOW(), NOW(), NOW())
"#;

type DueRow = (String, String, String, i32, bool, bool, bool, bool);

/// Claims reminders due by `now` (to the minute) and queues their jobs; returns how many were claimed.
pub async fn claim_due(db: &PgPool, now: PrimitiveDateTime) -> Result<usize, sqlx::Error> {
    let minute = now.replace_time(
        time::Time::from_hms(now.hour(), now.minute(), 0).unwrap_or(time::Time::MIDNIGHT),
    );
    let mut tx = db.begin().await?;
    let rows: Vec<DueRow> = sqlx::query_as(CLAIM_DUE)
        .bind(minute)
        .fetch_all(&mut *tx)
        .await?;
    let count = rows.len();
    for (id, event_id, user_id, minutes_before, email, push, has_push_device, own_mailbox) in rows {
        let due = Due {
            id,
            event_id,
            user_id,
            minutes_before,
            email,
            push,
            has_push_device,
            mails_to_own_mailbox: own_mailbox,
        };
        sqlx::query(
            "UPDATE event_notification SET is_sent = TRUE, updated_at = NOW() WHERE id = $1 AND is_sent = FALSE",
        )
        .bind(&due.id)
        .execute(&mut *tx)
        .await?;
        for channel in channels_for(&due) {
            let fallback = channel == "push" && email_deferred_to_push(&due);
            insert_job(
                &mut *tx,
                &due.user_id,
                &due.event_id,
                due.minutes_before,
                channel,
                fallback,
            )
            .await?;
        }
    }
    tx.commit().await?;
    Ok(count)
}

/// Reminder mail into the user's own Solace inbox would only duplicate the push on the same device.
fn email_deferred_to_push(due: &Due) -> bool {
    due.email && due.push && due.has_push_device && due.mails_to_own_mailbox
}

pub fn channels_for(due: &Due) -> Vec<&'static str> {
    let mut channels = Vec::new();
    if due.email && !email_deferred_to_push(due) {
        channels.push("email");
    }
    if due.push && due.has_push_device {
        channels.push("push");
    }
    channels
}

/// Opaque refs only; the encrypted title is read at push time.
fn reminder_payload(event_id: &str, minutes_before: i32, email_fallback: bool) -> String {
    let mut payload = json!({
        "kind": "event_reminder",
        "eventId": event_id,
        "minutesBefore": minutes_before,
    });
    if email_fallback {
        payload["emailFallback"] = json!(true);
    }
    payload.to_string()
}

async fn insert_job<'e>(
    db: impl Executor<'e, Database = Postgres>,
    user_id: &str,
    event_id: &str,
    minutes_before: i32,
    channel: &str,
    email_fallback: bool,
) -> Result<(), sqlx::Error> {
    sqlx::query(INSERT_JOB)
        .bind(hex::encode(rand::random::<[u8; 16]>()))
        .bind(user_id)
        .bind(channel)
        .bind(event_id)
        .bind(reminder_payload(event_id, minutes_before, email_fallback))
        .execute(db)
        .await?;
    Ok(())
}

/// Queues the reminder email that was deferred to a push job which ended skipped.
pub async fn queue_email_fallback<'e>(
    db: impl Executor<'e, Database = Postgres>,
    user_id: &str,
    event_id: &str,
    minutes_before: i64,
) -> Result<(), sqlx::Error> {
    let minutes = i32::try_from(minutes_before).unwrap_or_default();
    insert_job(db, user_id, event_id, minutes, "email", false).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn due(email: bool, push: bool, device: bool, own_mailbox: bool) -> Due {
        Due {
            email,
            push,
            has_push_device: device,
            mails_to_own_mailbox: own_mailbox,
            ..Due::default()
        }
    }

    #[test]
    fn channels_follow_settings_and_devices() {
        assert_eq!(
            channels_for(&due(true, true, true, false)),
            ["email", "push"]
        );
        assert_eq!(channels_for(&due(true, true, false, false)), ["email"]);
        assert_eq!(channels_for(&due(false, true, true, false)), ["push"]);
        assert!(channels_for(&due(false, false, true, true)).is_empty());
    }

    #[test]
    fn own_mailbox_users_get_exactly_one_reminder() {
        assert_eq!(channels_for(&due(true, true, true, true)), ["push"]);
        assert_eq!(channels_for(&due(true, true, false, true)), ["email"]);
        assert_eq!(channels_for(&due(true, false, true, true)), ["email"]);
    }

    #[test]
    fn payloads_carry_opaque_refs_and_flag_the_deferring_push() {
        let payload: serde_json::Value =
            serde_json::from_str(&reminder_payload("e1", 15, false)).unwrap();
        assert_eq!(
            payload,
            json!({"kind": "event_reminder", "eventId": "e1", "minutesBefore": 15})
        );
        let flagged: serde_json::Value =
            serde_json::from_str(&reminder_payload("e1", 15, true)).unwrap();
        assert_eq!(flagged["emailFallback"], json!(true));
    }

    #[test]
    fn the_due_query_matches_prisma_columns_and_the_account_email() {
        for column in [
            r#"us."emailNotifications""#,
            "us.push_notifications",
            "LOWER(mde.email) = LOWER(u.email)",
            "FOR UPDATE OF en SKIP LOCKED",
        ] {
            assert!(CLAIM_DUE.contains(column), "{column}");
        }
    }
}
