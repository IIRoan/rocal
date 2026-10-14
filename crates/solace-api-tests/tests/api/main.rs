//! One test binary for the whole API suite; one module per domain.
// Harness setup failures abort the test, which is what a panic is for here.
#![allow(clippy::expect_used, clippy::unwrap_used)]

mod account_public;
mod auth_limits;
mod auth_passwords;
mod auth_sessions;
mod calendar_sharing;
mod calendars;
mod categories;
mod e2e_security;
mod edges;
mod encrypted_blobs;
mod invites;
mod mail_account;
mod mail_jmap;
mod mail_realtime;
mod mail_support;
mod mail_sync;
mod passkeys;
mod settings;
mod stalwart_webhook;

// Shared by every domain module; no single module uses every helper.
#[allow(dead_code)]
mod helpers;
