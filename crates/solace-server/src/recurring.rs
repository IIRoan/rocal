//! Recurring series (`/api/recurring`): rule validation and preview, common patterns, and scoped edits and deletes.

mod queries;
pub mod routes;
mod rules;
pub mod service;

pub use routes::routes;
