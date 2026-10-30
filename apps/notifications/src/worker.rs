//! The worker: every tick claims due reminders and pending jobs and delivers them; hourly it prunes ephemeral rows.

use std::collections::VecDeque;
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use axum::Json;
use axum::http::StatusCode;
use jiff::Timestamp;
use sea_orm::sqlx::{self, PgPool};
use serde_json::{Value, json};
use solace_server::integrations::stalwart::gate::StalwartGate;
use solace_server::integrations::stalwart::mailer::{self, MailerConfig};
use solace_server::push_devices::bundle_receives_kind;
use solace_server::telemetry::redact_pii;
use time::PrimitiveDateTime;

use crate::apns::{self, Apns, Device, Notification};
use crate::jobs::{self, Job, MAX_ATTEMPTS, PushDevice};
use crate::reminder;
use crate::retention;
use crate::schedule;
use crate::settings::Settings;

const CLAIM_LIMIT: i64 = 50;
const KEPT_ERRORS: usize = 50;
const TICK_TIMEOUT: Duration = Duration::from_secs(45);
const CLEANUP_TIMEOUT: Duration = Duration::from_secs(10 * 60);
/// Test pushes go to every app, so either app's settings can verify delivery.
const TEST_EVENT_IDS: [&str; 2] = ["test-notification", "manual-test"];

/// Why a job did not go out.
#[derive(Debug)]
pub enum Undelivered {
    /// Marked skipped; never retried.
    Skipped,
    /// Retried later with backoff.
    Failed(String),
}

impl From<sqlx::Error> for Undelivered {
    fn from(error: sqlx::Error) -> Self {
        Self::Failed(error.to_string())
    }
}

#[derive(Default)]
struct Status {
    processed: u64,
    failed: u64,
    last_processed_at: Option<Timestamp>,
    errors: VecDeque<(String, Timestamp)>,
}

pub struct Mailer {
    config: MailerConfig,
    gate: StalwartGate,
}

pub struct Worker {
    db: PgPool,
    http: reqwest::Client,
    settings: Settings,
    mailer: Option<Mailer>,
    apns: Option<Apns>,
    running: AtomicBool,
    cleaning: AtomicBool,
    status: Mutex<Status>,
}

/// Now as the naive UTC the `TIMESTAMP(3)` columns hold.
pub fn utc_now() -> PrimitiveDateTime {
    let now = time::OffsetDateTime::now_utc();
    PrimitiveDateTime::new(now.date(), now.time())
}

impl Worker {
    pub fn new(db: PgPool, settings: Settings) -> Self {
        let gate_key = settings.get("STALWART_GATE_KEY");
        let mailer = settings.mailer().map(|config| Mailer {
            gate: StalwartGate::new(&config.base_url, gate_key.as_deref()),
            config,
        });
        match &mailer {
            Some(_) => {
                tracing::info!("Stalwart JMAP mailer initialized")
            }
            None => tracing::warn!(
                "Stalwart JMAP mailer is not fully configured; email sending is disabled"
            ),
        }
        let apns = match settings.apns() {
            Ok((key_id, team_id, pem)) => Apns::new(&key_id, &team_id, &pem)
                .inspect_err(|error| tracing::warn!(%error, "APNs client could not start; push sending is disabled"))
                .ok(),
            Err(missing) => {
                tracing::warn!(missing = %missing.join(", "), "APNs is not fully configured; push sending is disabled");
                None
            }
        };
        if apns.is_some() {
            tracing::info!("APNs client initialized");
        }
        Self {
            db,
            http: reqwest::Client::new(),
            settings,
            mailer,
            apns,
            running: AtomicBool::new(true),
            cleaning: AtomicBool::new(false),
            status: Mutex::new(Status::default()),
        }
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
    }

    fn status(&self) -> std::sync::MutexGuard<'_, Status> {
        self.status
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    fn record_error(&self, message: &str) {
        let mut status = self.status();
        status
            .errors
            .push_back((redact_pii(message), Timestamp::now()));
        while status.errors.len() > KEPT_ERRORS {
            status.errors.pop_front();
        }
    }

    /// One run of the 5-second loop, bounded so a stuck upstream cannot hold the next tick.
    pub async fn tick(&self) {
        self.status().last_processed_at = Some(Timestamp::now());
        let result = tokio::time::timeout(TICK_TIMEOUT, self.process()).await;
        if let Err(message) = result.unwrap_or_else(|_| Err("Notification tick timed out".into())) {
            self.status().failed += 1;
            self.record_error(&message);
            tracing::error!(error = %redact_pii(&message), "Scheduled processing failed");
        }
    }

    async fn process(&self) -> Result<(), String> {
        let due = schedule::claim_due(&self.db, utc_now()).await;
        match &due {
            Ok(0) => {}
            Ok(count) => tracing::info!(count, "Claimed due reminder schedules"),
            Err(error) => {
                self.status().failed += 1;
                self.record_error(&error.to_string());
                tracing::error!(error = %redact_pii(&error.to_string()), "Failed to claim due reminder schedules");
            }
        }
        let due_error = due.err().map(|error| error.to_string());
        let claimed = jobs::claim_pending(&self.db, CLAIM_LIMIT)
            .await
            .map_err(|error| match &due_error {
                Some(due) => format!("{due}; {error}"),
                None => error.to_string(),
            })?;
        if claimed.is_empty() {
            return due_error.map_or(Ok(()), Err);
        }
        let (mut sent, mut skipped, mut failed) = (0, 0, 0);
        for job in &claimed {
            match self.dispatch(job).await {
                Ok(()) => {
                    sent += 1;
                    self.status().processed += 1;
                    if let Err(error) = jobs::mark_sent(&self.db, &job.id).await {
                        tracing::warn!(job_id = %job.id, %error, "Job sent but could not be marked sent");
                    }
                    if let Err(error) = jobs::insert_log(&self.db, job, "sent").await {
                        tracing::warn!(job_id = %job.id, %error, "Failed to write the notification log");
                    }
                }
                Err(Undelivered::Skipped) => skipped += 1,
                Err(Undelivered::Failed(message)) => {
                    failed += 1;
                    self.status().failed += 1;
                    self.record_error(&message);
                    tracing::error!(kind = %job.kind(), channel = %job.channel, error = %redact_pii(&message), "Failed to send job");
                    if let Err(error) = jobs::insert_log(&self.db, job, "failed").await {
                        tracing::warn!(job_id = %job.id, %error, "Failed to write the notification failure log");
                    }
                    let delay = jobs::retry_delay(job.attempts);
                    if let Err(error) = jobs::mark_failed(&self.db, &job.id, delay, &message).await
                    {
                        tracing::warn!(job_id = %job.id, %error, "Failed to reschedule the job");
                    }
                }
            }
        }
        tracing::info!(sent, skipped, failed, "Notification processing complete");
        due_error.map_or(Ok(()), Err)
    }

    async fn dispatch(&self, job: &Job) -> Result<(), Undelivered> {
        if job.attempts >= MAX_ATTEMPTS {
            return self.skip(job, "max delivery attempts exceeded").await;
        }
        match job.channel.as_str() {
            "email" => self.dispatch_email(job).await,
            "push" => self.dispatch_push(job).await,
            _ => self.skip(job, "unknown channel").await,
        }
    }

    /// Marks the job skipped; a skipped reminder push that stood in for the email queues that email, atomically.
    async fn skip(&self, job: &Job, reason: &str) -> Result<(), Undelivered> {
        if job.channel == "push" && job.payload.email_fallback {
            let mut tx = self.db.begin().await?;
            jobs::mark_skipped(&mut *tx, &job.id).await?;
            schedule::queue_email_fallback(
                &mut *tx,
                &job.user_id,
                job.event_id(),
                job.minutes_before(),
            )
            .await?;
            tx.commit().await?;
        } else {
            jobs::mark_skipped(&self.db, &job.id).await?;
        }
        tracing::info!(kind = %job.kind(), channel = %job.channel, reason, "Skipped job");
        Err(Undelivered::Skipped)
    }

    async fn dispatch_email(&self, job: &Job) -> Result<(), Undelivered> {
        let Some(mailer) = &self.mailer else {
            return self.skip(job, "email sending is not configured").await;
        };
        let event_id = job.event_id();
        let reminder = jobs::load_reminder(&self.db, event_id, &job.user_id).await?;
        if reminder.user_email.is_empty() {
            return Err(Undelivered::Failed("user email is required".into()));
        }
        let minutes = job.minutes_before();
        let content = reminder::content(&reminder, minutes, event_id, &self.settings);
        let message = reminder::message(&content, &mailer.config.from);
        let id = mailer::send(
            &self.http,
            &mailer.gate,
            &mailer.config,
            &reminder.user_email,
            &message,
        )
        .await
        .map_err(|error| {
            Undelivered::Failed(format!("failed to send email with Stalwart: {error}"))
        })?;
        tracing::info!(submission = %id, "Reminder email queued");
        Ok(())
    }

    async fn dispatch_push(&self, job: &Job) -> Result<(), Undelivered> {
        let Some(apns) = &self.apns else {
            return self.skip(job, "push sending is not configured").await;
        };
        let mut devices = jobs::push_devices(&self.db, &job.user_id).await?;
        if devices.is_empty() {
            if job.attempts >= 3 {
                return self.skip(job, "no registered devices").await;
            }
            return Err(Undelivered::Failed("no registered devices".into()));
        }
        let kind = job.kind();
        let event_id = job.event_id();
        let test = TEST_EVENT_IDS.contains(&event_id);
        if !test {
            devices.retain(|device| bundle_receives_kind(&device.bundle_id, kind));
            if devices.is_empty() {
                return self.skip(job, "no devices for this push kind").await;
            }
        }
        let notification = match kind {
            "new_mail" => {
                let count = job.payload.inbound_count.unwrap_or_default().max(1);
                let mut notification =
                    apns::new_mail(count, &job.payload.email_id, &job.payload.account_id);
                if notification.collapse_id == "mail:" {
                    notification.collapse_id = format!("mail:{}", job.id);
                }
                notification
            }
            "event_reminder" => {
                let (title, lead) = if event_id.is_empty() || test {
                    (String::new(), String::new())
                } else {
                    let reminder = jobs::load_reminder(&self.db, event_id, &job.user_id).await?;
                    let lead =
                        jobs::load_lead(&self.db, event_id, &job.user_id, job.minutes_before())
                            .await?;
                    (reminder.encrypted_title, lead)
                };
                // The scheduled instant, not now: a late or retried push must not show the event later than it starts.
                let due_at = job
                    .payload
                    .due_at
                    .unwrap_or_else(|| jiff::Timestamp::now().as_second());
                apns::event_reminder(event_id, &title, &lead, due_at)
            }
            _ => return self.skip(job, "unknown kind").await,
        };
        tracing::info!(kind, devices = devices.len(), "Sending push");
        let mut last_error = None;
        let mut sent = 0;
        for device in &devices {
            match self.send_to_device(apns, device, &notification).await {
                Ok(()) => sent += 1,
                Err(error) => {
                    tracing::warn!(bundle = %device.bundle_id, environment = %device.environment, %error, "APNs delivery failed");
                    last_error = Some(error);
                }
            }
        }
        if sent < devices.len() {
            tracing::warn!(
                kind,
                sent,
                devices = devices.len(),
                "Push only partly delivered"
            );
            return Err(Undelivered::Failed(last_error.unwrap_or_else(|| {
                format!("APNs delivered to {sent}/{} devices", devices.len())
            })));
        }
        tracing::info!(kind, sent, "Push delivered");
        Ok(())
    }

    async fn send_to_device(
        &self,
        apns: &Apns,
        device: &PushDevice,
        notification: &Notification,
    ) -> Result<(), String> {
        let target = Device {
            token: &device.token,
            bundle_id: &device.bundle_id,
            environment: &device.environment,
        };
        let (delivery, environment) = apns
            .send_preferring(&target, notification)
            .await
            .map_err(|error| error.to_string())?;
        if delivery.unregistered {
            if let Err(error) = jobs::delete_push_device(&self.db, &device.token_hash).await {
                tracing::warn!(%error, "Failed to delete an unregistered device");
            }
            return Err("APNs rejected an unregistered token".into());
        }
        if delivery.status >= 400 {
            return Err(match delivery.reason.as_str() {
                "" => "APNs rejected push".into(),
                reason => format!("APNs rejected push: {reason}"),
            });
        }
        if environment != device.environment
            && let Err(error) =
                jobs::set_push_device_environment(&self.db, &device.token_hash, &environment).await
        {
            tracing::warn!(%error, "Failed to store the device's APNs environment");
        }
        tracing::info!(kind = notification.kind.as_str(), %environment, status = delivery.status, bundle = %device.bundle_id, "APNs accepted push");
        Ok(())
    }

    /// The hourly cleanup; a run still going when the next is due makes that one skip.
    pub async fn cleanup(&self) {
        if self.cleaning.swap(true, Ordering::SeqCst) {
            tracing::info!("Retention cleanup still running; skipping this tick");
            return;
        }
        let rules = retention::rules();
        let run = retention::run_rules(
            &self.db,
            utc_now(),
            &rules,
            retention::BATCH_SIZE,
            retention::MAX_BATCHES_PER_RULE,
        );
        match tokio::time::timeout(CLEANUP_TIMEOUT, run).await {
            Ok((deleted, errors)) => {
                for (rule, count) in deleted.iter().filter(|(_, count)| *count > 0) {
                    tracing::info!(rule, count, "Retention cleanup deleted rows");
                }
                for error in &errors {
                    self.record_error(error);
                    tracing::error!(%error, "Retention cleanup failed");
                }
                let total: u64 = deleted.iter().map(|(_, count)| count).sum();
                tracing::info!(total, "Retention cleanup complete");
            }
            Err(_) => {
                self.record_error("Retention cleanup timed out");
                tracing::error!("Retention cleanup timed out");
            }
        }
        self.cleaning.store(false, Ordering::SeqCst);
    }

    pub fn health(&self) -> (StatusCode, Json<Value>) {
        let running = self.running.load(Ordering::SeqCst);
        let code = if running {
            StatusCode::OK
        } else {
            StatusCode::SERVICE_UNAVAILABLE
        };
        let body = json!({
            "status": if running { "healthy" } else { "stopped" },
            "timestamp": Timestamp::now().to_string(),
            "service": "notifications",
            "push": self.apns.is_some(),
            "email": self.mailer.is_some(),
        });
        (code, Json(body))
    }

    pub async fn status_report(&self) -> Json<Value> {
        let pending: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM notification_job WHERE status = 'pending'")
                .fetch_one(&self.db)
                .await
                .inspect_err(
                    |error| tracing::warn!(%error, "Failed to count pending notifications"),
                )
                .unwrap_or_default();
        let status = self.status();
        let mut report = json!({
            "isRunning": self.running.load(Ordering::SeqCst),
            "pendingNotifications": pending,
            "processedCount": status.processed,
            "failedCount": status.failed,
            "errors": status.errors.iter().map(|(error, at)| json!({"error": error, "timestamp": at.to_string()})).collect::<Vec<_>>(),
        });
        if let Some(at) = status.last_processed_at {
            report["lastProcessedAt"] = json!(at.to_string());
        }
        Json(report)
    }

    /// `--test-push`: a lock-screen reminder to every registered device of the account at `recipient`.
    pub async fn send_test_push(&self, recipient: &str) -> Result<(), String> {
        let Some(apns) = &self.apns else {
            return Err("push service not configured".into());
        };
        let user_id: Option<String> =
            sqlx::query_scalar(r#"SELECT id FROM "user" WHERE lower(email) = lower($1)"#)
                .bind(recipient)
                .fetch_optional(&self.db)
                .await
                .map_err(|error| error.to_string())?;
        let user_id = user_id.ok_or("no user found for that address")?;
        let devices = jobs::push_devices(&self.db, &user_id)
            .await
            .map_err(|error| error.to_string())?;
        if devices.is_empty() {
            let total: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM push_device WHERE user_id = $1")
                    .bind(&user_id)
                    .fetch_one(&self.db)
                    .await
                    .map_err(|error| error.to_string())?;
            return Err(if total > 0 {
                format!(
                    "this account has {total} disabled iOS device(s); open Solace Calendar or Solace Mail while signed in"
                )
            } else {
                "no registered iOS devices for this account; open Solace Calendar or Solace Mail while signed in".into()
            });
        }
        let mut notification =
            apns::event_reminder("manual-test", "", "", jiff::Timestamp::now().as_second());
        notification.collapse_id = format!("test:{user_id}");
        let mut sent = 0;
        let mut last_error = None;
        for device in &devices {
            match self.send_to_device(apns, device, &notification).await {
                Ok(()) => {
                    sent += 1;
                    tracing::info!(bundle = %device.bundle_id, "Test push accepted");
                }
                Err(error) => last_error = Some(error),
            }
        }
        if sent == 0 {
            return Err(last_error.unwrap_or_else(|| "APNs did not accept a test push".into()));
        }
        tracing::info!(sent, "Test push delivered");
        Ok(())
    }
}

/// `--test`: a sample reminder email (an event 90 minutes out, 30 minutes' notice) to `recipient`; it needs no database.
pub async fn send_test_email(settings: &Settings, recipient: &str) -> Result<(), String> {
    let config = settings.mailer().ok_or("email service not configured")?;
    let gate_key = settings.get("STALWART_GATE_KEY");
    let gate = StalwartGate::new(&config.base_url, gate_key.as_deref());
    let start = Timestamp::now() + jiff::SignedDuration::from_mins(90);
    let sample = jobs::Reminder {
        encrypted_title: String::new(),
        start,
        end: start + jiff::SignedDuration::from_mins(45),
        all_day: false,
        user_email: recipient.into(),
        timezone: "Europe/Amsterdam".into(),
    };
    let content = reminder::content(&sample, 30, "manual-test-event", settings);
    let mut message = reminder::message(&content, &config.from);
    message.message_id = None;
    let id = mailer::send(&reqwest::Client::new(), &gate, &config, recipient, &message)
        .await
        .map_err(|error| format!("failed to send test email with Stalwart: {error}"))?;
    tracing::info!(submission = %id, "Test email queued");
    Ok(())
}

#[cfg(test)]
mod tests;
