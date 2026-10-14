//! One test binary for the whole API suite; one module per domain.
// Harness setup failures abort the test, which is what a panic is for here.
#![allow(clippy::expect_used, clippy::unwrap_used)]

mod auth_passwords;
mod auth_sessions;
// Shared by every domain module; no single module uses every helper.
#[allow(dead_code)]
mod helpers;
mod passkeys;
mod settings;
