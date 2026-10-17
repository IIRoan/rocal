//! `/api/settings`: per-user calendar preferences, created with defaults on first read.

mod queries;
pub mod routes;
pub mod service;

pub use routes::routes;
