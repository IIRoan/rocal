//! Mail: accounts, provisioning and per-user tokens, the JMAP proxy, sync and realtime, and the signed Stalwart webhook with the opaque `new_mail` pushes it queues.

pub mod bridge;
pub mod proxy;
pub mod push;
mod queries;
pub mod realtime;
pub mod routes;
pub mod service;
pub mod sync;
pub mod webhook;

pub use routes::routes;
