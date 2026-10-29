//! `cargo xtask migrate`: scaffold a migration, or read and apply the migrations of a test database.

use anyhow::{Context, bail, ensure};
use sea_orm_migration::MigratorTrait;
use solace_api_tests::env::{TEMPLATE_DATABASE, TestEnv};
use solace_server::db::Migrator;

const DIR: &str = "apps/backend/src/db/migrations";
const LIST: &str = "apps/backend/src/db/migrations.rs";

pub async fn run(args: &[&str]) -> anyhow::Result<()> {
    match args {
        ["new", name] => new(name),
        ["status"] => status(TEMPLATE_DATABASE).await,
        ["status", database] => status(database).await,
        ["up"] => up(TEMPLATE_DATABASE).await,
        ["up", database] => up(database).await,
        _ => bail!("usage: cargo xtask migrate new <name> | status [<database>] | up [<database>]"),
    }
}

fn new(name: &str) -> anyhow::Result<()> {
    ensure!(
        name.starts_with(|c: char| c.is_ascii_lowercase())
            && name
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_'),
        "migration names are snake_case, like add_event_colour"
    );
    let module = format!(
        "m{}_{name}",
        jiff::Timestamp::now().strftime("%Y%m%d_%H%M%S")
    );
    let root = crate::repo_root();
    let path = root.join(DIR).join(format!("{module}.rs"));
    ensure!(!path.exists(), "{} already exists", path.display());
    std::fs::write(&path, template(&module))?;

    let list_path = root.join(LIST);
    let list = std::fs::read_to_string(&list_path)?;
    let list = insert_after_last(&list, "\nmod m", &format!("mod {module};"))?;
    let list = insert_after_last(
        &list,
        "\n            Box::new(m",
        &format!("            Box::new({module}::Migration),"),
    )?;
    std::fs::write(&list_path, list)?;
    println!(
        "added {}; write its `up`, then run `cargo xtask migrate up` and `cargo xtask entities`",
        path.display()
    );
    Ok(())
}

fn template(module: &str) -> String {
    format!(
        r#"use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {{
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {{
        // Schema changes go through `manager` (see m20261030_120000_encrypted_settings_preferences.rs).
        let _ = manager;
        Err(DbErr::Migration("{module} is not written yet".into()))
    }}
}}
"#
    )
}

/// Puts `line` on its own line after the last line that starts with `marker`.
fn insert_after_last(text: &str, marker: &str, line: &str) -> anyhow::Result<String> {
    let start = text
        .rfind(marker)
        .with_context(|| format!("{LIST} has no line starting with {:?}", marker.trim()))?
        + 1;
    let end = text[start..]
        .find('\n')
        .map_or(text.len(), |offset| start + offset + 1);
    Ok(format!("{}{line}\n{}", &text[..end], &text[end..]))
}

async fn connect(database: &str) -> anyhow::Result<sea_orm_migration::sea_orm::DatabaseConnection> {
    let url = TestEnv::from_env()?.database_url_for(database)?;
    // One connection holds the migration lock while the other applies them.
    Ok(solace_server::db::connect(&url, 2).await?)
}

async fn status(database: &str) -> anyhow::Result<()> {
    let db = connect(database).await?;
    for migration in Migrator::get_migration_with_status(&db).await? {
        println!("{:<8} {}", migration.status().to_string(), migration.name());
    }
    db.close().await?;
    Ok(())
}

async fn up(database: &str) -> anyhow::Result<()> {
    let db = connect(database).await?;
    solace_server::db::migrate(&db).await?;
    db.close().await?;
    println!("{database}: migrations applied");
    Ok(())
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]

    use super::{DIR, LIST, insert_after_last};

    /// A migration file left out of the list would never compile, let alone run.
    #[test]
    fn every_migration_file_is_registered_and_runs() {
        let root = crate::repo_root();
        let list = std::fs::read_to_string(root.join(LIST)).unwrap();
        for entry in std::fs::read_dir(root.join(DIR)).unwrap() {
            let name = entry.unwrap().file_name().into_string().unwrap();
            let Some(module) = name.strip_suffix(".rs") else {
                continue;
            };
            assert!(
                list.contains(&format!("\nmod {module};")),
                "{module} is not declared in {LIST}"
            );
            assert!(
                list.contains(&format!("Box::new({module}::Migration)")),
                "{module} is not in Migrator::migrations"
            );
        }
    }

    #[test]
    fn a_new_migration_is_registered_after_the_last_one() {
        let list = "mod ma;\nmod mb;\n\nfn f() {\n    vec![\n            Box::new(ma::Migration),\n            Box::new(mb::Migration),\n        ]\n}\n";
        let list = insert_after_last(list, "\nmod m", "mod mc;").unwrap();
        let list = insert_after_last(
            &list,
            "\n            Box::new(m",
            "            Box::new(mc::Migration),",
        )
        .unwrap();
        assert_eq!(
            list,
            "mod ma;\nmod mb;\nmod mc;\n\nfn f() {\n    vec![\n            Box::new(ma::Migration),\n            Box::new(mb::Migration),\n            Box::new(mc::Migration),\n        ]\n}\n"
        );
    }
}
