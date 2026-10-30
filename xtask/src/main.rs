//! Repository tasks, run as `cargo xtask <task>`.
// A CLI reports to the terminal.
#![allow(clippy::print_stdout, clippy::print_stderr)]

mod check;
mod entities;
mod mem_budget;
mod migrate;
mod openapi;
mod test_env;

use std::path::PathBuf;

const USAGE: &str = "usage: cargo xtask <task>

tasks:
  check [--skip-mem]      everything CI runs: fmt, clippy, tests, the API suite, generated-code diffs, memory budgets
  test-env up             start local Postgres 18 and the test Stalwart (podman)
  test-env down           stop and remove them
  test-env template       rebuild solace_test_template with the API's migrations
  test-env clone <name>   create database <name> from the template
  test-env seed <api> <database>
                          seed synthetic data through the backend at <api>
  test-env stalwart-key   mint a Stalwart API key for the solace-provisioner test account
  migrate new <name>      add apps/backend/src/db/migrations/m<timestamp>_<name>.rs and register it
  migrate status [<db>]   list applied and pending migrations of a test database (default: the template)
  migrate up [<db>]       apply the pending migrations to it, as the API does at startup
  entities [--check]      regenerate (or check) the SeaORM entities from the migrations
  mem-budget [--steady-seconds N] [--soak-minutes N]
                          measure a release build against the plan's memory budgets
  openapi [--check]       write packages/api-contracts/openapi.json and regenerate its TypeScript types";

#[tokio::main(flavor = "current_thread")]
async fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    match args.as_slice() {
        ["test-env", rest @ ..] => test_env::run(rest).await,
        ["migrate", rest @ ..] => migrate::run(rest).await,
        ["entities", rest @ ..] => entities::run(rest).await,
        ["openapi", rest @ ..] => openapi::run(rest),
        ["mem-budget", rest @ ..] => mem_budget::run(rest).await,
        ["check", rest @ ..] => check::run(rest).await,
        _ => {
            eprintln!("{USAGE}");
            std::process::exit(2);
        }
    }
}

/// The repository root (xtask lives one level below it).
fn repo_root() -> PathBuf {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .parent()
        .map(PathBuf::from)
        .unwrap_or(manifest_dir)
}
