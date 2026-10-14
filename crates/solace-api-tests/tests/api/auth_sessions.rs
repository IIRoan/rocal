//! Better Auth sign-up, sign-in, get-session, sign-out and session management, in the exact wire format.

use serde_json::json;
use solace_api_types::auth::{
    AuthError, AuthSession, MeResponse, SessionWithUser, SignInResponse, SignUpResponse,
    StatusFlag, SuccessFlag,
};

use solace_api_tests::client::ResponseResult;

use crate::helpers::{
    Backend, Mode, TestApp, TestUser, count, expect_unauthorized, hex, ok, set_cookies_named,
    signed_cookie_token,
};

const INVITE_REQUIRED: &str =
    "An invite is required to create an account. Please use your invite token before signing up.";

fn auth_error(
    response: &solace_api_tests::client::ApiResponse,
    status: u16,
    code: &str,
    message: &str,
) {
    assert_eq!(response.status.as_u16(), status, "{}", response.text());
    let error: AuthError = ok(response.dto());
    assert_eq!(
        (error.code.as_str(), error.message.as_str()),
        (code, message)
    );
}

#[tokio::test]
async fn sign_up_needs_a_claimed_invite() {
    let app = TestApp::spawn().await;
    let mut agent = app.anonymous();
    let email = format!("u{}@{}", hex(6), app.env.mail_domain);
    let response = ok(agent
        .post(
            "/api/auth/sign-up/email",
            json!({"email": email, "password": "solace-test-password", "name": "No Invite"}),
        )
        .await);
    assert_eq!(response.status.as_u16(), 403);
    assert_eq!(ok(response.value()), json!({"message": INVITE_REQUIRED}));

    let response = ok(agent
        .post(
            "/api/auth/sign-up/email",
            json!({"password": "solace-test-password", "name": "No Email"}),
        )
        .await);
    assert_eq!(response.status.as_u16(), 403);
    assert_eq!(
        ok(response.value()),
        json!({"message": "An invite is required to create an account."})
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
async fn sign_up_creates_the_user_credential_session_and_accepts_the_invite() {
    let app = TestApp::spawn().await;
    let mut agent = app.anonymous();
    let token = app.invite_token().await;
    let email = format!("u{}@{}", hex(6), app.env.mail_domain);
    ok(agent
        .post(
            "/api/account/invite/claim",
            json!({"token": token, "chosenEmail": email}),
        )
        .await
        .expect_status(200));

    let response = ok(agent
        .post(
            "/api/auth/sign-up/email",
            json!({"email": email, "password": "solace-test-password", "name": "New Person"}),
        )
        .await
        .expect_status(200));
    let body: SignUpResponse = ok(response.dto());
    assert_eq!(
        (body.user.email.as_str(), body.user.name.as_str()),
        (email.as_str(), "New Person")
    );
    assert!(!body.user.email_verified && body.user.image.is_none());
    assert_eq!(
        body.user.id.0.len(),
        32,
        "Better Auth ids are 32 characters"
    );

    let live: Vec<_> = set_cookies_named(&response, &app.session_cookie())
        .into_iter()
        .filter(|c| !c.contains("Max-Age=0"))
        .collect();
    assert_eq!(live.len(), 1, "{live:?}");
    let value = agent.cookie(&app.session_cookie()).expect("session cookie");
    assert_eq!(
        signed_cookie_token(&app.env.better_auth_secret, value).as_deref(),
        Some(body.token.as_str())
    );

    let user_id = body.user.id.0.clone();
    let (ip, agent_header): (Option<String>, Option<String>) =
        sqlx::query_as("SELECT ip_address, user_agent FROM session WHERE token = $1")
            .bind(&body.token)
            .fetch_one(&app.db)
            .await
            .expect("session row");
    assert_eq!(
        (ip, agent_header),
        (None, None),
        "sessions never store the client IP or user agent"
    );
    let password: String = sqlx::query_scalar(
        "SELECT password FROM account WHERE user_id = $1 AND provider_id = 'credential' AND account_id = $1",
    )
    .bind(&user_id)
    .fetch_one(&app.db)
    .await
    .expect("credential account");
    let (salt, key) = password.split_once(':').expect("hexSalt:hexKey");
    assert_eq!((salt.len(), key.len()), (32, 128));
    assert!(password.chars().all(|c| c == ':' || c.is_ascii_hexdigit()));

    let status: String = sqlx::query_scalar("SELECT status FROM invite WHERE token = $1")
        .bind(&token)
        .fetch_one(&app.db)
        .await
        .expect("invite");
    assert_eq!(status, "accepted");
    let approved: Option<String> =
        sqlx::query_scalar("SELECT mailbox_approved_at::text FROM \"user\" WHERE id = $1")
            .bind(&user_id)
            .fetch_one(&app.db)
            .await
            .expect("user");
    assert!(
        approved.is_some(),
        "an accepted invite approves the mailbox"
    );
}

#[tokio::test]
async fn sign_up_validates_its_body() {
    let app = TestApp::spawn().await;
    let mut agent = app.anonymous();
    let token = app.invite_token().await;
    let email = format!("u{}@{}", hex(6), app.env.mail_domain);
    ok(agent
        .post(
            "/api/account/invite/claim",
            json!({"token": token, "chosenEmail": email}),
        )
        .await
        .expect_status(200));

    let short = ok(agent
        .post(
            "/api/auth/sign-up/email",
            json!({"email": email, "password": "short", "name": "P"}),
        )
        .await);
    auth_error(&short, 400, "PASSWORD_TOO_SHORT", "Password too short");
    let long = ok(agent
        .post(
            "/api/auth/sign-up/email",
            json!({"email": email, "password": "x".repeat(129), "name": "P"}),
        )
        .await);
    auth_error(&long, 400, "PASSWORD_TOO_LONG", "Password too long");
    let no_name = ok(agent
        .post(
            "/api/auth/sign-up/email",
            json!({"email": email, "password": "solace-test-password"}),
        )
        .await);
    auth_error(
        &no_name,
        400,
        "VALIDATION_ERROR",
        "[body.name] Invalid input: expected string, received undefined",
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

    // Better Auth bodies are not strict: extra fields are ignored.
    ok(agent
        .post(
            "/api/auth/sign-up/email",
            json!({"email": email, "password": "solace-test-password", "name": "P", "extra": 1}),
        )
        .await
        .expect_status(200));
}

#[tokio::test]
async fn sign_in_with_the_password() {
    let app = TestApp::spawn().await;
    let user = app.user().await;
    let mut agent = app.anonymous();
    let response = ok(agent
        .post(
            "/api/auth/sign-in/email",
            json!({"email": user.email.to_uppercase(), "password": user.password}),
        )
        .await
        .expect_status(200));
    let body: SignInResponse = ok(response.dto());
    assert!(!body.redirect);
    assert_eq!(body.user.id.0, user.id);
    let value = agent.cookie(&app.session_cookie()).expect("session cookie");
    assert_eq!(
        signed_cookie_token(&app.env.better_auth_secret, value).as_deref(),
        Some(body.token.as_str())
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM session WHERE user_id = $1",
            &user.id
        )
        .await,
        2
    );
}

#[tokio::test]
async fn sign_in_failures_do_not_reveal_which_part_was_wrong() {
    let app = TestApp::spawn().await;
    let user = app.user().await;
    let mut agent = app.anonymous();
    let wrong = ok(agent
        .post(
            "/api/auth/sign-in/email",
            json!({"email": user.email, "password": "solace-test-wrong"}),
        )
        .await);
    auth_error(
        &wrong,
        401,
        "INVALID_EMAIL_OR_PASSWORD",
        "Invalid email or password",
    );
    let unknown = ok(agent
        .post(
            "/api/auth/sign-in/email",
            json!({"email": format!("nobody{}@{}", hex(4), app.env.mail_domain), "password": "solace-test-wrong"}),
        )
        .await);
    auth_error(
        &unknown,
        401,
        "INVALID_EMAIL_OR_PASSWORD",
        "Invalid email or password",
    );
    let malformed = ok(agent
        .post(
            "/api/auth/sign-in/email",
            json!({"email": "not-an-email", "password": "x"}),
        )
        .await);
    auth_error(&malformed, 400, "INVALID_EMAIL", "Invalid email");
    assert!(agent.cookie(&app.session_cookie()).is_none());
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM session WHERE user_id = $1",
            &user.id
        )
        .await,
        1
    );
}

#[tokio::test]
async fn sign_in_checks_the_origin_and_fetch_metadata() {
    let app = TestApp::spawn().await;
    let user = app.user().await;
    let body = json!({"email": user.email, "password": user.password});
    let mut agent = app.anonymous();

    let evil = ok(agent
        .send(
            reqwest::Method::POST,
            "/api/auth/sign-in/email",
            Some(body.clone()),
            &[("origin", "https://evil.example")],
        )
        .await);
    auth_error(&evil, 403, "INVALID_ORIGIN", "Invalid origin");

    let navigation = ok(agent
        .send(
            reqwest::Method::POST,
            "/api/auth/sign-in/email",
            Some(body.clone()),
            &[
                ("sec-fetch-site", "cross-site"),
                ("sec-fetch-mode", "navigate"),
            ],
        )
        .await);
    auth_error(
        &navigation,
        403,
        "CROSS_SITE_NAVIGATION_LOGIN_BLOCKED",
        "Cross-site navigation login blocked. This request appears to be a CSRF attack.",
    );

    // Without cookies, Origin or fetch metadata (a plain HTTP client) the origin check does not apply.
    let plain = reqwest::Client::new()
        .post(format!("{}/api/auth/sign-in/email", app.base_url))
        .header("x-forwarded-for", agent.client_ip())
        .json(&body)
        .send()
        .await
        .expect("request");
    assert_eq!(plain.status().as_u16(), 200);

    // Localhost is trusted outside production only.
    let localhost = ok(app
        .anonymous()
        .send(
            reqwest::Method::POST,
            "/api/auth/sign-in/email",
            Some(body.clone()),
            &[("origin", "http://localhost")],
        )
        .await);
    match app.mode {
        Mode::Production => auth_error(&localhost, 403, "INVALID_ORIGIN", "Invalid origin"),
        Mode::Development => assert_eq!(localhost.status.as_u16(), 200, "{}", localhost.text()),
    }
}

#[tokio::test]
async fn get_session_returns_the_session_and_user() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let response = user.get("/api/auth/get-session").await;
    assert_eq!(response.status.as_u16(), 200);
    assert_eq!(
        response
            .headers
            .get("cache-control")
            .and_then(|v| v.to_str().ok()),
        Some("no-store")
    );
    let body: SessionWithUser = ok(response.dto());
    assert_eq!(body.user.id.0, user.id);
    assert_eq!(body.session.user_id.0, user.id);
    assert_eq!(
        (body.session.ip_address, body.session.user_agent),
        (None, None)
    );
    let token = signed_cookie_token(
        &app.env.better_auth_secret,
        user.agent.cookie(&app.session_cookie()).expect("cookie"),
    );
    assert_eq!(token.as_deref(), Some(body.session.token.as_str()));
    assert!(
        set_cookies_named(&response, &app.session_cookie()).is_empty(),
        "a fresh session is not re-issued"
    );
}

#[tokio::test]
async fn get_session_without_a_valid_cookie_is_null() {
    let app = TestApp::spawn().await;
    let user = app.user().await;
    let cookie = user
        .agent
        .cookie(&app.session_cookie())
        .expect("cookie")
        .to_owned();
    let (token, _) = cookie.rsplit_once('.').expect("signed value");
    let token = token.to_owned();
    let tampered = format!("{token}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA%3D");
    for value in [
        None,
        Some(tampered),
        Some(token),
        Some(format!("unknown{}.{}", hex(12), "x".repeat(10))),
    ] {
        let mut agent = app.anonymous();
        if let Some(value) = &value {
            agent.set_cookie(&app.session_cookie(), value);
        }
        let response = ok(agent.get("/api/auth/get-session").await.expect_status(200));
        assert_eq!(ok(response.value()), json!(null), "{value:?}");
    }
}

#[tokio::test]
async fn an_expired_session_is_deleted_and_its_cookies_expired() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    sqlx::query("UPDATE session SET expires_at = now() - interval '1 minute' WHERE user_id = $1")
        .bind(&user.id)
        .execute(&app.db)
        .await
        .expect("expire session");
    // The cookie cache would still answer from session_data; the stored session decides.
    let data = app.auth_cookie("session_data");
    let cookies = user.agent.cookies();
    let mut agent = app.anonymous();
    for (name, value) in cookies.iter().filter(|(name, _)| *name != data) {
        agent.set_cookie(name, value);
    }
    let response = ok(agent.get("/api/auth/get-session").await.expect_status(200));
    assert_eq!(ok(response.value()), json!(null));
    let expired = set_cookies_named(&response, &app.session_cookie());
    assert!(
        expired.iter().any(|c| c.contains("Max-Age=0")),
        "{expired:?}"
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM session WHERE user_id = $1",
            &user.id
        )
        .await,
        0
    );
    let me: MeResponse = ok(user.get("/api/me").await.dto());
    match app.backend {
        // The original agent still holds session_data, which TypeScript trusts for five minutes.
        Backend::TypeScript => assert_eq!(me.user.map(|u| u.id.0), Some(user.id.clone())),
        Backend::Rust => assert_eq!(me.user, None),
    }
}

#[tokio::test]
async fn a_session_older_than_a_day_is_renewed_for_fourteen_days() {
    let app = TestApp::spawn().await;
    let user = app.user().await;
    // Thirteen days left means it was issued (or last renewed) a day ago.
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
    let response = ok(agent.get("/api/auth/get-session").await.expect_status(200));
    let body: SessionWithUser = ok(response.dto());
    let renewed = set_cookies_named(&response, &app.session_cookie());
    assert_eq!(renewed.len(), 1, "{renewed:?}");
    assert!(renewed[0].contains("Max-Age=1209600"), "{}", renewed[0]);
    let days_left: f64 = sqlx::query_scalar(
        "SELECT extract(epoch FROM expires_at - (now() AT TIME ZONE 'UTC'))::float8 / 86400 FROM session WHERE token = $1",
    )
    .bind(&body.session.token)
    .fetch_one(&app.db)
    .await
    .expect("session");
    assert!((13.99..=14.01).contains(&days_left), "{days_left}");
}

#[tokio::test]
async fn sign_out_deletes_the_session_and_expires_the_cookies() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let response = user.post("/api/auth/sign-out", json!({})).await;
    let body: SuccessFlag = ok(response.expect_status(200).and_then(|r| r.dto()));
    assert!(body.success);
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM session WHERE user_id = $1",
            &user.id
        )
        .await,
        0
    );
    assert!(user.agent.cookie(&app.session_cookie()).is_none());
    let session = ok(user
        .get("/api/auth/get-session")
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    assert_eq!(session, json!(null));
}

#[tokio::test]
async fn sign_out_expires_every_auth_cookie() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let response = user.post("/api/auth/sign-out", json!({})).await;
    for suffix in ["session_token", "session_data", "dont_remember"] {
        let name = app.auth_cookie(suffix);
        let cookies = set_cookies_named(&response, &name);
        assert!(
            cookies.iter().any(|c| c.contains("Max-Age=0")),
            "{name} not expired: {:?}",
            response.set_cookies()
        );
    }
    let step_up = set_cookies_named(&response, "solace-passkey-step-up");
    assert!(
        step_up.iter().any(|c| c.contains("Max-Age=0")),
        "{step_up:?}"
    );
}

#[tokio::test]
async fn sign_out_without_a_session_still_succeeds() {
    let app = TestApp::spawn().await;
    let mut agent = app.anonymous();
    let body: SuccessFlag = ok(agent
        .post("/api/auth/sign-out", json!({}))
        .await
        .and_then(|r| r.expect_status(200))
        .and_then(|r| r.dto()));
    assert!(body.success);
}

async fn second_session(app: &TestApp, user: &TestUser) -> solace_api_tests::client::Agent {
    let mut agent = app.anonymous();
    ok(agent
        .post(
            "/api/auth/sign-in/email",
            json!({"email": user.email, "password": user.password}),
        )
        .await
        .expect_status(200));
    agent
}

#[tokio::test]
async fn list_sessions_shows_only_the_users_own_sessions() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let _second = second_session(&app, &user).await;
    let _other = app.user().await;
    let sessions: Vec<AuthSession> = ok(user
        .get("/api/auth/list-sessions")
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(sessions.len(), 2);
    assert!(
        sessions
            .iter()
            .all(|s| s.user_id.0 == user.id && s.ip_address.is_none() && s.user_agent.is_none())
    );

    let mut anon = app.anonymous();
    let response = ok(anon.get("/api/auth/list-sessions").await);
    assert_eq!(response.status.as_u16(), 401, "{}", response.text());
}

#[tokio::test]
async fn revoke_session_only_touches_the_users_own_sessions() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let second = second_session(&app, &user).await;
    let mut other = app.user().await;
    let second_token = signed_cookie_token(
        &app.env.better_auth_secret,
        second.cookie(&app.session_cookie()).expect("cookie"),
    )
    .expect("token");
    let other_token = signed_cookie_token(
        &app.env.better_auth_secret,
        other.agent.cookie(&app.session_cookie()).expect("cookie"),
    )
    .expect("token");

    let foreign: StatusFlag = ok(user
        .post("/api/auth/revoke-session", json!({"token": other_token}))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert!(
        foreign.status,
        "Better Auth answers true but leaves other users' sessions alone"
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM session WHERE token = $1",
            &other_token
        )
        .await,
        1
    );
    let still: SessionWithUser = ok(other.get("/api/auth/get-session").await.dto());
    assert_eq!(still.user.id.0, other.id);

    let own: StatusFlag = ok(user
        .post("/api/auth/revoke-session", json!({"token": second_token}))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert!(own.status);
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM session WHERE token = $1",
            &second_token
        )
        .await,
        0
    );
}

#[tokio::test]
async fn revoke_other_sessions_keeps_the_current_one() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let _a = second_session(&app, &user).await;
    let _b = second_session(&app, &user).await;
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM session WHERE user_id = $1",
            &user.id
        )
        .await,
        3
    );
    let body: StatusFlag = ok(user
        .post("/api/auth/revoke-other-sessions", json!({}))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert!(body.status);
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM session WHERE user_id = $1",
            &user.id
        )
        .await,
        1
    );
    let current: SessionWithUser = ok(user.get("/api/auth/get-session").await.dto());
    assert_eq!(current.user.id.0, user.id);
}

#[tokio::test]
async fn revoke_sessions_signs_out_everywhere() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let _a = second_session(&app, &user).await;
    let body: StatusFlag = ok(user
        .post("/api/auth/revoke-sessions", json!({}))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert!(body.status);
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM session WHERE user_id = $1",
            &user.id
        )
        .await,
        0
    );
}

#[tokio::test]
async fn revoked_sessions_stop_working_on_app_routes() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let mut second = second_session(&app, &user).await;
    ok(second
        .get("/api/settings")
        .await
        .and_then(|r| r.expect_status(200)));
    ok(user
        .post("/api/auth/revoke-other-sessions", json!({}))
        .await
        .expect_status(200));

    let response = ok(second.get("/api/settings").await);
    match app.backend {
        // Better Auth's five-minute session_data cookie cache keeps answering for a revoked session.
        Backend::TypeScript => assert_eq!(response.status.as_u16(), 200),
        // Rust reads the session row on every request.
        Backend::Rust => expect_unauthorized(&response),
    }
    let mut without_cache = app.anonymous();
    let data = app.auth_cookie("session_data");
    for (name, value) in second.cookies().iter().filter(|(name, _)| *name != data) {
        without_cache.set_cookie(name, value);
    }
    expect_unauthorized(&ok(without_cache.get("/api/settings").await));
}

#[tokio::test]
async fn session_cookies_carry_the_documented_attributes() {
    let app = TestApp::spawn().await;
    let user = app.user().await;
    let mut agent = app.anonymous();
    let response = ok(agent
        .post(
            "/api/auth/sign-in/email",
            json!({"email": user.email, "password": user.password}),
        )
        .await
        .expect_status(200));
    let cookie = set_cookies_named(&response, &app.session_cookie());
    let cookie = cookie.first().expect("session cookie");
    for attribute in ["Max-Age=1209600", "Path=/", "HttpOnly", "SameSite=Lax"] {
        assert!(cookie.contains(attribute), "{attribute} missing: {cookie}");
    }
    match app.mode {
        Mode::Development => {
            assert!(
                cookie.contains("Domain=localhost") && !cookie.contains("Secure"),
                "{cookie}"
            );
        }
        Mode::Production => {
            assert!(
                cookie.contains("Domain=solace.test") && cookie.contains("Secure"),
                "{cookie}"
            );
        }
    }
    if app.backend == Backend::Rust {
        // Production's legacy host-scoped clears name session_data too; only a cache that is set would be wrong.
        assert!(
            set_cookies_named(&response, &app.auth_cookie("session_data"))
                .iter()
                .all(|c| c.contains("Max-Age=0")),
            "Rust has no session_data cookie cache: {:?}",
            response.set_cookies()
        );
    }
}

#[tokio::test]
async fn me_and_user_report_the_session_user() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let me: MeResponse = ok(user
        .get("/api/me")
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(me.user.map(|u| u.id.0), Some(user.id.clone()));
    let current: solace_api_types::auth::AuthUser = ok(user
        .get("/api/user")
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(current.email, user.email);

    let mut anon = app.anonymous();
    let me: MeResponse = ok(anon
        .get("/api/me")
        .await
        .and_then(|r| r.expect_status(200))
        .and_then(|r| r.dto()));
    assert_eq!(me.user, None);
    expect_unauthorized(&ok(anon.get("/api/user").await));
}

#[tokio::test]
async fn production_expires_legacy_host_scoped_cookies_except_for_expo() {
    let app = TestApp::spawn().await;
    let user = app.user().await;
    if app.mode == Mode::Development {
        let mut browser = app.anonymous();
        let response = ok(browser
            .post(
                "/api/auth/sign-in/email",
                json!({"email": user.email, "password": user.password}),
            )
            .await
            .expect_status(200));
        let cleared: Vec<_> = response
            .set_cookies()
            .into_iter()
            .filter(|c| c.starts_with("better-auth.") && c.contains("Max-Age=0"))
            .collect();
        assert!(
            cleared.is_empty(),
            "no legacy clears outside production: {cleared:?}"
        );
        return;
    }
    let body = json!({"email": user.email, "password": user.password});
    let mut browser = app.anonymous();
    // A chunked cookie the request still carries is expired along with the default names.
    browser.set_cookie(&app.auth_cookie("session_data.0"), "chunk");
    let response = ok(browser
        .post("/api/auth/sign-in/email", body.clone())
        .await
        .expect_status(200));
    for suffix in [
        "session_token",
        "session_data",
        "session_data.0",
        "dont_remember",
        "account_data",
    ] {
        let name = app.auth_cookie(suffix);
        let expired: Vec<_> = set_cookies_named(&response, &name)
            .into_iter()
            .filter(|c| c.contains("Max-Age=0"))
            .collect();
        assert!(
            expired.iter().any(|c| c.contains("Domain=api.solace.test"))
                && expired.iter().any(|c| !c.contains("Domain=")),
            "{name}: {expired:?}"
        );
    }
    assert!(
        browser.cookie(&app.session_cookie()).is_some(),
        "the new Domain=solace.test cookie survives"
    );

    let mut expo = app.expo("solace");
    let response = ok(expo
        .post("/api/auth/sign-in/email", body)
        .await
        .expect_status(200));
    let expired: Vec<_> = response
        .set_cookies()
        .into_iter()
        .filter(|c| c.contains("Max-Age=0") && c.starts_with("__Secure-better-auth."))
        .collect();
    assert!(
        expired.is_empty(),
        "a name-keyed Expo jar would lose its new session: {expired:?}"
    );
    assert!(expo.cookie(&app.session_cookie()).is_some());
}

#[tokio::test]
async fn app_routes_forward_every_renewal_cookie() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let fresh = user.get("/api/settings").await;
    assert!(
        set_cookies_named(&fresh, &app.session_cookie()).is_empty(),
        "a fresh session is not renewed: {:?}",
        fresh.set_cookies()
    );
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
    let response = ok(agent.get("/api/settings").await.expect_status(200));
    let renewed = set_cookies_named(&response, &app.session_cookie());
    assert_eq!(renewed.len(), 1, "{:?}", response.set_cookies());
    assert!(renewed[0].contains("Max-Age=1209600"));
    if app.backend == Backend::TypeScript {
        assert!(
            response.set_cookies().len() >= 2,
            "the renewed token and the refreshed cookie cache both arrive: {:?}",
            response.set_cookies()
        );
    }
}

#[tokio::test]
async fn sign_up_refuses_reserved_system_addresses() {
    let app = TestApp::spawn().await;
    let mut agent = app.anonymous();
    for email in ["admin@solace.onl", "postmaster@solace.onl"] {
        let response = ok(agent
            .post(
                "/api/auth/sign-up/email",
                json!({"email": email, "password": "solace-test-password", "name": "Reserved"}),
            )
            .await);
        assert_eq!(response.status.as_u16(), 403, "{email}");
        assert_eq!(
            ok(response.value()),
            json!({"message": "That email address is reserved."}),
            "{email}"
        );
    }
}
