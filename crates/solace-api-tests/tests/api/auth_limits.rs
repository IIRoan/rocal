//! Better Auth rate limits (Postgres-backed, HMACed keys) and the Expo apps' origin handling.

use reqwest::Method;
use serde_json::json;
use solace_api_tests::client::{Agent, ResponseResult};
use solace_api_types::auth::SessionWithUser;

use crate::helpers::{Mode, TestApp, ok};

const TOO_MANY: &str = "Too many requests. Please try again later.";

/// Better Auth's key: the client IP (IPv6 cut to its /64) and the path below `/api/auth`, HMACed with the auth secret.
fn rate_limit_key(secret: &str, ip: &str, path: &str) -> String {
    use hmac::{KeyInit, Mac};
    let address: std::net::Ipv6Addr = ip.parse().expect("test agents use IPv6");
    let segments = address.segments();
    let network = segments
        .iter()
        .enumerate()
        .map(|(i, s)| {
            if i < 4 {
                format!("{s:04x}")
            } else {
                "0000".into()
            }
        })
        .collect::<Vec<_>>()
        .join(":");
    let mut mac = hmac::Hmac::<sha2::Sha256>::new_from_slice(secret.as_bytes()).expect("key");
    mac.update(format!("{network}|{path}").as_bytes());
    mac.finalize()
        .into_bytes()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

async fn wrong_sign_in(agent: &mut Agent, email: &str) -> u16 {
    ok(agent
        .post(
            "/api/auth/sign-in/email",
            json!({"email": email, "password": "solace-test-wrong"}),
        )
        .await)
    .status
    .as_u16()
}

#[tokio::test]
async fn sign_in_allows_five_attempts_a_minute_per_client() {
    let app = TestApp::spawn().await;
    let user = app.user().await;
    let mut agent = app.anonymous();
    for _ in 0..5 {
        assert_eq!(wrong_sign_in(&mut agent, &user.email).await, 401);
    }
    let limited = ok(agent
        .post(
            "/api/auth/sign-in/email",
            json!({"email": user.email, "password": user.password}),
        )
        .await);
    assert_eq!(
        limited.status.as_u16(),
        429,
        "even the right password waits"
    );
    assert_eq!(ok(limited.value()), json!({"message": TOO_MANY}));
    let retry: u64 = limited
        .headers
        .get("x-retry-after")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse().ok())
        .expect("X-Retry-After");
    assert!((1..=60).contains(&retry), "{retry}");

    let key = rate_limit_key(
        &app.env.better_auth_secret,
        agent.client_ip(),
        "/sign-in/email",
    );
    let count: i32 = sqlx::query_scalar("SELECT count FROM rate_limit WHERE key = $1")
        .bind(&key)
        .fetch_one(&app.db)
        .await
        .expect("HMACed rate limit row");
    assert_eq!(count, 6, "the refused attempt is counted too");
    let raw_ip_rows: i64 =
        sqlx::query_scalar("SELECT count(*) FROM rate_limit WHERE key LIKE '%' || $1 || '%'")
            .bind(agent.client_ip().split("::").next().unwrap_or_default())
            .fetch_one(&app.db)
            .await
            .expect("count");
    assert_eq!(raw_ip_rows, 0, "no raw IPs at rest");

    let mut other = app.anonymous();
    ok(other
        .post(
            "/api/auth/sign-in/email",
            json!({"email": user.email, "password": user.password}),
        )
        .await
        .expect_status(200));
    let sign_up = ok(agent
        .post(
            "/api/auth/sign-up/email",
            json!({"email": "x@solace.test", "password": "solace-test-password", "name": "X"}),
        )
        .await);
    assert_eq!(
        sign_up.status.as_u16(),
        403,
        "a different path has its own budget"
    );
}

#[tokio::test]
async fn get_session_is_never_rate_limited() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    for _ in 0..120 {
        let response = user.get("/api/auth/get-session").await;
        assert_eq!(response.status.as_u16(), 200);
    }
}

#[tokio::test]
async fn other_auth_endpoints_allow_a_hundred_requests_a_minute() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    for _ in 0..100 {
        assert_eq!(
            user.get("/api/auth/list-sessions").await.status.as_u16(),
            200
        );
    }
    let limited = user.get("/api/auth/list-sessions").await;
    assert_eq!(limited.status.as_u16(), 429);
    assert_eq!(ok(limited.value()), json!({"message": TOO_MANY}));
}

#[tokio::test]
async fn passkey_ceremonies_allow_ten_requests_a_minute() {
    let app = TestApp::spawn().await;
    let mut agent = app.anonymous();
    for _ in 0..10 {
        ok(agent
            .get("/api/auth/passkey/generate-authenticate-options")
            .await
            .expect_status(200));
    }
    let limited = ok(agent
        .get("/api/auth/passkey/generate-authenticate-options")
        .await);
    assert_eq!(limited.status.as_u16(), 429);
}

#[tokio::test]
async fn account_recovery_endpoints_have_strict_budgets() {
    let app = TestApp::spawn().await;
    let email = format!("nobody-{}@solace.test", crate::helpers::hex(6));
    let cases = [
        (
            Method::POST,
            "/api/auth/request-password-reset",
            Some(json!({"email": email, "redirectTo": format!("{}/reset-password", app.origin)})),
            3,
        ),
        (
            Method::POST,
            "/api/auth/reset-password",
            Some(json!({"newPassword": "solace-test-password", "token": "missing"})),
            5,
        ),
        (
            Method::POST,
            "/api/auth/send-verification-email",
            Some(json!({"email": email})),
            3,
        ),
        (
            Method::GET,
            "/api/auth/verify-email?token=missing",
            None,
            10,
        ),
        (
            Method::POST,
            "/api/auth/one-time-token/verify",
            Some(json!({"token": "missing"})),
            10,
        ),
    ];
    for (method, path, body, budget) in cases {
        let mut agent = app.anonymous();
        for attempt in 1..=budget {
            let response = ok(agent.send(method.clone(), path, body.clone(), &[]).await);
            assert_ne!(response.status.as_u16(), 429, "{path} attempt {attempt}");
        }
        let limited = ok(agent.send(method.clone(), path, body.clone(), &[]).await);
        assert_eq!(limited.status.as_u16(), 429, "{path} after {budget}");
    }
}

#[tokio::test]
async fn the_expo_apps_sign_in_with_their_schemes() {
    let app = TestApp::spawn().await;
    let user = app.user().await;
    for scheme in ["solace", "solace-dev", "solace-mail", "solace-mail-dev"] {
        let mut expo = app.expo(scheme);
        ok(expo
            .post(
                "/api/auth/sign-in/email",
                json!({"email": user.email, "password": user.password}),
            )
            .await
            .expect_status(200));
        let session: SessionWithUser = ok(expo
            .get("/api/auth/get-session")
            .await
            .expect_status(200)
            .dto());
        assert_eq!(session.user.id.0, user.id, "{scheme}");
        ok(expo.get("/api/settings").await.expect_status(200));
    }

    let mut evil = app.expo("evil");
    let response = ok(evil
        .post(
            "/api/auth/sign-in/email",
            json!({"email": user.email, "password": user.password}),
        )
        .await);
    assert_eq!(response.status.as_u16(), 403);
    assert_eq!(
        ok(response.value()),
        json!({"message": "Invalid origin", "code": "INVALID_ORIGIN"})
    );

    let mut expo_go = app.expo("exp");
    let response = ok(expo_go
        .post(
            "/api/auth/sign-in/email",
            json!({"email": user.email, "password": user.password}),
        )
        .await);
    match app.mode {
        Mode::Development => assert_eq!(
            response.status.as_u16(),
            200,
            "exp:// is trusted in development"
        ),
        Mode::Production => assert_eq!(response.status.as_u16(), 403),
    }
}

#[tokio::test]
async fn an_origin_header_wins_over_expo_origin() {
    let app = TestApp::spawn().await;
    let user = app.user().await;
    let mut agent = app.expo("solace");
    let response = ok(agent
        .send(
            Method::POST,
            "/api/auth/sign-in/email",
            Some(json!({"email": user.email, "password": user.password})),
            &[("origin", "https://evil.example")],
        )
        .await);
    assert_eq!(response.status.as_u16(), 403);
}
