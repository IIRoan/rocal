//! `notification_job` rows: the leased claim, delivery bookkeeping, push devices and a reminder's scheduling fields.

use std::time::Duration;

use jiff::Timestamp;
use jiff::tz::TimeZone;
use sea_orm::sqlx::{self, Executor, PgPool, Postgres};
use time::PrimitiveDateTime;

use crate::payload::{self, Payload};

/// Attempts after which a job is skipped instead of retried.
pub const MAX_ATTEMPTS: i32 = 8;
const RETRY_BASE: Duration = Duration::from_secs(15);
const RETRY_CAP: Duration = Duration::from_secs(15 * 60);

#[derive(Debug, Clone)]
pub struct Job {
    pub id: String,
    pub user_id: String,
    pub kind: String,
    pub channel: String,
    pub event_id: Option<String>,
    pub payload: Payload,
    pub attempts: i32,
}

impl Job {
    pub fn kind(&self) -> &str {
        if self.kind.is_empty() {
            &self.payload.kind
        } else {
            &self.kind
        }
    }

    /// The payload's event id, else the row's.
    pub fn event_id(&self) -> &str {
        if self.payload.event_id.is_empty() {
            self.event_id.as_deref().unwrap_or_default()
        } else {
            &self.payload.event_id
        }
    }

    pub fn minutes_before(&self) -> i64 {
        self.payload.minutes_before.unwrap_or_default()
    }
}

/// 15 s doubling per attempt, at most 15 minutes.
pub fn retry_delay(attempts: i32) -> Duration {
    let mut delay = RETRY_BASE;
    for _ in 1..attempts.max(1) {
        delay *= 2;
        if delay > RETRY_CAP {
            return RETRY_CAP;
        }
    }
    delay
}

/// Leases due jobs for two minutes and counts the attempt; another worker skips locked rows.
const CLAIM_PENDING: &str = r#"
    WITH picked AS (
        SELECT id
        FROM notification_job
        WHERE status = 'pending' AND available_at <= NOW()
        ORDER BY available_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
    )
    UPDATE notification_job j
    SET claimed_at = NOW(),
        attempts = j.attempts + 1,
        available_at = NOW() + interval '2 minutes',
        updated_at = NOW()
    FROM picked
    WHERE j.id = picked.id
    RETURNING j.id, j.user_id, j.kind, j.channel, j.event_id, j.payload::text, j.attempts
"#;

type ClaimedRow = (String, String, String, String, Option<String>, String, i32);

/// Claims up to `limit` jobs; rows whose payload carries more than opaque refs are skipped as invalid.
pub async fn claim_pending(db: &PgPool, limit: i64) -> Result<Vec<Job>, sqlx::Error> {
    let rows: Vec<ClaimedRow> = sqlx::query_as(CLAIM_PENDING)
        .bind(limit)
        .fetch_all(db)
        .await?;
    let mut jobs = Vec::with_capacity(rows.len());
    for (id, user_id, kind, channel, event_id, raw, attempts) in rows {
        match payload::parse(&raw) {
            Some(payload) => jobs.push(Job {
                id,
                user_id,
                kind,
                channel,
                event_id,
                payload,
                attempts,
            }),
            None => {
                sqlx::query(
                    "UPDATE notification_job SET status = 'skipped', last_error = 'invalid payload', updated_at = NOW() WHERE id = $1",
                )
                .bind(&id)
                .execute(db)
                .await?;
            }
        }
    }
    Ok(jobs)
}

pub async fn mark_sent(db: &PgPool, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE notification_job SET status = 'sent', updated_at = NOW() WHERE id = $1")
        .bind(id)
        .execute(db)
        .await?;
    Ok(())
}

/// Puts the job back for another attempt after `delay`, keeping a short reason.
pub async fn mark_failed(
    db: &PgPool,
    id: &str,
    delay: Duration,
    reason: &str,
) -> Result<(), sqlx::Error> {
    let reason = match reason.trim() {
        "" => "send failed".to_owned(),
        reason => reason.chars().take(200).collect(),
    };
    sqlx::query(
        r#"
        UPDATE notification_job
        SET status = 'pending',
            available_at = NOW() + $2::interval,
            last_error = $3,
            claimed_at = NULL,
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(format!("{} seconds", delay.as_secs().max(1)))
    .bind(reason)
    .execute(db)
    .await?;
    Ok(())
}

pub async fn mark_skipped<'e>(
    db: impl Executor<'e, Database = Postgres>,
    id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE notification_job SET status = 'skipped', updated_at = NOW() WHERE id = $1")
        .bind(id)
        .execute(db)
        .await?;
    Ok(())
}

/// One `notification_log` row per sent or failed delivery.
pub async fn insert_log(db: &PgPool, job: &Job, status: &str) -> Result<(), sqlx::Error> {
    let id = Timestamp::now().as_nanosecond().to_string();
    sqlx::query(
        r#"
        INSERT INTO notification_log (
            id, event_id, user_id, notification_type, minutes_before, sent_at, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW(), $6, NOW())
        "#,
    )
    .bind(id)
    .bind(job.event_id.as_deref().unwrap_or_default())
    .bind(&job.user_id)
    .bind(&job.channel)
    .bind(i32::try_from(job.minutes_before()).unwrap_or_default())
    .bind(status)
    .execute(db)
    .await?;
    Ok(())
}

#[derive(Debug, Clone)]
pub struct PushDevice {
    pub token: String,
    pub bundle_id: String,
    pub environment: String,
    pub token_hash: String,
}

pub async fn push_devices(db: &PgPool, user_id: &str) -> Result<Vec<PushDevice>, sqlx::Error> {
    let rows: Vec<(String, String, String, String)> = sqlx::query_as(
        "SELECT token, bundle_id, environment, token_hash FROM push_device WHERE user_id = $1 AND is_enabled = TRUE",
    )
    .bind(user_id)
    .fetch_all(db)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(token, bundle_id, environment, token_hash)| PushDevice {
            token,
            bundle_id,
            environment,
            token_hash,
        })
        .collect())
}

pub async fn delete_push_device(db: &PgPool, token_hash: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM push_device WHERE token_hash = $1")
        .bind(token_hash)
        .execute(db)
        .await?;
    Ok(())
}

pub async fn set_push_device_environment(
    db: &PgPool,
    token_hash: &str,
    environment: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE push_device SET environment = $2, updated_at = NOW() WHERE token_hash = $1",
    )
    .bind(token_hash)
    .bind(environment)
    .execute(db)
    .await?;
    Ok(())
}

/// A reminder's scheduling fields; title, location, description and names are never read.
#[derive(Debug, Clone)]
pub struct Reminder {
    pub encrypted_title: String,
    pub start: Timestamp,
    pub end: Timestamp,
    pub all_day: bool,
    pub user_email: String,
    pub timezone: String,
    pub time_format: String,
}

/// `encrypted_display_title` is read through `to_jsonb`, so this also runs before the migration that adds it.
const LOAD_REMINDER: &str = r#"
    SELECT
        (
            SELECT to_jsonb(en) ->> 'encrypted_display_title'
            FROM event_notification en
            WHERE en.event_id = ce.id
              AND to_jsonb(en) ->> 'encrypted_display_title' IS NOT NULL
            ORDER BY en.updated_at DESC
            LIMIT 1
        ),
        ce.start, ce."end", ce.all_day,
        u.email, COALESCE(us.timezone, 'UTC'), COALESCE(us."timeFormat", '24h')
    FROM calendar_event ce
    INNER JOIN "user" u ON u.id = ce.user_id
    LEFT JOIN user_settings us ON us.user_id = u.id
    WHERE ce.id = $1 AND ce.user_id = $2
"#;

type ReminderRow = (
    Option<String>,
    PrimitiveDateTime,
    PrimitiveDateTime,
    bool,
    String,
    String,
    String,
);

pub async fn load_reminder(
    db: &PgPool,
    event_id: &str,
    user_id: &str,
) -> Result<Reminder, sqlx::Error> {
    let (title, start, end, all_day, user_email, timezone, time_format): ReminderRow =
        sqlx::query_as(LOAD_REMINDER)
            .bind(event_id)
            .bind(user_id)
            .fetch_one(db)
            .await?;
    Ok(Reminder {
        encrypted_title: title.unwrap_or_default().trim().to_owned(),
        start: utc(start),
        end: utc(end),
        all_day,
        user_email,
        timezone,
        time_format,
    })
}

/// A `TIMESTAMP(3)` column, which holds UTC.
pub fn utc(value: PrimitiveDateTime) -> Timestamp {
    Timestamp::from_nanosecond(value.assume_utc().unix_timestamp_nanos()).unwrap_or_default()
}

/// The user's zone, or UTC when it is unset or unknown.
pub fn zone(name: &str) -> TimeZone {
    TimeZone::get(name).unwrap_or(TimeZone::UTC)
}

/// The start in the user's zone and 12/24-hour format, or empty for all-day events.
pub fn start_clock(reminder: &Reminder) -> String {
    if reminder.all_day {
        return String::new();
    }
    let format = if reminder.time_format == "12h" {
        "%-I:%M %p"
    } else {
        "%H:%M"
    };
    reminder
        .start
        .to_zoned(zone(&reminder.timezone))
        .strftime(format)
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn retries_back_off_then_cap() {
        let secs = |attempts| retry_delay(attempts).as_secs();
        assert_eq!(
            [0, 1, 2, 3, 6, 7, 8].map(secs),
            [15, 15, 30, 60, 480, 900, 900]
        );
    }

    fn reminder(time_format: &str, timezone: &str, all_day: bool) -> Reminder {
        Reminder {
            encrypted_title: String::new(),
            start: "2026-07-15T13:30:00Z".parse().unwrap(),
            end: "2026-07-15T14:30:00Z".parse().unwrap(),
            all_day,
            user_email: String::new(),
            timezone: timezone.into(),
            time_format: time_format.into(),
        }
    }

    #[test]
    fn start_clocks_follow_the_users_zone_and_format() {
        assert_eq!(
            start_clock(&reminder("24h", "Europe/Amsterdam", false)),
            "15:30"
        );
        assert_eq!(
            start_clock(&reminder("12h", "America/New_York", false)),
            "9:30 AM"
        );
        assert_eq!(start_clock(&reminder("24h", "Not/AZone", false)), "13:30");
        assert_eq!(start_clock(&reminder("24h", "UTC", true)), "");
    }

    #[test]
    fn the_reminder_query_reads_ciphertext_only() {
        assert!(LOAD_REMINDER.contains("encrypted_display_title"));
        for content in ["ce.title", "ce.description", "ce.location", "ce.encrypted"] {
            assert!(!LOAD_REMINDER.contains(content), "{content}");
        }
    }

    #[test]
    fn the_claim_holds_a_lease() {
        assert!(CLAIM_PENDING.contains("FOR UPDATE SKIP LOCKED"));
        assert!(CLAIM_PENDING.contains("available_at = NOW() + interval '2 minutes'"));
        assert!(CLAIM_PENDING.contains("attempts = j.attempts + 1"));
    }
}
