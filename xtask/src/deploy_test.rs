//! Deploys committed files only (`git archive HEAD`) to a service in the Railway `test` environment; several paths upload from the repository root.

use std::process::Command;

use anyhow::{Context, bail, ensure};

/// The only Railway environment this task deploys to.
const TEST_ENVIRONMENT: &str = "test";

pub fn run(args: &[&str]) -> anyhow::Result<()> {
    let [service, paths @ ..] = args else {
        bail!("usage: cargo xtask deploy-test <service> <path>...");
    };
    ensure!(
        !paths.is_empty(),
        "usage: cargo xtask deploy-test <service> <path>..."
    );
    ensure!(
        service.starts_with("test-"),
        "test services are named test-*; refusing {service}"
    );
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
        .args(["archive", "--format=tar", "HEAD"])
        .args(paths)
        .output()?;
    ensure!(
        archive.status.success(),
        "git archive failed: {}",
        String::from_utf8_lossy(&archive.stderr)
    );
    let mut tar = Command::new("tar")
        .current_dir(&stage)
        .args(["-x", "-f", "-"])
        .stdin(std::process::Stdio::piped())
        .spawn()?;
    std::io::Write::write_all(tar.stdin.as_mut().context("tar stdin")?, &archive.stdout)?;
    ensure!(tar.wait()?.success(), "tar failed");

    let upload = match paths {
        [path] => stage.join(path),
        _ => stage.clone(),
    };
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
    ensure!(status.success(), "railway up failed");
    Ok(())
}
