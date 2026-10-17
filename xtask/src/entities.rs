//! Regenerates `apps/backend/src/db/entities` with sea-orm-cli from a throwaway database built from the 53 migrations.

use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{Context, bail, ensure};
use solace_api_tests::env::TestEnv;
use sqlx::{Connection, Executor, PgConnection};

const DATABASE: &str = "solace_test_entities";

pub async fn run(args: &[&str]) -> anyhow::Result<()> {
    let check = match args {
        [] => false,
        ["--check"] => true,
        _ => bail!("usage: cargo xtask entities [--check]"),
    };
    let env = TestEnv::from_env()?;
    let url = env.database_url_for(DATABASE)?;
    let mut admin = PgConnection::connect(&env.database_url).await?;
    crate::test_env::recreate_database(&mut admin, DATABASE, None).await?;
    let mut db = PgConnection::connect(&url).await?;
    crate::test_env::apply_migrations(&mut db).await?;
    db.close().await?;

    let root = crate::repo_root();
    let out = root.join("target/solace-entities");
    if out.exists() {
        std::fs::remove_dir_all(&out)?;
    }
    let generated = out.join("entities");
    let status = Command::new(sea_orm_cli()?)
        .args(["generate", "entity", "--database-url", &url, "--output-dir"])
        .arg(&generated)
        .args([
            "--date-time-crate",
            "time",
            "--with-prelude",
            "all",
            "--impl-active-model-behavior=false",
            "--banner-version",
            "off",
            "--ignore-tables",
            "_prisma_migrations",
        ])
        .status()?;
    ensure!(status.success(), "sea-orm-cli failed");
    admin
        .execute(format!("DROP DATABASE IF EXISTS {DATABASE} WITH (FORCE)").as_str())
        .await?;
    // The repo uses `name.rs` beside `name/`, never `mod.rs`.
    std::fs::rename(generated.join("mod.rs"), out.join("entities.rs"))?;
    format(&out)?;

    let committed = root.join("apps/backend/src/db");
    if check {
        let differences = diff(&out.join("entities.rs"), &committed.join("entities.rs"))?
            + diff_dir(&generated, &committed.join("entities"))?;
        ensure!(
            differences == 0,
            "db/entities differs from the migrations; run `cargo xtask entities`"
        );
        println!("db/entities matches the migrations");
        return Ok(());
    }
    let target = committed.join("entities");
    if target.exists() {
        std::fs::remove_dir_all(&target)?;
    }
    std::fs::create_dir_all(&committed)?;
    copy_dir(&generated, &target)?;
    std::fs::copy(out.join("entities.rs"), committed.join("entities.rs"))?;
    println!("regenerated {}", target.display());
    Ok(())
}

fn sea_orm_cli() -> anyhow::Result<PathBuf> {
    if let Ok(path) = std::env::var("SEA_ORM_CLI") {
        return Ok(PathBuf::from(path));
    }
    let home = std::env::var("HOME").context("HOME")?;
    let local = PathBuf::from(home).join(".local/share/solace-test-tools/cargo/bin/sea-orm-cli");
    if local.is_file() {
        return Ok(local);
    }
    Ok(PathBuf::from("sea-orm-cli"))
}

fn format(dir: &Path) -> anyhow::Result<()> {
    let mut files = vec![dir.join("entities.rs")];
    for entry in std::fs::read_dir(dir.join("entities"))? {
        files.push(entry?.path());
    }
    let status = Command::new("rustfmt")
        .args(["--edition", "2024"])
        .args(&files)
        .status()?;
    ensure!(status.success(), "rustfmt failed on the generated entities");
    Ok(())
}

fn diff(generated: &Path, committed: &Path) -> anyhow::Result<usize> {
    let same = std::fs::read(generated)? == std::fs::read(committed).unwrap_or_default();
    if !same {
        println!("differs: {}", committed.display());
    }
    Ok(usize::from(!same))
}

fn diff_dir(generated: &Path, committed: &Path) -> anyhow::Result<usize> {
    let mut differences = 0;
    let names = |dir: &Path| -> anyhow::Result<Vec<String>> {
        let mut names: Vec<String> = match std::fs::read_dir(dir) {
            Ok(entries) => entries
                .filter_map(Result::ok)
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .collect(),
            Err(_) => Vec::new(),
        };
        names.sort();
        Ok(names)
    };
    let (ours, theirs) = (names(generated)?, names(committed)?);
    for name in theirs.iter().filter(|name| !ours.contains(name)) {
        println!("stale: {}", committed.join(name).display());
        differences += 1;
    }
    for name in &ours {
        differences += diff(&generated.join(name), &committed.join(name))?;
    }
    Ok(differences)
}

fn copy_dir(from: &Path, to: &Path) -> anyhow::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        std::fs::copy(entry.path(), to.join(entry.file_name()))?;
    }
    Ok(())
}
