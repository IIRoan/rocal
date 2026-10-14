//! Invites: the sender's routes (`/api/invites`), the public validate/claim service, and the sign-up gate that claimed invites open.

mod queries;
pub mod routes;
pub mod service;

pub use routes::routes;
