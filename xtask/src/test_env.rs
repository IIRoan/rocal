//! Local test environment: podman containers, the template database, and the Stalwart provisioning key.

use std::process::Command;
use std::time::Duration;

use anyhow::{Context, bail, ensure};
use solace_api_tests::env::{
    LOCAL_POSTGRES_PASSWORD, LOCAL_POSTGRES_PORT, LOCAL_POSTGRES_USER,
    LOCAL_STALWART_ADMIN_PASSWORD, LOCAL_STALWART_NOREPLY_PASSWORD, LOCAL_STALWART_PORT,
    LOCAL_STALWART_PROVISIONER_PASSWORD, TEMPLATE_DATABASE, TestEnv,
};
use solace_api_tests::stalwart::{provision_key, url_host_port};
use sqlx::{Connection, Executor, PgConnection};

const POSTGRES_CONTAINER: &str = "solace-test-pg";
const POSTGRES_IMAGE: &str = "docker.io/library/postgres:18";
const STALWART_CONTAINER: &str = "solace-test-stalwart";
const STALWART_IMAGE: &str = "localhost/solace-test-stalwart";

pub async fn run(args: &[&str]) -> anyhow::Result<()> {
    match args {
        ["up"] => up().await,
        ["down"] => down(),
        ["template"] => template(&TestEnv::from_env()?).await,
        ["clone", name] => clone_template(&TestEnv::from_env()?, name).await,
        ["seed", api, database] => seed(&TestEnv::from_env()?, api, database).await,
        ["stalwart-key"] => {
            let key = provision_key(&TestEnv::from_env()?).await?;
            println!("{key}");
            Ok(())
        }
        _ => bail!("unknown test-env task: {}", args.join(" ")),
    }
}

async fn up() -> anyhow::Result<()> {
    if !container_running(POSTGRES_CONTAINER)? {
        podman(&[
            "run",
            "-d",
            "--replace",
            "--name",
            POSTGRES_CONTAINER,
            "-p",
            &format!("127.0.0.1:{LOCAL_POSTGRES_PORT}:5432"),
            "-e",
            &format!("POSTGRES_USER={LOCAL_POSTGRES_USER}"),
            "-e",
            &format!("POSTGRES_PASSWORD={LOCAL_POSTGRES_PASSWORD}"),
            "-e",
            "POSTGRES_DB=solace_test",
            POSTGRES_IMAGE,
            "-c",
            "max_connections=300",
        ])?;
    }
    if !container_running(STALWART_CONTAINER)? {
        let context = crate::repo_root().join("apps/stalwart");
        let context = context.to_string_lossy();
        podman(&[
            "build",
            "-q",
            "-t",
            STALWART_IMAGE,
            "-f",
            "test-env/Dockerfile",
            &context,
        ])?;
        podman(&[
            "run",
            "-d",
            "--replace",
            "--name",
            STALWART_CONTAINER,
            "-p",
            &format!("127.0.0.1:{LOCAL_STALWART_PORT}:8080"),
            "-e",
            &format!("SOLACE_TEST_ADMIN_PASSWORD={LOCAL_STALWART_ADMIN_PASSWORD}"),
            "-e",
            &format!("SOLACE_TEST_PROVISIONER_PASSWORD={LOCAL_STALWART_PROVISIONER_PASSWORD}"),
            "-e",
            &format!("SOLACE_TEST_NOREPLY_PASSWORD={LOCAL_STALWART_NOREPLY_PASSWORD}"),
            STALWART_IMAGE,
        ])?;
    }
    let env = TestEnv::from_env()?;
    wait_for_postgres(&env).await?;
    wait_for_stalwart(&env).await?;
    println!(
        "test env up: postgres {}, stalwart {}",
        env.database_url, env.stalwart_url
    );
    Ok(())
}

fn down() -> anyhow::Result<()> {
    podman(&["rm", "-f", POSTGRES_CONTAINER, STALWART_CONTAINER])
}

/// Applies every Prisma migration in order to a fresh template database.
async fn template(env: &TestEnv) -> anyhow::Result<()> {
    let mut admin = PgConnection::connect(&env.database_url).await?;
    recreate_database(&mut admin, TEMPLATE_DATABASE, None).await?;
    let mut db = PgConnection::connect(&env.database_url_for(TEMPLATE_DATABASE)?).await?;
    let applied = apply_migrations(&mut db).await?;
    println!("{TEMPLATE_DATABASE}: {applied} migrations applied");
    Ok(())
}

/// A fresh database copied from the template; replaces any database of that name.
async fn clone_template(env: &TestEnv, name: &str) -> anyhow::Result<()> {
    env.database_url_for(name)?;
    ensure!(
        name.chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_'),
        "database names are lowercase letters, digits and underscores"
    );
    let mut admin = PgConnection::connect(&env.database_url).await?;
    recreate_database(&mut admin, name, Some(TEMPLATE_DATABASE)).await?;
    println!("{name}: cloned from {TEMPLATE_DATABASE}");
    Ok(())
}

/// Drops `name` and creates it again, empty or as a copy of `template`.
pub async fn recreate_database(
    admin: &mut PgConnection,
    name: &str,
    template: Option<&str>,
) -> anyhow::Result<()> {
    admin
        .execute(format!("DROP DATABASE IF EXISTS {name} WITH (FORCE)").as_str())
        .await?;
    let from = template.map_or(String::new(), |template| format!(" TEMPLATE {template}"));
    admin
        .execute(format!("CREATE DATABASE {name}{from}").as_str())
        .await?;
    Ok(())
}

/// Seeds `database` through the backend at `api`, then writes a manifest of the seeded users.
async fn seed(env: &TestEnv, api: &str, database: &str) -> anyhow::Result<()> {
    solace_api_tests::guard::check_service_url("api", api)?;
    let database_url = env.database_url_for(database)?;
    let fixtures_dir = crate::repo_root().join("crates/solace-api-tests/fixtures");
    let manifest = solace_api_tests::seed::seed(&solace_api_tests::seed::SeedConfig {
        api_base_url: api,
        origin: "http://localhost:4100",
        database_url: &database_url,
        mail_domain: &env.mail_domain,
        fixtures_dir: &fixtures_dir,
    })
    .await?;
    let path = seed_manifest_path(env, database);
    std::fs::create_dir_all(path.parent().context("manifest dir")?)?;
    std::fs::write(&path, serde_json::to_vec_pretty(&manifest)?)?;
    println!(
        "{database}: seeded {} users; manifest {}",
        manifest.users.len(),
        path.display()
    );
    Ok(())
}

/// Per database server, so local and Railway seeds of the same database name do not overwrite each other.
pub fn seed_manifest_path(env: &TestEnv, database: &str) -> std::path::PathBuf {
    let server = url_host_port(
        &env.database_url
            .replace("postgresql://", "x://")
            .replace("postgres://", "x://"),
    );
    let server = server.rsplit('@').next().unwrap_or_default().to_owned();
    crate::repo_root().join(format!(
        "target/solace-test-env/seed-{server}-{database}.json"
    ))
}

/// Runs `apps/backend/prisma/migrations/*/migration.sql` in name order, as `prisma migrate deploy` does.
pub async fn apply_migrations(db: &mut PgConnection) -> anyhow::Result<usize> {
    let dir = crate::repo_root().join("apps/backend/prisma/migrations");
    let mut migrations: Vec<_> = std::fs::read_dir(&dir)?
        .filter_map(Result::ok)
        .map(|entry| entry.path().join("migration.sql"))
        .filter(|path| path.is_file())
        .collect();
    migrations.sort();
    for path in &migrations {
        let sql = std::fs::read_to_string(path)?;
        sqlx::raw_sql(&sql)
            .execute(&mut *db)
            .await
            .with_context(|| format!("migration {}", path.display()))?;
    }
    Ok(migrations.len())
}

async fn wait_for_postgres(env: &TestEnv) -> anyhow::Result<()> {
    for _ in 0..60 {
        if PgConnection::connect(&env.database_url).await.is_ok() {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    bail!("postgres did not come up")
}

async fn wait_for_stalwart(env: &TestEnv) -> anyhow::Result<()> {
    let client = reqwest::Client::new();
    for _ in 0..90 {
        let session = client
            .get(format!("{}/jmap/session", env.stalwart_url))
            .basic_auth(
                format!("solace-provisioner@{}", env.mail_domain),
                Some(&env.stalwart_provisioner_password),
            )
            .send()
            .await;
        if session.is_ok_and(|response| response.status().is_success()) {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    bail!("test stalwart did not come up (plan applied?)")
}

fn container_running(name: &str) -> anyhow::Result<bool> {
    let output = Command::new("podman")
        .args(["container", "inspect", "-f", "{{.State.Running}}", name])
        .output()?;
    Ok(output.status.success() && String::from_utf8_lossy(&output.stdout).trim() == "true")
}

fn podman(args: &[&str]) -> anyhow::Result<()> {
    let status = Command::new("podman").args(args).status()?;
    ensure!(
        status.success(),
        "podman {} failed",
        args.first().copied().unwrap_or_default()
    );
    Ok(())
}
