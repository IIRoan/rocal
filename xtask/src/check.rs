//! `cargo xtask check`: everything CI runs: fmt, clippy, unit tests, the API suite on Rust in both modes, generated-code diffs, Jest destinations and memory budgets.

use std::process::Command;

use anyhow::{Context, ensure};

pub async fn run(args: &[&str]) -> anyhow::Result<()> {
    let skip_memory = args.contains(&"--skip-mem");
    cargo(&["fmt", "--all", "--check"])?;
    cargo(&["clippy", "--all-targets", "--", "-D", "warnings"])?;
    cargo(&[
        "test",
        "--workspace",
        "--exclude",
        "solace-api-tests",
        "--quiet",
    ])?;
    cargo(&["test", "-p", "solace-api-tests", "--lib", "--quiet"])?;
    for mode in ["development", "production"] {
        suite(mode)?;
    }
    crate::openapi::run(&["--check"])?;
    crate::entities::run(&["--check"]).await?;
    crate::jest_destinations::run(&["--complete"])?;
    if !skip_memory {
        crate::mem_budget::run(&[]).await?;
    }
    println!("xtask check: OK");
    Ok(())
}

fn cargo(args: &[&str]) -> anyhow::Result<()> {
    println!("+ cargo {}", args.join(" "));
    let status = Command::new("cargo")
        .current_dir(crate::repo_root())
        .args(args)
        .status()?;
    ensure!(status.success(), "cargo {} failed", args.join(" "));
    Ok(())
}

/// Runs the whole suite against the in-process Rust server.
fn suite(mode: &str) -> anyhow::Result<()> {
    println!("+ API suite on Rust ({mode})");
    let status = Command::new("cargo")
        .current_dir(crate::repo_root())
        .args([
            "test",
            "-p",
            "solace-api-tests",
            "--test",
            "api",
            "--",
            "--test-threads",
            "8",
        ])
        .env_remove("API_BASE_URL")
        .env("TEST_BACKEND_MODE", mode)
        .status()
        .context("run the API suite (is `cargo xtask test-env up` running?)")?;
    ensure!(status.success(), "API suite failed on Rust ({mode})");
    Ok(())
}
