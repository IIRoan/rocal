//! One test binary for the whole API suite; one module per domain.
// Harness setup failures abort the test, which is what a panic is for here.
#![allow(clippy::expect_used, clippy::unwrap_used)]

// Shared by every domain module; no single module uses every helper.
#[allow(dead_code)]
mod helpers;
// Shared by the event modules; none uses every fixture.
#[allow(dead_code)]
mod event_fixtures;
mod events;
mod events_list;
mod invitations;
mod notifications;
mod recurring;
mod settings;
