//! Password change, reset by email, verification and profile updates through Better Auth.

use serde_json::{Value, json};
use solace_api_tests::client::ResponseResult;
use solace_api_types::auth::{SessionWithUser, StatusFlag};

use crate::helpers::{
    TestApp, TestUser, auth_error, count, ok, set_cookies_named, signed_cookie_token,
};

const RESET_SUBJECT: &str = "Reset your Solace password";
const UPDATED_SUBJECT: &str = "Your Solace password was updated";

async fn password_hash(app: &TestApp, user: &TestUser) -> String {
    sqlx::query_scalar(
        "SELECT password FROM account WHERE user_id = $1 AND provider_id = 'credential'",
    )
    .bind(&user.id)
    .fetch_one(&app.db)
    .await
    .expect("credential account")
}

async fn sign_in_status(app: &TestApp, email: &str, password: &str) -> u16 {
    let mut agent = app.anonymous();
    ok(agent
        .post(
            "/api/auth/sign-in/email",
            json!({"email": email, "password": password}),
        )
        .await)
    .status
    .as_u16()
}

fn text_body(message: &Value) -> String {
    let part = message["textBody"][0]["partId"]
        .as_str()
        .unwrap_or_default();
    message["bodyValues"][part]["value"]
        .as_str()
        .unwrap_or_default()
        .to_owned()
}

#[tokio::test]
async fn change_password_needs_the_current_password_and_a_valid_new_one() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let before = password_hash(&app, &user).await;
    let wrong = user
        .post(
            "/api/auth/change-password",
            json!({"currentPassword": "solace-test-wrong", "newPassword": "solace-test-new-password"}),
        )
        .await;
    auth_error(&wrong, 400, "INVALID_PASSWORD", "Invalid password");
    let current = user.password.clone();
    let short = user
        .post(
            "/api/auth/change-password",
            json!({"currentPassword": current, "newPassword": "short"}),
        )
        .await;
    auth_error(&short, 400, "PASSWORD_TOO_SHORT", "Password too short");
    assert_eq!(password_hash(&app, &user).await, before);
}

#[tokio::test]
async fn change_password_replaces_the_hash_and_mails_a_confirmation() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    app.plain_mailbox(user.local_part()).await;
    let before = password_hash(&app, &user).await;
    let current = user.password.clone();
    let response = user
        .post(
            "/api/auth/change-password",
            json!({"currentPassword": current, "newPassword": "solace-test-changed-password"}),
        )
        .await;
    let body = ok(response.expect_status(200).and_then(|r| r.value()));
    assert_eq!(body["user"]["id"], json!(user.id));
    assert_eq!(
        body["token"],
        json!(null),
        "no new session without revokeOtherSessions"
    );
    assert_ne!(password_hash(&app, &user).await, before);
    assert_eq!(sign_in_status(&app, &user.email, &current).await, 401);
    assert_eq!(
        sign_in_status(&app, &user.email, "solace-test-changed-password").await,
        200
    );

    let message = app
        .wait_for_message(user.local_part(), UPDATED_SUBJECT)
        .await;
    let text = text_body(&message);
    assert!(text.contains(&format!("Hi {},", user.name)), "{text}");
    assert!(
        text.contains("This is a confirmation that your Solace password was changed."),
        "{text}"
    );
    assert_eq!(
        message["from"][0]["email"],
        json!(format!("noreply@{}", app.env.mail_domain))
    );
}

#[tokio::test]
async fn change_password_can_revoke_the_other_sessions() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let mut other = app.anonymous();
    ok(other
        .post(
            "/api/auth/sign-in/email",
            json!({"email": user.email, "password": user.password}),
        )
        .await
        .expect_status(200));
    let current = user.password.clone();
    let old_cookie = user
        .agent
        .cookie(&app.session_cookie())
        .expect("cookie")
        .to_owned();
    let response = user
        .post(
            "/api/auth/change-password",
            json!({"currentPassword": current, "newPassword": "solace-test-changed-password", "revokeOtherSessions": true}),
        )
        .await;
    let body = ok(response.expect_status(200).and_then(|r| r.value()));
    let token = body["token"]
        .as_str()
        .expect("a fresh session token")
        .to_owned();
    let issued = signed_cookie_token(
        &app.env.better_auth_secret,
        user.agent.cookie(&app.session_cookie()).expect("cookie"),
    );
    assert_eq!(issued.as_deref(), Some(token.as_str()));
    assert_ne!(
        user.agent.cookie(&app.session_cookie()),
        Some(old_cookie.as_str())
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM session WHERE user_id = $1",
            &user.id
        )
        .await,
        1
    );
    let session: SessionWithUser = ok(user.get("/api/auth/get-session").await.dto());
    assert_eq!(session.session.token, token);
}

#[tokio::test]
async fn a_password_reset_round_trip() {
    let app = TestApp::spawn().await;
    let user = app.user().await;
    app.plain_mailbox(user.local_part()).await;
    let mut agent = app.anonymous();
    let redirect = format!("{}/reset-password", app.origin);
    let requested = ok(agent
        .post(
            "/api/auth/request-password-reset",
            json!({"email": user.email, "redirectTo": redirect}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    assert_eq!(
        requested,
        json!({"status": true, "message": "If this email exists in our system, check your email for the reset link"})
    );

    let message = app.wait_for_message(user.local_part(), RESET_SUBJECT).await;
    let text = text_body(&message);
    let link = text
        .lines()
        .find(|line| line.contains("/api/auth/reset-password/"))
        .expect("reset link")
        .to_owned();
    let token = link
        .split("/api/auth/reset-password/")
        .nth(1)
        .and_then(|rest| rest.split('?').next())
        .expect("token")
        .to_owned();
    assert_eq!(token.len(), 24, "{link}");
    let encoded_redirect: String =
        url::form_urlencoded::byte_serialize(redirect.as_bytes()).collect();
    assert!(
        link.ends_with(&format!("?callbackURL={encoded_redirect}")),
        "{link}"
    );
    let stored: String = sqlx::query_scalar("SELECT value FROM verification WHERE identifier = $1")
        .bind(format!("reset-password:{token}"))
        .fetch_one(&app.db)
        .await
        .expect("verification row");
    assert_eq!(stored, user.id);

    let callback = ok(agent
        .get(&format!(
            "/api/auth/reset-password/{token}?callbackURL={encoded_redirect}"
        ))
        .await);
    assert_eq!(callback.status.as_u16(), 302);
    assert_eq!(
        callback
            .headers
            .get("location")
            .and_then(|v| v.to_str().ok()),
        Some(format!("{redirect}?token={token}").as_str())
    );

    let reset: StatusFlag = ok(agent
        .post(
            "/api/auth/reset-password",
            json!({"newPassword": "solace-test-reset-password", "token": token}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert!(reset.status);
    assert_eq!(sign_in_status(&app, &user.email, &user.password).await, 401);
    assert_eq!(
        sign_in_status(&app, &user.email, "solace-test-reset-password").await,
        200
    );
    let again = ok(agent
        .post(
            "/api/auth/reset-password",
            json!({"newPassword": "solace-test-other-password", "token": token}),
        )
        .await);
    auth_error(&again, 400, "INVALID_TOKEN", "Invalid token");

    let updated = app
        .wait_for_message(user.local_part(), UPDATED_SUBJECT)
        .await;
    assert!(
        text_body(&updated).contains("password was reset."),
        "{}",
        text_body(&updated)
    );
}

#[tokio::test]
async fn a_reset_for_an_unknown_email_looks_the_same() {
    let app = TestApp::spawn().await;
    let mut agent = app.anonymous();
    let email = format!("nobody{}@{}", crate::helpers::hex(5), app.env.mail_domain);
    let body = ok(agent
        .post(
            "/api/auth/request-password-reset",
            json!({"email": email, "redirectTo": format!("{}/reset-password", app.origin)}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    assert_eq!(body["status"], json!(true));
}

#[tokio::test]
async fn reset_redirects_must_be_trusted() {
    let app = TestApp::spawn().await;
    let user = app.user().await;
    let mut agent = app.anonymous();
    let response = ok(agent
        .post(
            "/api/auth/request-password-reset",
            json!({"email": user.email, "redirectTo": "https://evil.example/reset"}),
        )
        .await);
    auth_error(
        &response,
        403,
        "INVALID_REDIRECT_URL",
        "Invalid redirectURL",
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM verification WHERE value = $1",
            &user.id
        )
        .await,
        0
    );
}

#[tokio::test]
async fn reset_tokens_must_exist_and_be_unexpired() {
    let app = TestApp::spawn().await;
    let user = app.user().await;
    let mut agent = app.anonymous();
    let bogus = ok(agent
        .post(
            "/api/auth/reset-password",
            json!({"newPassword": "solace-test-new-password", "token": "bogus"}),
        )
        .await);
    auth_error(&bogus, 400, "INVALID_TOKEN", "Invalid token");

    ok(agent
        .post(
            "/api/auth/request-password-reset",
            json!({"email": user.email, "redirectTo": format!("{}/reset-password", app.origin)}),
        )
        .await
        .expect_status(200));
    let identifier: String = sqlx::query_scalar(
        "SELECT identifier FROM verification WHERE value = $1 AND identifier LIKE 'reset-password:%'",
    )
    .bind(&user.id)
    .fetch_one(&app.db)
    .await
    .expect("verification row");
    sqlx::query(
        "UPDATE verification SET expires_at = now() - interval '1 minute' WHERE identifier = $1",
    )
    .bind(&identifier)
    .execute(&app.db)
    .await
    .expect("expire token");
    let token = identifier.trim_start_matches("reset-password:");
    let expired = ok(agent
        .post(
            "/api/auth/reset-password",
            json!({"newPassword": "solace-test-new-password", "token": token}),
        )
        .await);
    auth_error(&expired, 400, "INVALID_TOKEN", "Invalid token");
    assert_eq!(sign_in_status(&app, &user.email, &user.password).await, 200);
}

#[tokio::test]
async fn verify_password_checks_the_current_password() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let password = user.password.clone();
    let ok_body: StatusFlag = ok(user
        .post("/api/auth/verify-password", json!({"password": password}))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert!(ok_body.status);
    let wrong = user
        .post(
            "/api/auth/verify-password",
            json!({"password": "solace-test-wrong"}),
        )
        .await;
    auth_error(&wrong, 400, "INVALID_PASSWORD", "Invalid password");
}

#[tokio::test]
async fn update_user_renames_and_reissues_the_session_cookie() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let response = user
        .post("/api/auth/update-user", json!({"name": "Renamed Person"}))
        .await;
    assert_eq!(set_cookies_named(&response, &app.session_cookie()).len(), 1);
    let body: StatusFlag = ok(response.expect_status(200).and_then(|r| r.dto()));
    assert!(body.status);
    let name: String = sqlx::query_scalar("SELECT name FROM \"user\" WHERE id = $1")
        .bind(&user.id)
        .fetch_one(&app.db)
        .await
        .expect("user");
    assert_eq!(name, "Renamed Person");
    let session: SessionWithUser = ok(user.get("/api/auth/get-session").await.dto());
    assert_eq!(session.user.name, "Renamed Person");
}

#[tokio::test]
async fn set_password_and_delete_user_are_not_exposed() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    for path in ["/api/auth/set-password", "/api/auth/delete-user"] {
        let response = user
            .post(path, json!({"newPassword": "solace-test-new-password"}))
            .await;
        assert_eq!(response.status.as_u16(), 404, "{path}: {}", response.text());
        assert!(response.body.is_empty(), "{path}");
    }
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM \"user\" WHERE id = $1",
            &user.id
        )
        .await,
        1
    );
}
