//! Mail: the signed Stalwart webhook and the opaque `new_mail` pushes it queues.

pub mod push;
mod queries;
mod routes;
pub mod webhook;

pub use routes::routes;
