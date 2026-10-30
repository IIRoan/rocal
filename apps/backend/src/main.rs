//! Boots the API: typed config, telemetry, a small Tokio runtime, the pool and its migrations, and graceful shutdown on SIGTERM.

#[global_allocator]
static ALLOCATOR: tikv_jemallocator::Jemalloc = tikv_jemallocator::Jemalloc;

use anyhow::Context;
use solace_server::config::Config;
use solace_server::mail::realtime;
use solace_server::state::AppState;
use solace_server::subscriptions::scheduler;
use solace_server::{db, telemetry};

fn main() -> anyhow::Result<()> {
    let config = Config::from_env()?;
    telemetry::init(config.is_production);
    tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .max_blocking_threads(8)
        .enable_all()
        .build()?
        .block_on(run(config))
}

async fn run(config: Config) -> anyhow::Result<()> {
    let db = db::connect(&config.database_url, config.database_pool_size)
        .await
        .context("connect to the database")?;
    db::migrate(&db).await.context("apply the migrations")?;
    let port = config.port;
    let state = AppState::new(config, db)?;
    // Dual-stack: the production Railway environment's private DNS resolves to IPv6 only.
    let listener = tokio::net::TcpListener::bind(("::", port)).await?;
    tracing::info!(port, "Server is running");
    let calendar_sync = state
        .config
        .calendar_sync
        .then(|| scheduler::start(state.clone()));
    let receipt_poll = state
        .config
        .mail_receipt_polling
        .then(|| realtime::start(state.clone()));
    let stopping = state.clone();
    let shutdown = async move {
        shutdown_signal().await;
        for task in [calendar_sync, receipt_poll].into_iter().flatten() {
            task.abort();
        }
        realtime::stop(&stopping);
    };
    solace_server::serve(listener, state, shutdown).await?;
    Ok(())
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
