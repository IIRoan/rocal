//! Event reminders: when they fire, the per-event notification settings, and the outbox payload rules.

pub mod calculator;
pub mod job_payload;
mod queries;
pub mod routes;
pub mod service;

pub use routes::routes;
