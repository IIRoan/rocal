//! Tracing with only opaque ids as fields, the shared redaction rules, and Errex reporting.

mod redaction;
mod report;

pub use redaction::{log_ref, redact_pii, sanitize_context, sanitize_request_url};

use tracing_subscriber::EnvFilter;

/// Installs the subscriber (JSON lines in production) and the Errex client; keep the guard alive.
pub fn init(is_production: bool, sentry_dsn: Option<&str>) -> Option<sentry::ClientInitGuard> {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let builder = tracing_subscriber::fmt().with_env_filter(filter);
    // A subscriber may already exist when tests start several servers in one process.
    let _ = if is_production {
        builder.json().with_current_span(false).try_init()
    } else {
        builder.try_init()
    };
    let environment = if is_production {
        "production"
    } else {
        "development"
    };
    report::init(sentry_dsn, environment)
}

pub fn report_error(error: &(dyn std::error::Error + 'static), request_id: &str) {
    if sentry::Hub::current().client().is_some() {
        report::capture(error, request_id);
    }
}
