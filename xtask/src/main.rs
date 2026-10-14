//! Repository tasks, run as `cargo xtask <task>`.
// A CLI reports to the terminal.
#![allow(clippy::print_stdout, clippy::print_stderr)]

mod test_env;
mod ts_backend;

use std::path::PathBuf;

const USAGE: &str = "usage: cargo xtask <task>

tasks:
  test-env up             start local Postgres 18 and the test Stalwart (podman)
  test-env down           stop and remove them
  test-env template       rebuild solace_test_template from apps/backend/prisma/migrations
  test-env clone <name>   create database <name> from the template
  test-env seed <api> <database>
                          seed synthetic data through the backend at <api>
  test-env stalwart-key   mint a Stalwart API key for the solace-provisioner test account
  ts-backend --checkout <dir> [--database <name>] [--port <port>]
                          run the current TypeScript backend against the test env";

#[tokio::main(flavor = "current_thread")]
async fn main() -> anyhow::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    match args.as_slice() {
        ["test-env", rest @ ..] => test_env::run(rest).await,
        ["ts-backend", rest @ ..] => ts_backend::run(rest).await,
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
