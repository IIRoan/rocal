//! Root routes and what every response carries: security headers, CORS, request ids and the error envelope.

use reqwest::Method;
use serde_json::json;
use solace_api_tests::client::{ApiResponse, ResponseResult};

use crate::helpers::{Mode, TestApp, expect_unauthorized, header, ok};

fn assert_security_headers(app: &TestApp, response: &ApiResponse, corp: &str) {
    assert_eq!(header(response, "x-content-type-options"), Some("nosniff"));
    assert_eq!(header(response, "x-frame-options"), Some("DENY"));
    assert_eq!(header(response, "referrer-policy"), Some("no-referrer"));
    assert_eq!(
        header(response, "content-security-policy"),
        Some("default-src 'none'; frame-ancestors 'none'")
    );
    assert_eq!(header(response, "cross-origin-resource-policy"), Some(corp));
    assert_eq!(
        header(response, "permissions-policy"),
        Some(
            "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()"
        )
    );
    match app.mode {
        Mode::Production => assert_eq!(
            header(response, "strict-transport-security"),
            Some("max-age=63072000; includeSubDomains; preload")
        ),
        Mode::Development => assert_eq!(header(response, "strict-transport-security"), None),
    }
}

#[tokio::test]
async fn health_and_root_routes() {
    let app = TestApp::spawn().await;
    let mut agent = app.anonymous();
    let health = ok(agent.get("/api/health").await.expect_status(200));
    assert_eq!(ok(health.value()), json!({"status": "ok"}));
    let jmap = ok(agent.get("/api/health/mail-jmap").await.expect_status(200));
    assert_eq!(ok(jmap.value()), json!({"status": "ok"}));
    let test = ok(agent.get("/api/test").await.expect_status(200).value());
    assert_eq!(test["message"], json!("Backend connection working"));
    assert!(
        test["timestamp"]
            .as_str()
            .is_some_and(|t| t.len() == 24 && t.ends_with('Z')),
        "{test}"
    );

    let root = ok(agent.get("/api").await);
    assert_eq!(root.status.as_u16(), 302);
    let frontend = match app.mode {
        Mode::Development => "http://localhost:4100",
        Mode::Production => "https://solace.test",
    };
    assert_eq!(header(&root, "location"), Some(frontend));
    let error = ok(agent.get("/api?error=access_denied").await);
    assert_eq!(
        header(&error, "location"),
        Some(format!("{frontend}/login?error=access_denied").as_str())
    );
}

#[tokio::test]
async fn every_kind_of_response_carries_the_security_headers() {
    let app = TestApp::spawn().await;
    let mut agent = app.anonymous();
    assert_security_headers(&app, &ok(agent.get("/api/health").await), "same-site");
    assert_security_headers(
        &app,
        &ok(agent.get("/api/auth/get-session").await),
        "same-site",
    );
    assert_security_headers(&app, &ok(agent.get("/api/settings").await), "same-site");
    assert_security_headers(
        &app,
        &ok(agent.get("/api/does-not-exist").await),
        "same-site",
    );
    assert_security_headers(
        &app,
        &ok(agent.get("/api/profiles/avatars/a1b2").await),
        "cross-origin",
    );
}

#[tokio::test]
async fn cors_reflects_only_trusted_origins() {
    let app = TestApp::spawn().await;
    let client = reqwest::Client::new();
    let get = |origin: &str| {
        client
            .get(format!("{}/api/health", app.base_url))
            .header("origin", origin)
            .send()
    };
    let trusted = get(&app.origin).await.expect("request");
    assert_eq!(
        trusted
            .headers()
            .get("access-control-allow-origin")
            .and_then(|v| v.to_str().ok()),
        Some(app.origin.as_str())
    );
    assert_eq!(
        trusted
            .headers()
            .get("access-control-allow-credentials")
            .and_then(|v| v.to_str().ok()),
        Some("true")
    );
    assert_eq!(
        trusted.headers().get("vary").and_then(|v| v.to_str().ok()),
        Some("Origin")
    );
    assert_eq!(
        trusted
            .headers()
            .get("access-control-expose-headers")
            .and_then(|v| v.to_str().ok()),
        Some("Set-Cookie, Server-Timing")
    );

    let mut untrusted = vec!["https://evil.example", "http://192.0.2.1:8081"];
    if app.mode == Mode::Production {
        untrusted.extend([
            "http://localhost:4000",
            "https://localhost",
            "http://localhost:8081",
            "http://127.0.0.1:8081",
        ]);
    }
    for origin in untrusted {
        let response = get(origin).await.expect("request");
        assert_eq!(response.status().as_u16(), 200);
        assert_eq!(
            response.headers().get("access-control-allow-origin"),
            None,
            "{origin}"
        );
    }
    if app.mode == Mode::Development {
        // Expo web on any loopback port counts as the local host outside production.
        for origin in [
            "http://localhost:4000",
            "http://localhost:8081",
            "http://127.0.0.1:8081",
        ] {
            let response = get(origin).await.expect("request");
            assert_eq!(
                response
                    .headers()
                    .get("access-control-allow-origin")
                    .and_then(|v| v.to_str().ok()),
                Some(origin),
                "localhost is trusted outside production"
            );
        }
    }

    let preflight = client
        .request(Method::OPTIONS, format!("{}/api/settings", app.base_url))
        .header("origin", &app.origin)
        .header("access-control-request-method", "PUT")
        .header("access-control-request-headers", "content-type")
        .send()
        .await
        .expect("preflight");
    assert_eq!(preflight.status().as_u16(), 204);
    let headers = preflight.headers();
    let value = |name: &str| {
        headers
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned)
    };
    assert_eq!(
        value("access-control-allow-origin"),
        Some(app.origin.clone())
    );
    assert_eq!(
        value("access-control-allow-methods").as_deref(),
        Some("GET, POST, PUT, DELETE, PATCH, OPTIONS")
    );
    assert_eq!(
        value("access-control-allow-headers").as_deref(),
        Some("Content-Type, Authorization, Cookie, X-Requested-With, Accept, Origin")
    );
    assert_eq!(value("access-control-max-age").as_deref(), Some("86400"));
}

#[tokio::test]
async fn cross_site_writes_are_refused_from_untrusted_origins() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let body = || Some(json!({"encryptedName": "ciphertext", "color": "blue"}));
    let cross_site = ok(user
        .agent
        .send(
            Method::POST,
            "/api/calendars",
            body(),
            &[("origin", "https://evil.example")],
        )
        .await);
    ok(cross_site
        .expect_error(403, "Forbidden", "Invalid origin")
        .map(|_| ()));
    let null_origin = ok(user
        .agent
        .send(
            Method::POST,
            "/api/calendars",
            body(),
            &[("origin", "null")],
        )
        .await);
    assert_eq!(null_origin.status.as_u16(), 403);
    let trusted = ok(user
        .agent
        .post(
            "/api/calendars",
            json!({"encryptedName": "ciphertext", "color": "blue"}),
        )
        .await);
    assert!(trusted.status.is_success(), "{}", trusted.text());
    let read = ok(user
        .agent
        .send(
            Method::GET,
            "/api/calendars",
            None,
            &[("origin", "https://evil.example")],
        )
        .await);
    assert!(read.status.is_success(), "reads are left to CORS");
}

#[tokio::test]
async fn error_envelopes_echo_the_request_id() {
    let app = TestApp::spawn().await;
    let mut agent = app.anonymous();
    let response = ok(agent
        .send(
            Method::GET,
            "/api/does-not-exist",
            None,
            &[("x-request-id", "suite-request-1")],
        )
        .await);
    let body = ok(response.expect_error(404, "Not Found", "Not Found"));
    assert_eq!(body["requestId"], json!("suite-request-1"));
    assert_eq!(header(&response, "x-request-id"), Some("suite-request-1"));

    let long = "x".repeat(129);
    let response = ok(agent
        .send(
            Method::GET,
            "/api/does-not-exist",
            None,
            &[("x-request-id", &long)],
        )
        .await);
    let generated = ok(response.value())["requestId"]
        .as_str()
        .expect("requestId")
        .to_owned();
    assert_eq!(
        generated.len(),
        36,
        "an over-long id is replaced by a UUID: {generated}"
    );
    assert_eq!(header(&response, "x-request-id"), Some(generated.as_str()));

    let success = ok(agent
        .send(
            Method::GET,
            "/api/health",
            None,
            &[("x-request-id", "suite-request-2")],
        )
        .await);
    assert_eq!(
        header(&success, "x-request-id"),
        None,
        "success responses carry no request id"
    );
    let guard = ok(agent
        .send(
            Method::GET,
            "/api/settings",
            None,
            &[("x-request-id", "suite-request-3")],
        )
        .await);
    expect_unauthorized(&guard);
    assert_eq!(header(&guard, "x-request-id"), None);
}

#[tokio::test]
async fn malformed_json_is_a_parse_error() {
    let app = TestApp::spawn().await;
    let response = reqwest::Client::new()
        .post(format!("{}/api/account/invite/claim", app.base_url))
        .header("content-type", "application/json")
        .body("{bad")
        .send()
        .await
        .expect("request");
    assert_eq!(response.status().as_u16(), 400);
    let body: serde_json::Value = response.json().await.expect("json");
    assert_eq!(
        (&body["error"], &body["message"], &body["statusCode"]),
        (
            &json!("Parse Error"),
            &json!("Invalid request format"),
            &json!(400)
        )
    );
    assert!(body["requestId"].is_string() && body["timestamp"].is_string());
}

/// The guard answers before a guarded route validates its body, query or path.
#[tokio::test]
async fn guarded_routes_authenticate_before_they_validate() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    crate::passkeys::register(&app, &mut user, "Laptop").await;
    let mut needs_step_up = app.anonymous();
    ok(needs_step_up
        .post(
            "/api/auth/sign-in/email",
            json!({"email": user.email, "password": user.password}),
        )
        .await
        .and_then(|r| r.expect_status(200)));

    for agent in [&mut app.anonymous(), &mut needs_step_up] {
        let anonymous = agent.cookie(&app.session_cookie()).is_none();
        let malformed = [
            ok(agent.put("/api/settings", json!({"theme": 1})).await),
            ok(agent.post("/api/events", json!({})).await),
            ok(agent.get("/api/events/search").await),
            ok(agent.get("/api/profiles/avatars/bad.id").await),
        ];
        for response in &malformed {
            if anonymous {
                expect_unauthorized(response);
            } else {
                ok(response.expect_error(403, "Forbidden", "Passkey verification required."));
            }
        }
    }

    let unparsable = reqwest::Client::new()
        .put(format!("{}/api/settings", app.base_url))
        .header("content-type", "application/json")
        .body("{bad")
        .send()
        .await
        .expect("request");
    assert_eq!(unparsable.status().as_u16(), 401);

    let public = ok(app
        .anonymous()
        .post("/api/account/invite/claim", json!({}))
        .await);
    assert_eq!(public.status.as_u16(), 400, "{}", public.text());
}

#[tokio::test]
async fn integers_beyond_what_the_api_stores_are_validation_errors() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let int4 = "Number must be less than or equal to 2147483647";
    let cases = [
        (
            Method::PUT,
            "/api/settings",
            Some(json!({"defaultEventDuration": 2_147_483_648_i64})),
            int4,
            "defaultEventDuration",
        ),
        (
            Method::POST,
            "/api/recurring/validate",
            Some(
                json!({"rule": {"frequency": "daily", "interval": 1, "count": 2_147_483_648_i64}}),
            ),
            int4,
            "rule.count",
        ),
        (
            Method::POST,
            "/api/calendars",
            Some(
                json!({"color": "blue", "encryptedName": "x", "encryptionKeyVersion": 2_147_483_648_i64}),
            ),
            int4,
            "encryptionKeyVersion",
        ),
        (
            Method::GET,
            "/api/events/search?q=ab&offset=9223372036854775808",
            None,
            "Number must be less than or equal to 9007199254740991",
            "offset",
        ),
        (
            Method::GET,
            "/api/events/search?q=ab&limit=0x%2B1",
            None,
            "Expected number, received nan",
            "limit",
        ),
    ];
    for (method, path, body, message, field) in cases {
        let response = ok(user.agent.send(method, path, body, &[]).await);
        let error = response
            .expect_error(400, "Validation Error", message)
            .unwrap_or_else(|e| panic!("{path}: {e}"));
        assert_eq!(
            error["details"]["issues"][0]["path"],
            json!(field),
            "{path}"
        );
    }
    let large = ok(user
        .agent
        .get("/api/events/search?q=ab&offset=9000000000000000")
        .await);
    assert_eq!(large.status.as_u16(), 200, "{}", large.text());
}

#[tokio::test]
async fn unknown_routes_and_methods_are_not_found() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    for (method, path) in [
        (Method::GET, "/api/nope"),
        (Method::POST, "/api/health"),
        (Method::PATCH, "/api/settings"),
        (Method::GET, "/nope"),
    ] {
        let response = ok(user.agent.send(method, path, None, &[]).await);
        ok(response
            .expect_error(404, "Not Found", "Not Found")
            .map(|_| ()));
    }
    let auth = ok(user.agent.get("/api/auth/does-not-exist").await);
    assert_eq!(auth.status.as_u16(), 404);
    assert!(
        auth.body.is_empty(),
        "Better Auth's router answers unknown paths with an empty 404"
    );
}

#[tokio::test]
async fn only_the_auth_error_page_may_use_inline_styles() {
    let app = TestApp::spawn().await;
    if app.mode == Mode::Production {
        // Production Better Auth sends errors to the app instead of rendering its page.
        let response = ok(app
            .anonymous()
            .get("/api/auth/error")
            .await
            .expect_status(302));
        assert_eq!(header(&response, "location"), Some("/?error=UNKNOWN"));
        return;
    }
    let response = ok(app
        .anonymous()
        .get("/api/auth/error")
        .await
        .expect_status(200));
    assert_eq!(header(&response, "content-type"), Some("text/html"));
    assert_eq!(
        header(&response, "content-security-policy"),
        Some("default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'")
    );
    assert!(response.text().starts_with("<!DOCTYPE html>"));
}
