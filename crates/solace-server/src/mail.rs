//! Mail accounts: mailbox status and provisioning, vault backups, the key directory, the public config and per-user mail tokens.

pub mod bridge;
mod queries;
pub mod routes;
pub mod service;

pub use routes::routes;
