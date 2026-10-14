//! Deploys committed files only (`git archive HEAD`) to a service in the Railway `test` environment.

use std::process::Command;

use anyhow::{Context, bail};

/// The only Railway environment this task deploys to.
const TEST_ENVIRONMENT: &str = "test";

pub fn run(args: &[&str]) -> anyhow::Result<()> {
    let [service, path] = args else {
        bail!("usage: cargo xtask deploy-test <service> <path>");
    };
    if !service.starts_with("test-") {
        bail!("test services are named test-*; refusing {service}");
    }
    let root = crate::repo_root();
    // Outside the repository, so its .gitignore (which lists target/) cannot hide the upload.
    let stage = std::env::temp_dir()
        .join("solace-railway-stage")
        .join(service);
    if stage.exists() {
        std::fs::remove_dir_all(&stage)?;
    }
    std::fs::create_dir_all(&stage)?;

    // Untracked and ignored files (.env, local credentials) never leave the machine.
    let archive = Command::new("git")
        .current_dir(&root)
        .args(["archive", "--format=tar", "HEAD", path])
        .output()?;
    if !archive.status.success() {
        bail!(
            "git archive failed: {}",
            String::from_utf8_lossy(&archive.stderr)
        );
    }
    let mut tar = Command::new("tar")
        .current_dir(&stage)
        .args(["-x", "-f", "-"])
        .stdin(std::process::Stdio::piped())
        .spawn()?;
    std::io::Write::write_all(tar.stdin.as_mut().context("tar stdin")?, &archive.stdout)?;
    if !tar.wait()?.success() {
        bail!("tar failed");
    }

    let upload = stage.join(path);
    let status = Command::new("railway")
        .current_dir(&root)
        .arg("up")
        .arg(&upload)
        .args([
            "--path-as-root",
            "--service",
            service,
            "--environment",
            TEST_ENVIRONMENT,
            "--ci",
        ])
        .status()?;
    if !status.success() {
        bail!("railway up failed");
    }
    Ok(())
}
