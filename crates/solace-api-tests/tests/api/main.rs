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
mod passkeys;
mod settings;

// Shared by every domain module; no single module uses every helper.
#[allow(dead_code)]
mod helpers;
// Shared by the mail modules; no single module uses every fixture.
#[allow(dead_code)]
mod mail_support;
