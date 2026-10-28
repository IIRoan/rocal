//! Tracing with only opaque ids as fields and log redaction.

mod redaction;

pub use redaction::{log_ref, redact_pii, sanitize_request_url};

use tracing_subscriber::EnvFilter;

/// Installs the subscriber (JSON lines in production).
pub fn init(is_production: bool) {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    let builder = tracing_subscriber::fmt().with_env_filter(filter);
    // A subscriber may already exist when tests start several servers in one process.
    let _ = if is_production {
        builder.json().with_current_span(false).try_init()
    } else {
        builder.try_init()
    };
}
