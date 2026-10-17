//! `/api/profiles`: profile-picture lookup by email, the authenticated avatar proxy, and uploaded avatars.

pub mod avatars;
mod queries;
pub mod routes;
pub mod service;

pub use routes::routes;
