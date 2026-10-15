//! Stalwart: the backend gate, the registry admin client and its limits, owner-authenticated JMAP, the reachability probe and the noreply mailer.

pub mod admin;
#[cfg(test)]
pub mod fake;
pub mod gate;
pub mod jmap;
pub mod limits;
pub mod mailer;
pub mod reachability;
