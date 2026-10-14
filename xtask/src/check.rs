//! `cargo xtask check`: everything CI runs: fmt, clippy, unit tests, the API suite on Rust in both modes, generated-code diffs, Jest destinations and memory budgets.

use std::collections::BTreeSet;
use std::process::Command;

use anyhow::{Context, bail};

/// Suite tests the Rust server must pass; each sub-step adds its cases until the list is the whole suite.
const PASSING_LIST: &str = "crates/solace-api-tests/rust-passing.txt";

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
    if !status.success() {
        bail!("cargo {} failed", args.join(" "));
    }
    Ok(())
}

/// Runs the suite against the in-process Rust server and compares it with the passing list.
fn suite(mode: &str) -> anyhow::Result<()> {
    println!("+ API suite on Rust ({mode})");
    let root = crate::repo_root();
    let output = Command::new("cargo")
        .current_dir(&root)
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
        .output()
        .context("run the API suite")?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut passed = BTreeSet::new();
    let mut failed = BTreeSet::new();
    for line in stdout.lines() {
        let Some(rest) = line.strip_prefix("test ") else {
            continue;
        };
        if let Some(name) = rest.strip_suffix(" ... ok") {
            passed.insert(name.to_owned());
        } else if let Some(name) = rest.strip_suffix(" ... FAILED") {
            failed.insert(name.to_owned());
        }
    }
    if passed.is_empty() && failed.is_empty() {
        bail!(
            "the API suite did not run (is `cargo xtask test-env up` running?):\n{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    let expected: BTreeSet<String> = std::fs::read_to_string(root.join(PASSING_LIST))?
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with('#'))
        .map(str::to_owned)
        .collect();
    let regressions: Vec<_> = expected
        .iter()
        .filter(|name| !passed.contains(*name))
        .collect();
    let newly_passing: Vec<_> = passed
        .iter()
        .filter(|name| !expected.contains(*name))
        .collect();
    println!(
        "  {} passed, {} failed; {} of {} listed",
        passed.len(),
        failed.len(),
        expected.len() - regressions.len(),
        expected.len()
    );
    for name in &newly_passing {
        println!("  passing but not listed: {name}");
    }
    if !regressions.is_empty() {
        for name in &regressions {
            println!("  listed but not passing: {name}");
        }
        bail!("API suite regressions on Rust ({mode})");
    }
    Ok(())
}
