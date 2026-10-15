//! Boots the API: typed config, telemetry, a small Tokio runtime, the pool, and graceful shutdown on SIGTERM.

#[cfg(feature = "mimalloc")]
#[global_allocator]
static ALLOCATOR: mimalloc::MiMalloc = mimalloc::MiMalloc;

#[cfg(feature = "jemalloc")]
#[global_allocator]
static ALLOCATOR: tikv_jemallocator::Jemalloc = tikv_jemallocator::Jemalloc;

use anyhow::Context;
use solace_server::config::Config;
use solace_server::integrations::stalwart::admin::Admin;
use solace_server::state::AppState;
use solace_server::subscriptions::scheduler;
use solace_server::{db, telemetry};

fn main() -> anyhow::Result<()> {
    let config = Config::from_env()?;
    let _reporting = telemetry::init(config.is_production, config.sentry_dsn.as_deref());
    tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .max_blocking_threads(8)
        .enable_all()
        .build()?
        .block_on(run(config))
}

async fn run(config: Config) -> anyhow::Result<()> {
    let db = db::connect(&config.database_url)
        .await
        .context("connect to the database")?;
    let port = config.port;
    let state = AppState::new(config, db)?;
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port)).await?;
    tracing::info!(port, "Server is running");
    tokio::spawn(ensure_stalwart_webhook(state.clone()));
    let calendar_sync = scheduler::start(state.clone());
    let shutdown = async move {
        shutdown_signal().await;
        calendar_sync.abort();
    };
    solace_server::serve(listener, state, shutdown).await?;
    Ok(())
}

/// Registers the signed mail-ingest webhook with Stalwart; best effort, as a boot without it still serves.
async fn ensure_stalwart_webhook(state: AppState) {
    let config = &state.config;
    if config.stalwart_webhook_secret.is_empty() || config.stalwart_provision_token.is_empty() {
        return;
    }
    if let Err(error) = Admin::new(&state)
        .ensure_mail_ingest_webhook(
            &config.stalwart_webhook_url,
            &config.stalwart_webhook_secret,
        )
        .await
    {
        tracing::warn!(error = %telemetry::redact_pii(&error.to_string()), "Failed to ensure Stalwart mail ingest webhook");
    }
}

async fn shutdown_signal() {
    let interrupt = tokio::signal::ctrl_c();
    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(_) => std::future::pending::<()>().await,
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        _ = interrupt => {}
        () = terminate => {}
    }
    tracing::info!("Shutting down");
}
