//! Request and response types of the Solace API, shared by the server, the API suite and the generated TypeScript types.

pub mod account;
pub mod auth;
pub mod calendars;
pub mod categories;
pub mod common;
pub mod e2ee;
pub mod events;
pub mod mail;
pub mod mail_settings;
pub mod notifications;
pub mod profiles;
pub mod push_devices;
pub mod recent_contacts;
pub mod recurring;
pub mod settings;
pub mod subscriptions;

pub use common::{ErrorResponse, SuccessMessage, Timestamp};
