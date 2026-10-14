//! Public account routes: sign-up configuration, email availability, auth status, and invite validation and claiming.

use serde_json::{Value, json};
use solace_api_tests::client::ResponseResult;
use solace_api_types::account::{AuthStatus, EmailAvailability, SignupConfig};

use crate::helpers::{TestApp, count, expect_unknown_field, hex, ok};

#[tokio::test]
async fn signup_config_names_the_mail_domain() {
    let app = TestApp::spawn().await;
    let config: SignupConfig = ok(app
        .anonymous()
        .get("/api/account/signup-config")
        .await
        .expect_status(200)
        .dto());
    assert_eq!(config.default_email_domain, app.env.mail_domain);
}

#[tokio::test]
async fn email_availability_normalizes_and_explains() {
    let app = TestApp::spawn().await;
    let taken = app.user().await;
    let domain = app.env.mail_domain.clone();
    let fresh = format!("Fresh.{}", hex(4));
    let cases: Vec<(String, Value)> = vec![
        (
            fresh.clone(),
            json!({"email": fresh, "localPart": fresh.to_lowercase(), "domain": domain, "normalizedEmail": format!("{}@{domain}", fresh.to_lowercase()), "available": true, "code": "available", "message": "That email address is available."}),
        ),
        (
            taken.email.to_uppercase(),
            json!({"email": taken.email.to_uppercase(), "localPart": taken.local_part(), "domain": domain, "normalizedEmail": taken.email, "available": false, "code": "already_in_use", "message": "That email address is already in use."}),
        ),
        (
            "admin".into(),
            json!({"email": "admin", "localPart": "admin", "domain": domain, "normalizedEmail": format!("admin@{domain}"), "available": false, "code": "reserved", "message": "That email address is reserved."}),
        ),
        (
            "No-Reply".into(),
            json!({"email": "No-Reply", "localPart": "no-reply", "domain": domain, "normalizedEmail": format!("no-reply@{domain}"), "available": false, "code": "reserved", "message": "That email address is reserved."}),
        ),
        (
            "bad handle!".into(),
            json!({"email": "bad handle!", "localPart": "bad handle!", "domain": domain, "normalizedEmail": "bad handle!", "available": false, "code": "invalid_email", "message": "Use only lowercase letters, numbers, dots, underscores, and hyphens in your Solace email."}),
        ),
        (
            "someone@example.com".into(),
            json!({"email": "someone@example.com", "localPart": "someone", "domain": domain, "normalizedEmail": "someone@example.com", "available": false, "code": "invalid_email", "message": format!("Use your @{domain} email address for Solace sign-up.")}),
        ),
        (
            "not@@valid".into(),
            json!({"email": "not@@valid", "localPart": null, "domain": domain, "normalizedEmail": "not@@valid", "available": false, "code": "invalid_email", "message": format!("Enter a valid @{domain} email address.")}),
        ),
        (
            "   ".into(),
            json!({"email": "   ", "localPart": null, "domain": domain, "normalizedEmail": "", "available": false, "code": "invalid_email", "message": format!("Choose your @{domain} email address.")}),
        ),
    ];
    let mut agent = app.anonymous();
    for (input, expected) in cases {
        let query: String = url::form_urlencoded::Serializer::new(String::new())
            .append_pair("email", &input)
            .finish();
        let response = ok(agent
            .get(&format!("/api/account/email-availability?{query}"))
            .await
            .expect_status(200));
        let body: EmailAvailability = ok(response.dto());
        assert_eq!(
            serde_json::to_value(&body).expect("json"),
            expected,
            "{input:?}"
        );
    }

    let missing = ok(agent.get("/api/account/email-availability").await);
    ok(missing
        .expect_error(400, "Validation Error", "Required")
        .map(|_| ()));
    let empty = ok(agent.get("/api/account/email-availability?email=").await);
    ok(empty
        .expect_error(
            400,
            "Validation Error",
            "String must contain at least 1 character(s)",
        )
        .map(|_| ()));
    expect_unknown_field(
        &ok(agent
            .get("/api/account/email-availability?email=x&userId=y")
            .await),
        "userId",
    );
}

#[tokio::test]
async fn auth_status_reports_the_session_and_is_never_cached() {
    let app = TestApp::spawn().await;
    let response = ok(app
        .anonymous()
        .get("/api/account/auth-status")
        .await
        .expect_status(200));
    assert_eq!(
        response
            .headers
            .get("cache-control")
            .and_then(|v| v.to_str().ok()),
        Some("no-store, max-age=0")
    );
    let status: AuthStatus = ok(response.dto());
    assert_eq!(
        status,
        AuthStatus {
            authenticated: false,
            has_passkeys: false,
            requires_passkey_step_up: false
        }
    );
    let mut user = app.user().await;
    let status: AuthStatus = ok(user.get("/api/account/auth-status").await.dto());
    assert_eq!(
        status,
        AuthStatus {
            authenticated: true,
            has_passkeys: false,
            requires_passkey_step_up: false
        }
    );
}

async fn invite_with_status(app: &TestApp, status: &str, expires: &str) -> String {
    let token = app.invite_token().await;
    sqlx::query(&format!(
        "UPDATE invite SET status = $1, expires_at = now() + interval '{expires}' WHERE token = $2"
    ))
    .bind(status)
    .bind(&token)
    .execute(&app.db)
    .await
    .expect("update invite");
    token
}

fn validate_path(token: &str) -> String {
    let query: String = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("token", token)
        .finish();
    format!("/api/account/invite/validate?{query}")
}

#[tokio::test]
async fn invite_validation_explains_why_a_token_cannot_be_used() {
    let app = TestApp::spawn().await;
    let mut agent = app.anonymous();

    let pending = app.invite_token().await;
    let (invite_id, email): (String, String) =
        sqlx::query_as("SELECT id, email FROM invite WHERE token = $1")
            .bind(&pending)
            .fetch_one(&app.db)
            .await
            .expect("invite");
    let body = ok(agent
        .get(&validate_path(&pending))
        .await
        .expect_status(200)
        .value());
    assert_eq!(
        body,
        json!({"valid": true, "inviteId": invite_id, "email": email, "inviterName": "Suite Root"})
    );

    let cases = [
        (
            format!("missing{}", hex(8)),
            "Invite not found. Please check the token and try again.",
        ),
        (
            invite_with_status(&app, "revoked", "7 days").await,
            "This invite has been revoked.",
        ),
        (
            invite_with_status(&app, "accepted", "7 days").await,
            "This invite has already been used.",
        ),
        (
            invite_with_status(&app, "claimed", "7 days").await,
            "This invite has already been claimed.",
        ),
        (
            invite_with_status(&app, "pending", "-1 minute").await,
            "This invite has expired.",
        ),
    ];
    for (token, reason) in cases {
        let body = ok(agent
            .get(&validate_path(&token))
            .await
            .expect_status(200)
            .value());
        assert_eq!(body, json!({"valid": false, "reason": reason}), "{token}");
    }
    let missing = ok(agent.get("/api/account/invite/validate").await);
    ok(missing
        .expect_error(400, "Validation Error", "Required")
        .map(|_| ()));
}

#[tokio::test]
async fn claiming_reserves_the_chosen_email_for_fifteen_minutes() {
    let app = TestApp::spawn().await;
    let mut agent = app.anonymous();
    let token = app.invite_token().await;
    let email = format!("claim{}@{}", hex(4), app.env.mail_domain);
    let claimed = ok(agent
        .post(
            "/api/account/invite/claim",
            json!({"token": token, "chosenEmail": email.to_uppercase()}),
        )
        .await
        .expect_status(200)
        .value());
    let invite_id: String = sqlx::query_scalar("SELECT id FROM invite WHERE token = $1")
        .bind(&token)
        .fetch_one(&app.db)
        .await
        .expect("invite");
    assert_eq!(claimed, json!({"success": true, "inviteId": invite_id}));
    let (status, claimed_for): (String, Option<String>) =
        sqlx::query_as("SELECT status, claimed_for_email FROM invite WHERE token = $1")
            .bind(&token)
            .fetch_one(&app.db)
            .await
            .expect("invite");
    assert_eq!(
        (status.as_str(), claimed_for.as_deref()),
        ("claimed", Some(email.as_str()))
    );

    let again = ok(agent
        .post(
            "/api/account/invite/claim",
            json!({"token": token, "chosenEmail": email}),
        )
        .await
        .expect_status(200)
        .value());
    assert_eq!(
        again,
        json!({"success": false, "reason": "This invite has already been claimed."})
    );

    sqlx::query("UPDATE invite SET claimed_at = now() - interval '16 minutes' WHERE token = $1")
        .bind(&token)
        .execute(&app.db)
        .await
        .expect("age claim");
    let late = ok(agent
        .post(
            "/api/auth/sign-up/email",
            json!({"email": email, "password": "solace-test-password", "name": "Late"}),
        )
        .await);
    assert_eq!(late.status.as_u16(), 403);
    assert_eq!(
        ok(late.value()),
        json!({"message": "An invite is required to create an account. Please use your invite token before signing up."})
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM \"user\" WHERE email = $1",
            &email
        )
        .await,
        0
    );
}

#[tokio::test]
async fn claims_refuse_reserved_taken_and_missing_emails() {
    let app = TestApp::spawn().await;
    let taken = app.user().await;
    let mut agent = app.anonymous();
    let token = app.invite_token().await;
    let cases = [
        (
            taken.email.clone(),
            "That email address already has an account.",
        ),
        ("   ".to_owned(), "A Solace email is required."),
    ];
    for (email, reason) in cases {
        let body = ok(agent
            .post(
                "/api/account/invite/claim",
                json!({"token": token, "chosenEmail": email}),
            )
            .await
            .expect_status(200)
            .value());
        assert_eq!(
            body,
            json!({"success": false, "reason": reason}),
            "{email:?}"
        );
    }
    let unknown = ok(agent
        .post(
            "/api/account/invite/claim",
            json!({"token": format!("missing{}", hex(6)), "chosenEmail": "x@solace.test"}),
        )
        .await
        .expect_status(200)
        .value());
    assert_eq!(
        unknown,
        json!({"success": false, "reason": "Invite not found."})
    );

    // The contract refuses reserved addresses before the service's own (identical) check can run.
    for reserved in [
        "admin@solace.onl".to_owned(),
        format!("postmaster@{}", app.env.mail_domain),
        "no-reply+x@example.com".into(),
    ] {
        let response = ok(agent
            .post(
                "/api/account/invite/claim",
                json!({"token": token, "chosenEmail": reserved}),
            )
            .await);
        let error = ok(response.expect_error(
            400,
            "Validation Error",
            "Cannot claim a reserved system email address.",
        ));
        assert_eq!(
            error["details"]["issues"][0]["path"],
            json!("chosenEmail"),
            "{reserved}"
        );
    }
    expect_unknown_field(
        &ok(agent
            .post(
                "/api/account/invite/claim",
                json!({"token": token, "chosenEmail": "x@solace.test", "userId": taken.id}),
            )
            .await),
        "userId",
    );
    let status: String = sqlx::query_scalar("SELECT status FROM invite WHERE token = $1")
        .bind(&token)
        .fetch_one(&app.db)
        .await
        .expect("invite");
    assert_eq!(status, "pending");
}

#[tokio::test]
async fn public_invite_routes_allow_thirty_requests_a_minute_per_client() {
    let app = TestApp::spawn().await;
    let mut agent = app.anonymous();
    let path = format!("/api/account/invite/validate?token=missing{}", hex(6));
    for _ in 0..30 {
        ok(agent.get(&path).await.expect_status(200));
    }
    let limited = ok(agent.get(&path).await);
    assert_eq!(limited.status.as_u16(), 429);
    let body = ok(limited.value());
    assert_eq!(body["valid"], json!(false));
    let reason = body["reason"].as_str().expect("reason");
    assert!(
        reason.starts_with("Rate limit exceeded. Try again in ") && reason.ends_with(" seconds."),
        "{reason}"
    );

    // The limit is per action: claiming has its own budget.
    ok(agent
        .post(
            "/api/account/invite/claim",
            json!({"token": "missing", "chosenEmail": "x@solace.test"}),
        )
        .await
        .expect_status(200));
    ok(app.anonymous().get(&path).await.expect_status(200));
}

#[tokio::test]
async fn auth_status_forwards_session_cookie_changes() {
    let app = TestApp::spawn().await;
    let user = app.user().await;
    sqlx::query("UPDATE session SET expires_at = now() + interval '13 days' WHERE user_id = $1")
        .bind(&user.id)
        .execute(&app.db)
        .await
        .expect("age session");
    let data = app.auth_cookie("session_data");
    let mut agent = app.anonymous();
    for (name, value) in user
        .agent
        .cookies()
        .iter()
        .filter(|(name, _)| *name != data)
    {
        agent.set_cookie(name, value);
    }
    let response = ok(agent
        .get("/api/account/auth-status")
        .await
        .expect_status(200));
    assert_eq!(
        crate::helpers::set_cookies_named(&response, &app.session_cookie()).len(),
        1,
        "renewal forwarded"
    );

    sqlx::query("UPDATE session SET expires_at = now() - interval '1 minute' WHERE user_id = $1")
        .bind(&user.id)
        .execute(&app.db)
        .await
        .expect("expire session");
    let response = ok(agent
        .get("/api/account/auth-status")
        .await
        .expect_status(200));
    let cleared = crate::helpers::set_cookies_named(&response, &app.session_cookie());
    assert!(
        cleared.iter().any(|c| c.contains("Max-Age=0")),
        "clears forwarded: {:?}",
        response.set_cookies()
    );
    let status: AuthStatus = ok(response.dto());
    assert!(!status.authenticated);
}

#[tokio::test]
async fn only_one_of_two_concurrent_claims_wins() {
    let app = TestApp::spawn().await;
    let token = app.invite_token().await;
    let claim = |email: String| {
        let token = token.clone();
        let mut agent = app.anonymous();
        async move {
            ok(agent
                .post(
                    "/api/account/invite/claim",
                    json!({"token": token, "chosenEmail": email}),
                )
                .await
                .expect_status(200)
                .value())
        }
    };
    let domain = app.env.mail_domain.clone();
    let (a, b) = tokio::join!(
        claim(format!("race-a{}@{domain}", hex(4))),
        claim(format!("race-b{}@{domain}", hex(4)))
    );
    let wins = [&a, &b]
        .iter()
        .filter(|r| r["success"] == json!(true))
        .count();
    assert_eq!(wins, 1, "{a} {b}");
    let loser = if a["success"] == json!(true) { &b } else { &a };
    let reason = loser["reason"].as_str().unwrap_or_default();
    assert!(
        reason == "This invite is no longer available."
            || reason == "This invite has already been claimed.",
        "{loser}"
    );
}
