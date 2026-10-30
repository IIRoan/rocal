//! `cargo xtask dev`: the API and the worker on the local test services, with a database of their own that outlives restarts.

use std::process::Command;
use std::time::Duration;

use anyhow::{Context, bail};
use serde_json::json;
use solace_api_tests::client::{Agent, ClientKind};
use solace_api_tests::env::{BackendTarget, TestEnv};
use solace_api_tests::seed::{hex, insert_invite};
use sqlx::{Connection, Executor, PgConnection};

const DATABASE: &str = "solace_test_dev";
const API_PORT: u16 = 4001;
const WORKER_PORT: u16 = 4002;
/// Local values that differ, such as a tunnel's URLs; gitignored.
const OVERRIDES: &str = "apps/backend/.env";
const DEMO_HANDLE: &str = "demo";
/// What the demo account signs in with; it only ever exists in the local dev database.
const DEMO_SIGN_IN_PHRASE: &str = "solace-demo-1234";
const INVITER_ID: &str = "devinviter";

pub async fn run(args: &[&str]) -> anyhow::Result<()> {
    match args {
        ["backend"] => {
            crate::test_env::up().await?;
            let env = TestEnv::from_env()?;
            create_database(&env).await?;
            serve(&env, "solace-server", API_PORT).await
        }
        ["notifications"] => {
            let env = TestEnv::from_env()?;
            wait_for_database(&env).await?;
            serve(&env, "solace-notifications", WORKER_PORT).await
        }
        ["demo"] => demo().await,
        ["outdate"] => outdate().await,
        _ => bail!("usage: cargo xtask dev backend | notifications | demo | outdate"),
    }
}

async fn create_database(env: &TestEnv) -> anyhow::Result<()> {
    let mut admin = PgConnection::connect(&env.database_url).await?;
    let exists: Option<i32> = sqlx::query_scalar("SELECT 1 FROM pg_database WHERE datname = $1")
        .bind(DATABASE)
        .fetch_optional(&mut admin)
        .await?;
    if exists.is_none() {
        admin
            .execute(format!("CREATE DATABASE {DATABASE}").as_str())
            .await?;
        println!("created {DATABASE}; the API migrates it as it starts");
    }
    Ok(())
}

/// The worker starts beside the API, which creates the database.
async fn wait_for_database(env: &TestEnv) -> anyhow::Result<()> {
    let url = env.database_url_for(DATABASE)?;
    for _ in 0..120 {
        if PgConnection::connect(&url).await.is_ok() {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    bail!("{DATABASE} did not appear; start `cargo xtask dev backend` first")
}

async fn serve(env: &TestEnv, package: &str, port: u16) -> anyhow::Result<()> {
    // The local Postgres has no TLS, and the worker insists on it unless the URL says otherwise.
    let database_url = format!("{}?sslmode=disable", env.database_url_for(DATABASE)?);
    let provision_key = solace_api_tests::stalwart::provision_key(env).await?;
    let mut vars: Vec<(String, String)> = env
        .backend_vars(&BackendTarget {
            port: API_PORT,
            production: false,
            database_url: &database_url,
            stalwart_provision_token: &provision_key,
        })
        .into_iter()
        .map(|(name, value)| (name.to_owned(), value))
        .collect();
    vars.push(("PORT".into(), port.to_string()));
    let overrides = crate::repo_root().join(OVERRIDES);
    if overrides.is_file() {
        for entry in
            dotenvy::from_path_iter(&overrides).with_context(|| format!("read {OVERRIDES}"))?
        {
            vars.push(entry.with_context(|| format!("parse {OVERRIDES}"))?);
        }
    }
    let status = Command::new("cargo")
        .args(["run", "-p", package])
        .current_dir(crate::repo_root())
        .envs(vars)
        .status()?;
    if !status.success() {
        bail!("{package} exited with {status}");
    }
    Ok(())
}

async fn dev_database(env: &TestEnv) -> anyhow::Result<PgConnection> {
    PgConnection::connect(&env.database_url_for(DATABASE)?)
        .await
        .context("connect to the dev database (run `bun run dev:backend` first)")
}

/// Signs the demo account up through the running dev API, as an accepted invite does; its keys are made by the first sign-in.
async fn demo() -> anyhow::Result<()> {
    let env = TestEnv::from_env()?;
    let email = format!("{DEMO_HANDLE}@{}", env.mail_domain);
    let mut db = dev_database(&env).await?;
    let exists: Option<String> = sqlx::query_scalar("SELECT id FROM \"user\" WHERE email = $1")
        .bind(&email)
        .fetch_optional(&mut db)
        .await?;
    if exists.is_none() {
        sqlx::query(
            "INSERT INTO \"user\" (id, name, email, email_verified, created_at, updated_at) \
             VALUES ($1, 'Solace Dev', 'inviter@example.com', true, now(), now()) ON CONFLICT DO NOTHING",
        )
        .bind(INVITER_ID)
        .execute(&mut db)
        .await?;
        let token = hex(32);
        insert_invite(
            &mut db,
            &format!("devinvite{}", hex(8)),
            &token,
            INVITER_ID,
            "demo@example.com",
        )
        .await?;
        let api = format!("http://localhost:{API_PORT}");
        let mut agent = Agent::new(&api, "http://localhost:4000", ClientKind::Browser)?;
        agent
            .post(
                "/api/account/invite/claim",
                json!({"token": token, "chosenEmail": email}),
            )
            .await?
            .expect_status(200)?;
        agent
            .post(
                "/api/auth/sign-up/email",
                json!({"email": email, "password": DEMO_SIGN_IN_PHRASE, "name": "Demo"}),
            )
            .await?
            .expect_status(200)?;
        println!("created the demo account");
    }
    println!("sign in as {email} with {DEMO_SIGN_IN_PHRASE}");
    Ok(())
}

/// Rewrites the demo account's data as apps from before 2026-10-30 left it, for the next sign-in to upgrade.
async fn outdate() -> anyhow::Result<()> {
    let env = TestEnv::from_env()?;
    let email = format!("{DEMO_HANDLE}@{}", env.mail_domain);
    let mut db = dev_database(&env).await?;
    let user: String = sqlx::query_scalar("SELECT id FROM \"user\" WHERE email = $1")
        .bind(&email)
        .fetch_optional(&mut db)
        .await?
        .context("no demo account; run `cargo xtask dev demo`")?;
    let events = sqlx::query(
        "UPDATE calendar_event e SET color = c.color FROM calendar c \
         WHERE e.calendar_id = c.id AND e.user_id = $1 AND e.encryption_state = 'encrypted' \
         AND coalesce(e.encrypted_content, '') <> '' AND e.subscription_id IS NULL",
    )
    .bind(&user)
    .execute(&mut db)
    .await?
    .rows_affected();
    let reminders = sqlx::query(
        "UPDATE event_notification n SET encrypted_lead = NULL, encrypted_display_title = NULL \
         FROM calendar_event e WHERE n.event_id = e.id AND e.user_id = $1 AND NOT n.is_sent",
    )
    .bind(&user)
    .execute(&mut db)
    .await?
    .rows_affected();
    let settings =
        sqlx::query("UPDATE user_settings SET encrypted_preferences = NULL WHERE user_id = $1")
            .bind(&user)
            .execute(&mut db)
            .await?
            .rows_affected();
    println!(
        "{email}: {events} events with a readable colour, {reminders} reminders without a sealed title or lead, {settings} unsealed settings row; the next sign-in re-seals them"
    );
    Ok(())
}
