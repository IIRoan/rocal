//! Events: the calendar entries themselves, their encryption rules, recurrence and participants.

pub mod constraints;
pub mod encryption;
pub mod listing;
pub mod participants;
pub mod queries;
pub mod recurrence;
pub mod routes;
pub mod service;
pub mod view;

pub use routes::routes;
