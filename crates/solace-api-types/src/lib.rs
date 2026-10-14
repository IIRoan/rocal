//! Request and response types of the Solace API, shared by the server, the API suite and the generated TypeScript types.

pub mod account;
pub mod auth;
pub mod calendars;
pub mod categories;
pub mod common;
pub mod mail_settings;
pub mod recent_contacts;
pub mod settings;

pub use common::{ErrorResponse, SuccessMessage, Timestamp};
