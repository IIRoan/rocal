//! Runs the current TypeScript backend against the test environment from a separate checkout with no `.env` files.

use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{Context, bail};
use solace_api_tests::env::TestEnv;
use solace_api_tests::guard;

pub async fn run(args: &[&str]) -> anyhow::Result<()> {
    let mut checkout = None;
    let mut database = "solace_test_seed".to_owned();
    let mut port = "4101".to_owned();
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
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
    let provision_token = crate::test_env::provision_key(&env).await?;
    let backend_url = format!("http://localhost:{port}");
    guard::check_service_url("BACKEND_URL", &backend_url)?;

    let vars = [
        ("NODE_ENV", "development".to_owned()),
        ("PORT", port.clone()),
        ("BACKEND_URL", backend_url.clone()),
        ("FRONTEND_URL", "http://localhost:4100".to_owned()),
        ("PASSKEY_ORIGIN", "http://localhost:4100".to_owned()),
        ("DATABASE_URL", database_url),
        ("BETTER_AUTH_SECRET", env.better_auth_secret.clone()),
        ("MAIL_BRIDGE_HMAC_KEY", env.mail_bridge_hmac_key.clone()),
        (
            "STALWART_WEBHOOK_SECRET",
            env.stalwart_webhook_secret.clone(),
        ),
        // Every STALWART_* variable is set: the backend otherwise falls back to production Stalwart.
        ("STALWART_BASE_URL", env.stalwart_url.clone()),
        ("STALWART_JMAP_URL", env.stalwart_url.clone()),
        ("STALWART_DEFAULT_DOMAIN", env.mail_domain.clone()),
        ("STALWART_PROVISION_TOKEN", provision_token),
        ("STALWART_ADMIN_TOKEN", String::new()),
        (
            "STALWART_GATE_KEY",
            env.stalwart_gate_key.clone().unwrap_or_default(),
        ),
        (
            "STALWART_JMAP_USERNAME",
            format!("noreply@{}", env.mail_domain),
        ),
        (
            "STALWART_JMAP_PASSWORD",
            env.stalwart_noreply_password.clone(),
        ),
        (
            "STALWART_WEBHOOK_URL",
            format!("http://host.containers.internal:{port}/api/internal/stalwart/webhook"),
        ),
        ("EMAIL_FROM", format!("noreply@{}", env.mail_domain)),
        ("EMAIL_FROM_NAME", "Solace Test".to_owned()),
    ];
    for (name, value) in &vars {
        if name.ends_with("_URL") && !value.is_empty() && *name != "DATABASE_URL" {
            guard::check_service_url(name, value)?;
        }
    }

    let backend_dir = checkout.join("apps/backend");
    let mut command = Command::new(which_bun()?);
    command
        .current_dir(&backend_dir)
        .env_clear()
        .env("PATH", std::env::var("PATH").unwrap_or_default())
        .env("HOME", std::env::var("HOME").unwrap_or_default())
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
