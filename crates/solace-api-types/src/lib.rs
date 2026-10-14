//! Request and response types of the Solace API, shared by the server, the API suite and the generated TypeScript types.

pub mod auth;
pub mod common;
pub mod settings;

pub use common::{ErrorResponse, SuccessMessage, Timestamp};
