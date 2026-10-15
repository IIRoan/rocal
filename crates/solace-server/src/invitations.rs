//! Mailed calendar invitations: ICS ingestion into the hidden staging calendar, declines, the iTIP replies and the REQUEST mail Solace sends.

mod queries;
pub mod request;
pub mod routes;
pub mod rsvp_reply;
pub mod service;

pub use routes::routes;
pub use service::{
    resolve_accepted_invitation_target_calendar, resolve_invitation_staging_calendar,
};
