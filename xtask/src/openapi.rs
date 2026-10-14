//! Writes `packages/api-contracts/openapi.json` from the server's routes (no database) and regenerates the TypeScript types.

use std::process::Command;

use anyhow::{Context, bail};

pub fn run(args: &[&str]) -> anyhow::Result<()> {
    let check = match args {
        [] => false,
        ["--check"] => true,
        _ => bail!("usage: cargo xtask openapi [--check]"),
    };
    let root = crate::repo_root();
    let package = root.join("packages/api-contracts");
    let json = solace_server::openapi().to_pretty_json()?;
    std::fs::write(package.join("openapi.json"), format!("{json}\n"))?;
    // `--no-env-file`: nothing here may pick up a checkout's `.env` files.
    let status = Command::new("bun")
        .args(["--no-env-file", "run", "--cwd"])
        .arg(&package)
        .arg("generate")
        .status()
        .context("bun")?;
    if !status.success() {
        bail!("openapi-typescript failed");
    }
    if check {
        let diff = Command::new("git")
            .current_dir(&root)
            .args([
                "diff",
                "--exit-code",
                "--stat",
                "--",
                "packages/api-contracts",
            ])
            .status()?;
        if !diff.success() {
            bail!(
                "packages/api-contracts is stale; run `cargo xtask openapi` and commit the result"
            );
        }
        println!("packages/api-contracts matches the server's routes");
    }
    Ok(())
}
