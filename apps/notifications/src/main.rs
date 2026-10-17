//! The notifications worker: due reminders and `notification_job` rows go out every 5 s as noreply mail over Stalwart JMAP and APNs push; ephemeral rows are pruned hourly.

mod apns;
mod jobs;
mod payload;
mod reminder;
mod retention;
mod schedule;
mod settings;
mod worker;

use std::net::Ipv6Addr;
use std::sync::Arc;
use std::time::Duration;

use anyhow::{Context, bail};
use axum::Router;
use axum::routing::any;
use sea_orm::sqlx::postgres::PgPoolOptions;

use crate::settings::Settings;
use crate::worker::Worker;

const TICK: Duration = Duration::from_secs(5);
/// Cleanup runs at this minute of every hour, never at startup.
const CLEANUP_MINUTE: i8 = 17;

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
    let testing = cli.test_email || cli.test_push;
    if !testing && !cli.extra.is_empty() {
        bail!("unexpected arguments: {}", cli.extra.join(" "));
    }
    let database_url = settings
        .get("DATABASE_URL")
        .context("DATABASE_URL not found")?;
    let db = PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(5))
        .max_lifetime(Duration::from_secs(30 * 60))
        .connect(&database_url)
        .await
        .context("failed to connect to the database")?;
    tracing::info!("Database connection initialized");
    let recipient = cli
        .recipient
        .or_else(|| cli.extra.first().cloned())
        .or_else(|| settings.get("TEST_EMAIL"))
        .map(|value| value.trim().to_owned());
    let port = settings.port();
    let worker = Arc::new(Worker::new(db.clone(), settings));

    if testing {
        let recipient = recipient.filter(|value| !value.is_empty()).context(
            "test recipient is required; use --test-to, pass an address after the flag, or set TEST_EMAIL",
        )?;
        let mut failed = false;
        if cli.test_push
            && let Err(error) = worker.send_test_push(&recipient).await
        {
            tracing::error!(%error, "Failed to send test push");
            failed = true;
        }
        if cli.test_email
            && let Err(error) = worker.send_test_email(&recipient).await
        {
            tracing::error!(%error, "Failed to send test email");
            failed = true;
        }
        if failed {
            std::process::exit(1);
        }
        return Ok(());
    }

    let ticker = tokio::spawn({
        let worker = worker.clone();
        async move {
            let mut every = tokio::time::interval(TICK);
            every.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
            loop {
                every.tick().await;
                worker.tick().await;
            }
        }
    });
    let cleaner = tokio::spawn({
        let worker = worker.clone();
        async move {
            loop {
                tokio::time::sleep(until_minute(CLEANUP_MINUTE)).await;
                worker.cleanup().await;
            }
        }
    });
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
    // `::` also accepts IPv4 here, so both Railway's private network and its health check reach it.
    let listener = tokio::net::TcpListener::bind((Ipv6Addr::UNSPECIFIED, port)).await?;
    tracing::info!(port, "HTTP server listening");
    axum::serve(listener, app)
        .with_graceful_shutdown({
            let worker = worker.clone();
            async move {
                shutdown_signal().await;
                tracing::info!("Shutting down notification worker");
                worker.stop();
                ticker.abort();
                cleaner.abort();
            }
        })
        .await?;
    db.close().await;
    tracing::info!("Notification worker stopped");
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
}
