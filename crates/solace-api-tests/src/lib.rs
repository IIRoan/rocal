//! Black-box API suite support: production guard, test environment, HTTP client and fixtures.

pub mod client;
pub mod env;
pub mod guard;
pub mod seed;
pub mod webauthn;

pub type Result<T, E = Error> = std::result::Result<T, E>;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Guard(#[from] guard::GuardError),
    #[error(transparent)]
    Http(#[from] reqwest::Error),
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error("expected HTTP {expected}, got {actual}: {body}")]
    Status {
        expected: u16,
        actual: u16,
        body: String,
    },
    #[error("HTTP {status} body is not the expected JSON ({source}): {body}")]
    Body {
        status: u16,
        source: serde_json::Error,
        body: String,
    },
    #[error("{0}")]
    Unexpected(String),
}
