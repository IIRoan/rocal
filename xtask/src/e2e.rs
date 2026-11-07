//! A disposable backend for real native UI journeys; clients create their own encryption keys and content.

use std::collections::HashMap;

use anyhow::ensure;
use serde_json::json;
use solace_api_tests::client::{Agent, ClientKind};
use solace_api_tests::env::{BackendTarget, DEVELOPMENT_FRONTEND_URL, TestEnv};
use solace_api_tests::seed::{hex, insert_invite};
use solace_server::{config::Config, state::AppState};
use sqlx::{Connection, Executor, PgConnection};

const DATABASE: &str = "solace_test_e2e";
const PORT: u16 = 4001;
const EMAIL: &str = "journey@solace.test";
const PASSWORD: &str = "solace-test-ui-password";
const PEER_EMAIL: &str = "correspondent@solace.test";
const PEER_PASSWORD: &str = "solace-test-peer-password";

pub async fn run(args: &[&str]) -> anyhow::Result<()> {
    let env = TestEnv::from_env()?;
    for url in [
        &env.database_url,
        &env.stalwart_url,
        &env.avatar_bucket.endpoint,
    ] {
        ensure!(is_loopback(url), "E2E services must all use loopback hosts");
    }
    ensure!(
        env.mail_domain == "solace.test",
        "E2E requires the isolated solace.test mail domain"
    );
    match args {
        ["serve"] => serve(&env).await,
        ["seed"] => seed(&env).await,
        ["verify"] => verify(&env).await,
        _ => anyhow::bail!("usage: cargo xtask e2e serve | seed | verify"),
    }
}

fn is_loopback(url: &str) -> bool {
    reqwest::Url::parse(url)
        .is_ok_and(|url| matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]")))
}

async fn database(env: &TestEnv) -> anyhow::Result<PgConnection> {
    Ok(PgConnection::connect(&env.database_url_for(DATABASE)?).await?)
}

async fn serve(env: &TestEnv) -> anyhow::Result<()> {
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", PORT)).await?;
    let mut admin = PgConnection::connect(&env.database_url).await?;
    crate::test_env::recreate_database(&mut admin, DATABASE, None).await?;
    let database_url = format!("{}?sslmode=disable", env.database_url_for(DATABASE)?);
    crate::test_env::apply_migrations(&database_url).await?;
    let provision_key = solace_api_tests::stalwart::provision_key(env).await?;
    let vars: HashMap<_, _> = env
        .backend_vars(&BackendTarget {
            port: PORT,
            production: false,
            database_url: &database_url,
            stalwart_provision_token: &provision_key,
        })
        .into_iter()
        .collect();
    let mut config = Config::from_lookup(|name| vars.get(name).cloned())?;
    config.calendar_sync = false;
    let db = solace_server::db::connect(&database_url, 8).await?;
    let state = AppState::new(config, db)?;
    println!("Disposable E2E API ready on loopback port {PORT}");
    solace_server::serve(listener, state, async {
        let _ = tokio::signal::ctrl_c().await;
    })
    .await?;
    Ok(())
}

async fn seed(env: &TestEnv) -> anyhow::Result<()> {
    let mut db = database(env).await?;
    db.execute("INSERT INTO \"user\" (id, name, email, email_verified, created_at, updated_at) VALUES ('e2einviter', 'E2E Inviter', 'inviter@solace.test', true, now(), now())").await?;
    for (email, password, name) in [
        (EMAIL, PASSWORD, "Maestro Journey"),
        (PEER_EMAIL, PEER_PASSWORD, "Maestro Correspondent"),
    ] {
        let token = hex(32);
        insert_invite(
            &mut db,
            &format!("e2e{}", hex(8)),
            &token,
            "e2einviter",
            email,
        )
        .await?;
        let mut agent = Agent::new(
            &format!("http://localhost:{PORT}"),
            DEVELOPMENT_FRONTEND_URL,
            ClientKind::Browser,
        )?;
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
                json!({"email": email, "password": password, "name": name}),
            )
            .await?
            .expect_status(200)?;
    }
    let root = std::path::PathBuf::from(std::env::var("SOLACE_E2E_DIR")?);
    ensure!(
        root.is_absolute() && root.file_name().is_some_and(|name| name == "solace-e2e"),
        "E2E output must be an isolated solace-e2e directory"
    );
    std::fs::create_dir_all(root.join("private"))?;
    std::fs::write(
        root.join("private/fixture.json"),
        serde_json::to_vec(&json!({
            "email": EMAIL,
            "password": PASSWORD,
            "peerEmail": PEER_EMAIL,
            "peerPassword": PEER_PASSWORD,
        }))?,
    )?;
    println!("Created two disposable journey accounts; encryption is initialized by the apps");
    Ok(())
}

async fn verify(env: &TestEnv) -> anyhow::Result<()> {
    let mut db = database(env).await?;
    let user: String = sqlx::query_scalar("SELECT id FROM \"user\" WHERE email = $1")
        .bind(EMAIL)
        .fetch_one(&mut db)
        .await?;
    let calendars: i64 = sqlx::query_scalar("SELECT count(*) FROM calendar WHERE user_id = $1 AND encrypted_name IS NOT NULL AND encryption_state = 'encrypted'").bind(&user).fetch_one(&mut db).await?;
    let events: i64 = sqlx::query_scalar("SELECT count(*) FROM calendar_event WHERE user_id = $1 AND encrypted_content IS NOT NULL AND encryption_state = 'encrypted'").bind(&user).fetch_one(&mut db).await?;
    let readable: i64 = sqlx::query_scalar("SELECT count(*) FROM calendar_event WHERE user_id = $1 AND (title LIKE 'Maestro%' OR coalesce(description, '') LIKE '%Maestro%' OR coalesce(location, '') LIKE '%Maestro%')").bind(&user).fetch_one(&mut db).await?;
    let preferences: Option<String> =
        sqlx::query_scalar("SELECT encrypted_preferences FROM user_settings WHERE user_id = $1")
            .bind(&user)
            .fetch_one(&mut db)
            .await?;
    ensure!(calendars > 0, "UI did not persist encrypted calendars");
    ensure!(events > 0, "UI did not persist encrypted events");
    ensure!(
        readable == 0,
        "UI left readable event content in the database"
    );
    ensure!(preferences.is_some(), "UI did not seal account settings");
    let mail_accounts: i64 = sqlx::query_scalar(
        "SELECT count(DISTINCT u.id) FROM \"user\" u \
         JOIN user_encryption_password p ON p.user_id = u.id \
         JOIN mail_directory_entry d ON d.user_id = u.id \
         JOIN mail_vault_backup v ON v.directory_entry_id = d.id \
         WHERE u.email IN ($1, $2) AND u.mailbox_approved_at IS NOT NULL \
         AND p.wrapped_account_key <> '' AND v.wrapped_secret IS NOT NULL",
    )
    .bind(EMAIL)
    .bind(PEER_EMAIL)
    .fetch_one(&mut db)
    .await?;
    ensure!(
        mail_accounts == 2,
        "UI did not initialize two independently sealed mail accounts"
    );
    println!(
        "E2E postconditions passed: encrypted calendars, events and settings; two sealed mail accounts; no readable journey content"
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::is_loopback;

    #[test]
    fn fixture_services_cannot_point_to_deployments_or_lookalike_hosts() {
        for url in [
            "http://localhost:4001",
            "http://127.0.0.1:58080",
            "postgres://solace_test:solace-test-pg@127.0.0.1:55432/solace_test",
        ] {
            assert!(is_loopback(url));
        }
        for url in [
            "https://api.solace.onl",
            "http://localhost.evil.test:4001",
            "https://service.railway.internal",
            "http://api.solace.test",
            "invalid",
        ] {
            assert!(!is_loopback(url));
        }
    }
}
