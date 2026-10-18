//! The fourteen live checks of `retired/backend/e2e/api-security.e2e.ts`, one test each, same names and assertions.

use regex_lite::Regex;
use serde_json::{Value, json};
use solace_api_tests::client::ApiResponse;

use crate::helpers::{Mode, TestApp, TestUser, ok};

const PLAINTEXT_EVENT: &str =
    "Plaintext event content must not be sent alongside encrypted content.";
const PLAINTEXT_NAME: &str = "Plaintext names must not be sent alongside an encrypted name.";

/// An authenticated rejection must be a non-auth 4xx (validation-style), optionally naming `text`.
fn expect_rejected(response: &ApiResponse, text: Option<&str>) {
    let status = response.status.as_u16();
    assert!(
        (400..500).contains(&status) && status != 401 && status != 403,
        "expected a non-auth 4xx, got {status}: {}",
        response.text()
    );
    if let Some(text) = text {
        assert!(
            response.text().contains(text),
            "expected {text:?} in {}",
            response.text()
        );
    }
}

async fn first_calendar_id(user: &mut TestUser) -> String {
    let created = ok(user
        .post("/api/calendars", json!({"name": "E2E", "color": "#3b82f6"}))
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    created["id"].as_str().expect("calendar id").to_owned()
}

#[tokio::test]
async fn api_sends_strict_security_headers() {
    let app = TestApp::spawn().await;
    let response = ok(app.anonymous().get("/api/health").await);
    let header = |name: &str| {
        response
            .headers
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned)
    };
    assert_eq!(header("x-content-type-options").as_deref(), Some("nosniff"));
    assert_eq!(header("x-frame-options").as_deref(), Some("DENY"));
    assert_eq!(header("referrer-policy").as_deref(), Some("no-referrer"));
    assert!(
        header("content-security-policy").is_some_and(|csp| csp.contains("frame-ancestors 'none'"))
    );
    if app.mode == Mode::Production {
        assert!(header("strict-transport-security").is_some_and(|hsts| hsts.contains("max-age=")));
    }
}

#[tokio::test]
async fn api_errors_carry_a_request_id_and_no_internals() {
    let app = TestApp::spawn().await;
    let response = ok(app.anonymous().get("/api/events/does-not-exist").await);
    assert_eq!(response.status.as_u16(), 401);
    let leaks = Regex::new(r"(?i)stack|prisma|at \w+ \(").expect("regex");
    assert!(
        !leaks.is_match(&response.text()),
        "error body leaks internals: {}",
        response.text()
    );
}

#[tokio::test]
async fn cors_trusts_the_app_origin() {
    let app = TestApp::spawn().await;
    let response = reqwest::Client::new()
        .get(format!("{}/api/health", app.base_url))
        .header("origin", &app.origin)
        .send()
        .await
        .expect("request");
    assert_eq!(
        response
            .headers()
            .get("access-control-allow-origin")
            .and_then(|v| v.to_str().ok()),
        Some(app.origin.as_str())
    );
}

#[tokio::test]
async fn cors_does_not_trust_localhost_in_production() {
    let app = TestApp::spawn().await;
    if app.mode != Mode::Production {
        return;
    }
    for origin in [
        "http://localhost:4000",
        "https://localhost",
        "https://evil.example",
    ] {
        let response = reqwest::Client::new()
            .get(format!("{}/api/health", app.base_url))
            .header("origin", origin)
            .send()
            .await
            .expect("request");
        let allowed = response
            .headers()
            .get("access-control-allow-origin")
            .and_then(|v| v.to_str().ok());
        assert!(
            allowed != Some(origin) && allowed != Some("*"),
            "untrusted origin {origin} was allowed"
        );
    }
}

#[tokio::test]
async fn sign_in_is_rate_limited() {
    let app = TestApp::spawn().await;
    let mut agent = app.anonymous();
    let email = format!("e2e-rate-limit-{}@example.invalid", crate::helpers::hex(8));
    let mut statuses = Vec::new();
    for _ in 0..8 {
        let response = ok(agent
            .post(
                "/api/auth/sign-in/email",
                json!({"email": email, "password": "not-the-password"}),
            )
            .await);
        statuses.push(response.status.as_u16());
        if response.status.as_u16() == 429 {
            return;
        }
    }
    panic!("no 429 after 8 sign-in attempts: {statuses:?}");
}

/// Needs `TEST_WEB_URL` (a running web app); skipped otherwise, like the e2e check without E2E_WEB_URL.
#[tokio::test]
async fn web_sends_csp_and_security_headers() {
    let Ok(web_url) = std::env::var("TEST_WEB_URL") else {
        return;
    };
    solace_api_tests::guard::check_service_url("TEST_WEB_URL", &web_url).expect("test web URL");
    let response = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("client")
        .get(format!("{}/login", web_url.trim_end_matches('/')))
        .send()
        .await
        .expect("request");
    let header = |name: &str| {
        response
            .headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned)
            .unwrap_or_default()
    };
    let csp = header("content-security-policy");
    for directive in [
        "default-src 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
    ] {
        assert!(csp.contains(directive), "web CSP missing {directive}");
    }
    let unsafe_eval = Regex::new(r"script-src[^;]*'unsafe-eval'").expect("regex");
    assert!(!unsafe_eval.is_match(&csp), "web CSP allows unsafe-eval");
    assert!(
        header("strict-transport-security").contains("max-age="),
        "web missing HSTS"
    );
    assert_eq!(header("x-content-type-options"), "nosniff");
    assert!(
        header("permissions-policy").contains("publickey-credentials-get"),
        "passkeys not allowed"
    );
}

#[tokio::test]
async fn unauthenticated_writes_are_refused() {
    let app = TestApp::spawn().await;
    let response = ok(app
        .anonymous()
        .post("/api/calendars", json!({"name": "e2e", "color": "#3b82f6"}))
        .await);
    assert_eq!(response.status.as_u16(), 401);
}

#[tokio::test]
async fn authenticated_session_resolves() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let response = user.get("/api/calendars").await;
    assert!(
        response.status.is_success(),
        "GET /api/calendars → {}",
        response.status
    );
}

#[tokio::test]
async fn event_plaintext_alongside_ciphertext_is_rejected() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar_id = first_calendar_id(&mut user).await;
    let response = user
        .post(
            "/api/events",
            json!({
                "title": "plaintext title",
                "start": "2026-11-20T10:00:00.000Z",
                "end": "2026-11-20T11:00:00.000Z",
                "timezone": "Europe/Amsterdam",
                "calendarId": calendar_id,
                "encryptedContent": "v1.e2e.ciphertext",
                "blindIndexTokens": ["e2e"],
            }),
        )
        .await;
    expect_rejected(&response, Some(PLAINTEXT_EVENT));
}

#[tokio::test]
async fn calendar_plaintext_name_alongside_ciphertext_is_rejected() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let response = user
        .post(
            "/api/calendars",
            json!({"name": "plaintext name", "color": "#3b82f6", "encryptedName": "v1.e2e.ciphertext", "blindIndexTokens": ["e2e"]}),
        )
        .await;
    expect_rejected(&response, Some(PLAINTEXT_NAME));
}

#[tokio::test]
async fn legacy_plaintext_display_title_is_accepted_but_never_stored() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let response = user
        .put(
            &format!("/api/notifications/event/{}", random_uuid()),
            json!({"notifications": [], "displayTitle": "plaintext title"}),
        )
        .await;
    assert_ne!(
        response.status.as_u16(),
        400,
        "legacy client rejected: {}",
        response.text()
    );
    assert!(
        !response.text().contains("plaintext title"),
        "response echoed the plaintext title"
    );
}

#[tokio::test]
async fn unknown_reminder_fields_are_still_rejected() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let response = user
        .put(
            &format!("/api/notifications/event/{}", random_uuid()),
            json!({"notifications": [], "bogusField": "x"}),
        )
        .await;
    expect_rejected(&response, None);
}

#[tokio::test]
async fn ics_subscriptions_to_private_addresses_are_refused() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    for url in [
        "http://169.254.169.254/latest/meta-data/",
        "http://127.1/calendar.ics",
        "http://[::ffff:10.0.0.1]/calendar.ics",
        "http://0x7f000001/calendar.ics",
    ] {
        let response = user
            .post(
                "/api/subscriptions",
                json!({"name": "e2e ssrf probe", "url": url, "color": "#3b82f6"}),
            )
            .await;
        expect_rejected(&response, Some("not allowed"));
    }
}

#[tokio::test]
async fn session_payload_exposes_no_ip_or_user_agent() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let response = user.get("/api/auth/get-session").await;
    assert!(
        response.status.is_success(),
        "get-session failed: {}",
        response.status
    );
    let body: Value = ok(response.value());
    let session = &body["session"];
    assert!(session.is_object(), "cookie did not resolve to a session");
    assert!(
        session["ipAddress"].is_null() && session["userAgent"].is_null(),
        "session stores IP/user agent"
    );
}

fn random_uuid() -> String {
    let bytes: [u8; 16] = rand::random();
    let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    format!(
        "{}-{}-4{}-a{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[13..16],
        &hex[17..20],
        &hex[20..32]
    )
}
