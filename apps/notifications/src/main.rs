//! The notifications worker: due reminders and `notification_job` rows go out every 5 s as noreply mail over Stalwart JMAP and APNs push; ephemeral rows are pruned hourly.

mod apns;
mod jobs;
mod payload;
mod reminder;
mod retention;
mod schedule;
mod settings;
mod worker;

use std::net::{Ipv4Addr, Ipv6Addr};
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, bail};
use axum::Router;
use axum::routing::any;
use sea_orm::sqlx::PgPool;
use sea_orm::sqlx::postgres::{PgConnectOptions, PgPoolOptions, PgSslMode};
use tokio::sync::watch;
use tokio::task::{JoinError, JoinSet};

use crate::settings::Settings;
use crate::worker::Worker;

const TICK: Duration = Duration::from_secs(5);
/// Cleanup runs at this minute of every hour, never at startup.
const CLEANUP_MINUTE: i8 = 17;
/// How long shutdown waits for running ticks, so a sent job is never left leased to go out again.
const DRAIN: Duration = Duration::from_secs(50);
const TEST_PUSH_TIMEOUT: Duration = Duration::from_secs(30);

/// `--test` (reminder email) and `--test-push` (lock-screen push) send once to a recipient and exit.
struct Cli {
    test_email: bool,
    test_push: bool,
    recipient: Option<String>,
    extra: Vec<String>,
}

fn parse_cli(args: impl Iterator<Item = String>) -> anyhow::Result<Cli> {
    let mut cli = Cli {
        test_email: false,
        test_push: false,
        recipient: None,
        extra: Vec::new(),
    };
    let mut args = args.peekable();
    while let Some(arg) = args.next() {
        match arg.trim_start_matches('-') {
            "test" if arg.starts_with('-') => cli.test_email = true,
            "test-push" if arg.starts_with('-') => cli.test_push = true,
            "test-to" if arg.starts_with('-') => {
                cli.recipient = Some(args.next().context("--test-to needs an address")?);
            }
            flag if arg.starts_with('-') && flag.starts_with("test-to=") => {
                cli.recipient = Some(flag["test-to=".len()..].to_owned());
            }
            _ if arg.starts_with('-') => bail!("unknown flag {arg}"),
            _ => cli.extra.push(arg),
        }
    }
    Ok(cli)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let settings = Settings::load();
    let _reporting = solace_server::telemetry::init(
        settings.is_production(),
        settings.get("SENTRY_DSN").as_deref(),
    );
    for file in &settings.loaded_files {
        tracing::info!(file = %file.display(), "Loaded environment file");
    }
    let cli = parse_cli(std::env::args().skip(1))?;
    if cli.test_email || cli.test_push {
        return run_tests(cli, settings).await;
    }
    if !cli.extra.is_empty() {
        bail!("unexpected arguments: {}", cli.extra.join(" "));
    }
    let port = settings.port().map_err(anyhow::Error::msg)?;
    let db = connect(&settings).await?;
    let worker = Arc::new(Worker::new(db.clone(), settings));
    let (stop, stopped) = watch::channel(false);
    let ticker = tokio::spawn(run_ticks(worker.clone(), stopped.clone()));
    let cleaner = tokio::spawn(run_cleanups(worker.clone(), stopped));
    tracing::info!("Notification worker started");

    let app = Router::new()
        .route(
            "/health",
            any({
                let worker = worker.clone();
                move || async move { worker.health() }
            }),
        )
        .route(
            "/status",
            any({
                let worker = worker.clone();
                move || async move { worker.status_report().await }
            }),
        );
    // `::` also takes IPv4 where the host has IPv6, so Railway's private network and health check both reach it.
    let listener = match tokio::net::TcpListener::bind((Ipv6Addr::UNSPECIFIED, port)).await {
        Ok(listener) => listener,
        Err(_) => tokio::net::TcpListener::bind((Ipv4Addr::UNSPECIFIED, port)).await?,
    };
    tracing::info!(port, "HTTP server listening");
    axum::serve(listener, app)
        .with_graceful_shutdown({
            let worker = worker.clone();
            async move {
                shutdown_signal().await;
                tracing::info!("Shutting down notification worker");
                worker.stop();
                let _ = stop.send(true);
            }
        })
        .await?;
    if tokio::time::timeout(DRAIN, ticker).await.is_err() {
        tracing::warn!("Running ticks did not finish before shutdown");
    }
    // Retention deletes run in bounded statements, so cutting a cleanup short loses nothing.
    cleaner.abort();
    db.close().await;
    tracing::info!("Notification worker stopped");
    Ok(())
}

/// A tick every 5 s; ticks overlap as the Go cron's did, which claims stay safe for (`SKIP LOCKED`).
async fn run_ticks(worker: Arc<Worker>, mut stopped: watch::Receiver<bool>) {
    let mut every = tokio::time::interval(TICK);
    every.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let mut running = JoinSet::new();
    loop {
        tokio::select! {
            _ = every.tick() => {
                let worker = worker.clone();
                running.spawn(async move { worker.tick().await });
            }
            Some(done) = running.join_next() => exit_on_panic(done, "tick"),
            _ = stopped.changed() => break,
        }
    }
    while let Some(done) = running.join_next().await {
        exit_on_panic(done, "tick");
    }
}

async fn run_cleanups(worker: Arc<Worker>, mut stopped: watch::Receiver<bool>) {
    loop {
        tokio::select! {
            () = tokio::time::sleep(until_minute(CLEANUP_MINUTE)) => {
                let worker = worker.clone();
                exit_on_panic(tokio::spawn(async move { worker.cleanup().await }).await, "cleanup");
            }
            _ = stopped.changed() => break,
        }
    }
}

/// A panic ends the process so Railway restarts it, as a panic did in the Go worker, instead of a silent stall.
fn exit_on_panic(done: Result<(), JoinError>, what: &str) {
    if let Err(error) = done
        && error.is_panic()
    {
        tracing::error!(task = what, "Worker task panicked; exiting for a restart");
        std::process::exit(1);
    }
}

/// The pool; without an explicit `sslmode` the connection requires TLS, as lib/pq did for the Go worker.
async fn connect(settings: &Settings) -> anyhow::Result<PgPool> {
    let url = settings
        .get("DATABASE_URL")
        .context("DATABASE_URL not found")?;
    let mut options: PgConnectOptions =
        url.parse().context("DATABASE_URL is not a Postgres URL")?;
    if !url.contains("sslmode=") {
        options = options.ssl_mode(PgSslMode::Require);
    }
    let db = PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(5))
        .max_lifetime(Duration::from_secs(30 * 60))
        .connect_with(options)
        .await
        .context("failed to connect to the database")?;
    tracing::info!("Database connection initialized");
    Ok(db)
}

/// `--test` needs only the mailer; `--test-push` also needs the database to find the account's devices.
async fn run_tests(cli: Cli, settings: Settings) -> anyhow::Result<()> {
    let recipient = cli
        .recipient
        .filter(|value| !value.trim().is_empty())
        .or_else(|| cli.extra.first().cloned())
        .or_else(|| settings.get("TEST_EMAIL"))
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .context("test recipient is required; use --test-to, pass an address after the flag, or set TEST_EMAIL")?;
    let mut failed = false;
    if cli.test_push {
        let push = async {
            let db = connect(&settings)
                .await
                .map_err(|error| error.to_string())?;
            Worker::new(db, settings.clone())
                .send_test_push(&recipient)
                .await
        };
        let outcome = tokio::time::timeout(TEST_PUSH_TIMEOUT, push)
            .await
            .unwrap_or_else(|_| Err("the test push timed out".into()));
        if let Err(error) = outcome {
            tracing::error!(%error, "Failed to send test push");
            failed = true;
        }
    }
    if cli.test_email
        && let Err(error) = worker::send_test_email(&settings, &recipient).await
    {
        tracing::error!(%error, "Failed to send test email");
        failed = true;
    }
    if failed {
        std::process::exit(1);
    }
    Ok(())
}

/// The wait until the next `minute` past the hour (UTC).
fn until_minute(minute: i8) -> Duration {
    let now = jiff::Timestamp::now().to_zoned(jiff::tz::TimeZone::UTC);
    let this_hour = now
        .with()
        .minute(minute)
        .second(0)
        .subsec_nanosecond(0)
        .build()
        .unwrap_or_else(|_| now.clone());
    let next = if this_hour > now {
        this_hour
    } else {
        this_hour
            .checked_add(jiff::SignedDuration::from_hours(1))
            .unwrap_or(this_hour)
    };
    next.duration_since(&now).unsigned_abs()
}

async fn shutdown_signal() {
    let interrupt = tokio::signal::ctrl_c();
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };
    tokio::select! {
        _ = interrupt => {}
        () = terminate => {}
    }
}

#[cfg(test)]
mod tests {
    use axum::Json;

    use super::*;

    fn cli(args: &[&str]) -> anyhow::Result<Cli> {
        parse_cli(args.iter().map(|arg| (*arg).to_owned()))
    }

    #[test]
    fn test_flags_take_a_recipient_in_any_form() {
        let flagged = cli(&["--test", "--test-to", "ann@example.com"]).unwrap();
        assert!(flagged.test_email && !flagged.test_push);
        assert_eq!(flagged.recipient.as_deref(), Some("ann@example.com"));
        let joined = cli(&["-test-push", "--test-to=bob@example.com"]).unwrap();
        assert!(joined.test_push);
        assert_eq!(joined.recipient.as_deref(), Some("bob@example.com"));
        let positional = cli(&["--test", "cy@example.com"]).unwrap();
        assert_eq!(positional.extra, ["cy@example.com"]);
        assert!(cli(&["--unknown"]).is_err());
        assert!(cli(&["--test-to"]).is_err());
    }

    #[test]
    fn cleanup_waits_at_most_an_hour() {
        let wait = until_minute(CLEANUP_MINUTE);
        assert!(wait > Duration::ZERO && wait <= Duration::from_secs(3600));
    }

    #[tokio::test]
    async fn stopping_drains_the_tick_loop() {
        let scratch = solace_server::db::scratch::ScratchDatabase::create().await;
        let db = PgPool::connect(&scratch.url).await.unwrap();
        let worker = Arc::new(Worker::new(db, Settings::from_pairs(&[])));
        let (stop, stopped) = watch::channel(false);
        let ticks = tokio::spawn(run_ticks(worker.clone(), stopped));
        tokio::time::sleep(Duration::from_millis(200)).await;
        stop.send(true).unwrap();
        tokio::time::timeout(Duration::from_secs(10), ticks)
            .await
            .unwrap()
            .unwrap();
        let Json(status) = worker.status_report().await;
        assert!(
            status.get("lastProcessedAt").is_some(),
            "the first tick ran"
        );
    }
}
