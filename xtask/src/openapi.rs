//! Writes `packages/api-contracts/openapi.json` from the server's routes (no database) and regenerates the TypeScript types.

use std::process::Command;

use anyhow::{Context, bail, ensure};

pub fn run(args: &[&str]) -> anyhow::Result<()> {
    let check = match args {
        [] => false,
        ["--check"] => true,
        _ => bail!("usage: cargo xtask openapi [--check]"),
    };
    let root = crate::repo_root();
    let package = root.join("packages/api-contracts");
    let document = solace_server::openapi();
    let mut seen = std::collections::BTreeSet::new();
    for (path, item) in &document.paths.paths {
        let operations = [
            &item.get,
            &item.put,
            &item.post,
            &item.delete,
            &item.options,
            &item.head,
            &item.patch,
            &item.trace,
        ];
        for operation in operations.into_iter().flatten() {
            let id = operation.operation_id.clone().unwrap_or_default();
            // Duplicate ids become duplicate keys in the generated TypeScript `operations`.
            if !seen.insert(id.clone()) {
                bail!(
                    "operation id `{id}` of {path} is not unique; give the route an explicit `operation_id`"
                );
            }
        }
    }
    let json = document.to_pretty_json()?;
    std::fs::write(package.join("openapi.json"), format!("{json}\n"))?;
    // `--no-env-file`: nothing here may pick up a checkout's `.env` files.
    let status = Command::new("bun")
        .args(["--no-env-file", "run", "--cwd"])
        .arg(&package)
        .arg("generate")
        .status()
        .context("bun")?;
    ensure!(status.success(), "openapi-typescript failed");
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
        ensure!(
            diff.success(),
            "packages/api-contracts is stale; run `cargo xtask openapi` and commit the result"
        );
        println!("packages/api-contracts matches the server's routes");
    }
    Ok(())
}
