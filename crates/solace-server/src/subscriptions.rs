//! Calendar subscriptions: external ICS feeds mirrored into read-only calendars, their background sync, and ICS file imports.

mod holidays;
mod queries;
pub mod routes;
pub mod scheduler;
pub mod service;

pub use routes::routes;
