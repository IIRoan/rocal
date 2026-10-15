//! Runs the current TypeScript backend against the test environment from a separate checkout with no `.env` files.

use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{Context, bail};
use solace_api_tests::env::{BackendTarget, TestEnv};
use solace_api_tests::guard;

pub async fn run(args: &[&str]) -> anyhow::Result<()> {
    let mut checkout = None;
    let mut database = "solace_test_seed".to_owned();
    let mut port = "4101".to_owned();
    let mut production = false;
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        if *arg == "--production" {
            production = true;
            continue;
        }
        let value = iter
            .next()
            .with_context(|| format!("{arg} needs a value"))?;
        match *arg {
            "--checkout" => checkout = Some(PathBuf::from(value)),
            "--database" => database = (*value).to_owned(),
            "--port" => port = (*value).to_owned(),
            _ => bail!("unknown option {arg}"),
        }
    }
    let checkout =
        checkout.context("--checkout <dir> is required: a git worktree without .env files")?;
    refuse_env_files(&checkout)?;

    let env = TestEnv::from_env()?;
    let database_url = env.database_url_for(&database)?;
    let provision_token = solace_api_tests::stalwart::provision_key(&env).await?;
    let port_number: u16 = port.parse().context("--port must be a number")?;
    let vars = env.backend_vars(&BackendTarget {
        port: port_number,
        production,
        database_url: &database_url,
        stalwart_provision_token: &provision_token,
    });
    for (name, value) in &vars {
        if name.ends_with("_URL") && !value.is_empty() && *name != "DATABASE_URL" {
            guard::check_service_url(name, value)?;
        }
    }
    let backend_url = vars
        .iter()
        .find(|(name, _)| *name == "BACKEND_URL")
        .map(|(_, value)| value.clone())
        .unwrap_or_default();

    let backend_dir = checkout.join("apps/backend");
    let mut command = Command::new(which_bun()?);
    command
        .current_dir(&backend_dir)
        .env_clear()
        .env("PATH", std::env::var("PATH").unwrap_or_default())
        .env("HOME", std::env::var("HOME").unwrap_or_default())
        // Vercel runs the backend in UTC, and JavaScript dates parse and format in the process zone.
        .env("TZ", "UTC")
        .envs(vars)
        .args(["--no-env-file", "serve.ts"]);
    println!(
        "starting TypeScript backend at {backend_url} ({})",
        backend_dir.display()
    );
    let status = command.status()?;
    if !status.success() {
        bail!("backend exited with {status}");
    }
    Ok(())
}

/// Prisma and Bun auto-load `.env` files; this checkout must not have any.
fn refuse_env_files(checkout: &Path) -> anyhow::Result<()> {
    for dir in [
        checkout.to_path_buf(),
        checkout.join("apps/backend"),
        checkout.join("apps/backend/prisma"),
    ] {
        for entry in std::fs::read_dir(&dir).with_context(|| format!("{}", dir.display()))? {
            let name = entry?.file_name();
            let name = name.to_string_lossy();
            if name.starts_with(".env") && !name.ends_with(".example") {
                bail!(
                    "{} contains {name}; use a checkout without .env files",
                    dir.display()
                );
            }
        }
    }
    Ok(())
}

fn which_bun() -> anyhow::Result<PathBuf> {
    let path = std::env::var("PATH").unwrap_or_default();
    std::env::split_paths(&path)
        .map(|dir| dir.join("bun"))
        .find(|candidate| candidate.is_file())
        .context("bun not found on PATH")
}
