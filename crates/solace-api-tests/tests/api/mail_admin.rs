//! The Stalwart UI gate requires a live, allowlisted Solace session and its passkey step-up.

use reqwest::{StatusCode, header};
use solace_api_tests::env::BackendTarget;
use solace_server::{config::Config, state::AppState};

use crate::helpers::{TestApp, TestUser};

async fn gate(app: &TestApp, allowed: Vec<String>) -> String {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind");
    let port = listener.local_addr().expect("address").port();
    let options = app.db.connect_options();
    let database_url = app
        .env
        .database_url_for(options.get_database().expect("test database"))
        .expect("test database URL");
    let vars = app.env.backend_vars(&BackendTarget {
        port,
        production: app.mode == crate::helpers::Mode::Production,
        database_url: &database_url,
        stalwart_provision_token: "solace-test-unused-admin-gate",
    });
    let mut config = Config::from_lookup(|name| {
        vars.iter()
            .find(|(key, _)| *key == name)
            .map(|(_, value)| value.clone())
    })
    .expect("config");
    config.stalwart_admin_user_ids = allowed;
    let db = solace_server::db::connect(&database_url, solace_server::db::DEFAULT_POOL_SIZE)
        .await
        .expect("gate database");
    let state = AppState::new(config, db).expect("state");
    tokio::spawn(solace_server::serve(
        listener,
        state,
        std::future::pending(),
    ));
    format!("http://localhost:{port}/api/internal/stalwart/admin-access")
}

async fn request(url: &str, user: Option<&TestUser>) -> reqwest::Response {
    let mut request = reqwest::Client::new().get(url);
    if let Some(user) = user {
        let cookie = user
            .agent
            .cookies()
            .iter()
            .map(|(name, value)| format!("{name}={value}"))
            .collect::<Vec<_>>()
            .join("; ");
        request = request.header(header::COOKIE, cookie);
    }
    request.send().await.expect("admin gate request")
}

#[tokio::test]
async fn only_a_live_allowlisted_session_opens_the_admin_gate() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let other = app.user().await;
    let url = gate(&app, vec![owner.id.clone()]).await;
    assert_eq!(request(&url, None).await.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(
        request(&url, Some(&other)).await.status(),
        StatusCode::NOT_FOUND
    );
    let accepted = request(&url, Some(&owner)).await;
    assert_eq!(accepted.status(), StatusCode::NO_CONTENT);
    assert_eq!(accepted.headers()[header::CACHE_CONTROL], "no-store");
    let forged = format!("{url}?userId={}", owner.id);
    assert_eq!(
        request(&forged, Some(&other)).await.status(),
        StatusCode::NOT_FOUND
    );
    let stale_cookie = owner
        .agent
        .cookies()
        .iter()
        .map(|(name, value)| format!("{name}={value}"))
        .collect::<Vec<_>>()
        .join("; ");
    let signed_out = owner
        .post("/api/auth/sign-out", serde_json::json!({}))
        .await;
    assert_eq!(signed_out.status, StatusCode::OK);
    let revoked = reqwest::Client::new()
        .get(&url)
        .header(header::COOKIE, stale_cookie)
        .send()
        .await
        .expect("revoked session");
    assert_eq!(revoked.status(), StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn an_unconfigured_gate_does_not_grant_access() {
    let app = TestApp::spawn().await;
    let owner = app.user().await;
    let url = gate(&app, Vec::new()).await;
    assert_eq!(
        request(&url, Some(&owner)).await.status(),
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn a_passkey_account_requires_its_session_bound_step_up() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    crate::passkeys::register(&app, &mut owner, "Admin gate test").await;
    let verified = owner
        .agent
        .cookie("solace-passkey-step-up")
        .expect("verified step-up")
        .to_owned();
    owner.agent.set_cookie("solace-passkey-step-up", "invalid");
    let url = gate(&app, vec![owner.id.clone()]).await;
    assert_eq!(
        request(&url, Some(&owner)).await.status(),
        StatusCode::FORBIDDEN
    );
    owner.agent.set_cookie("solace-passkey-step-up", &verified);
    assert_eq!(
        request(&url, Some(&owner)).await.status(),
        StatusCode::NO_CONTENT
    );
}
