//! The administrator authorizer is key-gated, rate-limited, session-bound and explicitly allowlisted.

use reqwest::{StatusCode, header};
use solace_api_tests::env::BackendTarget;
use solace_server::auth::cookies::CookieSettings;
use solace_server::config::Config;

use crate::helpers::{TestApp, TestUser, hex};

const GATE_KEY: &str = "solace-test-admin-gate-key-0000000000000001";
const OWNER_ID: &str = "solace-test-admin-owner";

async fn app(allow_owner: bool, gate_key: Option<&str>) -> TestApp {
    let key = gate_key.map(str::to_owned);
    TestApp::spawn_with_config(move |config| {
        config.stalwart_admin_user_ids = if allow_owner {
            vec![OWNER_ID.to_owned()]
        } else {
            Vec::new()
        };
        config.stalwart_admin_gate_key = key;
    })
    .await
}

async fn owner(app: &TestApp) -> TestUser {
    let token = hex(32);
    let email = format!("{OWNER_ID}@solace.test");
    sqlx::query("INSERT INTO \"user\" (id, name, email, email_verified, created_at, updated_at) VALUES ($1, 'Admin Test', $2, true, now(), now())")
        .bind(OWNER_ID).bind(&email).execute(&app.db).await.expect("seed owner");
    sqlx::query("INSERT INTO session (id, token, user_id, expires_at, created_at, updated_at) VALUES ($1, $2, $3, now() + interval '14 days', now(), now())")
        .bind(hex(16)).bind(&token).bind(OWNER_ID).execute(&app.db).await.expect("seed session");
    let options = app.db.connect_options();
    let database_url = app
        .env
        .database_url_for(options.get_database().expect("database"))
        .expect("test URL");
    let vars = app.env.backend_vars(&BackendTarget {
        port: reqwest::Url::parse(&app.base_url)
            .expect("API URL")
            .port()
            .expect("test port"),
        production: app.mode == crate::helpers::Mode::Production,
        database_url: &database_url,
        stalwart_provision_token: "solace-test-unused-admin-gate",
    });
    let config = Config::from_lookup(|name| {
        vars.iter()
            .find(|(key, _)| *key == name)
            .map(|(_, value)| value.clone())
    })
    .expect("cookie config");
    let cookies = CookieSettings::new(&config);
    let signed = cookies.signed(&app.session_cookie(), &token, None);
    let value = signed
        .split(';')
        .next()
        .expect("cookie")
        .split_once('=')
        .expect("value")
        .1;
    let mut agent = app.anonymous();
    agent.set_cookie(&app.session_cookie(), value);
    TestUser {
        agent,
        id: OWNER_ID.into(),
        email,
        password: "solace-test-unused-password".into(),
        name: "Admin Test".into(),
    }
}

fn request(
    app: &TestApp,
    user: Option<&TestUser>,
    key: Option<&str>,
    ip: &str,
) -> reqwest::RequestBuilder {
    let mut request = reqwest::Client::new()
        .get(format!(
            "{}/api/internal/stalwart/admin-access",
            app.base_url
        ))
        .header("x-real-ip", ip);
    if let Some(key) = key {
        request = request.header("x-solace-admin-gate", key);
    }
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
    request
}

async fn status(app: &TestApp, user: Option<&TestUser>) -> StatusCode {
    request(app, user, Some(GATE_KEY), "203.0.113.11")
        .send()
        .await
        .expect("request")
        .status()
}

#[tokio::test]
async fn only_a_live_allowlisted_session_opens_the_admin_gate() {
    let app = app(true, Some(GATE_KEY)).await;
    let mut owner = owner(&app).await;
    let other = app.user().await;
    assert_eq!(status(&app, None).await, StatusCode::UNAUTHORIZED);
    assert_eq!(status(&app, Some(&other)).await, StatusCode::NOT_FOUND);
    let accepted = request(&app, Some(&owner), Some(GATE_KEY), "203.0.113.11")
        .send()
        .await
        .expect("allowed");
    assert_eq!(accepted.status(), StatusCode::NO_CONTENT);
    assert_eq!(accepted.headers()[header::CACHE_CONTROL], "no-store");
    let forged = request(&app, Some(&other), Some(GATE_KEY), "203.0.113.11")
        .query(&[("userId", OWNER_ID)])
        .send()
        .await
        .expect("forged owner");
    assert_eq!(forged.status(), StatusCode::NOT_FOUND);
    let stale_request = request(&app, Some(&owner), Some(GATE_KEY), "203.0.113.11");
    assert_eq!(
        owner
            .post("/api/auth/sign-out", serde_json::json!({}))
            .await
            .status,
        StatusCode::OK
    );
    assert_eq!(
        stale_request.send().await.expect("revoked").status(),
        StatusCode::UNAUTHORIZED
    );
}

#[tokio::test]
async fn the_gateway_key_is_required_before_session_authorization() {
    let app = app(true, Some(GATE_KEY)).await;
    let owner = owner(&app).await;
    for user in [None, Some(&owner)] {
        for key in [None, Some("wrong")] {
            let response = request(&app, user, key, "203.0.113.12")
                .send()
                .await
                .expect("public probe");
            assert_eq!(response.status(), StatusCode::NOT_FOUND);
            assert_eq!(response.headers()[header::CACHE_CONTROL], "no-store");
            assert!(!response.headers().contains_key(header::SET_COOKIE));
        }
    }
    let missing_ip = request(&app, Some(&owner), Some(GATE_KEY), "invalid")
        .send()
        .await
        .expect("invalid address");
    assert_eq!(missing_ip.status(), StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn an_unconfigured_gate_does_not_grant_access() {
    for key in [None, Some(GATE_KEY)] {
        let app = app(false, key).await;
        let owner = owner(&app).await;
        assert_eq!(status(&app, Some(&owner)).await, StatusCode::NOT_FOUND);
    }
}

#[tokio::test]
async fn a_passkey_account_requires_its_session_bound_step_up() {
    let app = app(true, Some(GATE_KEY)).await;
    let mut owner = owner(&app).await;
    crate::passkeys::register(&app, &mut owner, "Admin gate test").await;
    let verified = owner
        .agent
        .cookie("solace-passkey-step-up")
        .expect("verified step-up")
        .to_owned();
    owner.agent.set_cookie("solace-passkey-step-up", "invalid");
    assert_eq!(status(&app, Some(&owner)).await, StatusCode::FORBIDDEN);
    owner.agent.set_cookie("solace-passkey-step-up", &verified);
    assert_eq!(status(&app, Some(&owner)).await, StatusCode::NO_CONTENT);
}

#[tokio::test]
async fn gateway_requests_are_limited_per_client_address() {
    let app = app(false, Some(GATE_KEY)).await;
    let ip = format!("2001:db8:{}::1", hex(2));
    for _ in 0..240 {
        assert_eq!(
            request(&app, None, Some(GATE_KEY), &ip)
                .send()
                .await
                .expect("counted")
                .status(),
            StatusCode::UNAUTHORIZED
        );
    }
    assert_eq!(
        request(&app, None, Some(GATE_KEY), &ip)
            .send()
            .await
            .expect("limited")
            .status(),
        StatusCode::TOO_MANY_REQUESTS
    );
    assert_eq!(
        request(&app, None, Some(GATE_KEY), "2001:db8:ffff::1")
            .send()
            .await
            .expect("another address")
            .status(),
        StatusCode::UNAUTHORIZED
    );
}
