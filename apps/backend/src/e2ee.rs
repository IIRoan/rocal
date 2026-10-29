//! `/api/e2ee`: client-owned wrapping keys and the password envelope, stored as sent, plus raw records for re-encryption.

pub(crate) mod queries;
pub mod routes;
pub mod service;

pub use routes::routes;
