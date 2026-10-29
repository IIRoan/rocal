//! Password change, auth keys, verification and profile updates through Better Auth; forgotten passwords go to support.

use serde_json::{Value, json};
use solace_api_tests::client::ResponseResult;
use solace_api_types::auth::{SessionWithUser, StatusFlag};

use crate::helpers::{
    TestApp, TestUser, auth_error, auth_key, count, ok, set_cookies_named, signed_cookie_token,
};

const UPDATED_SUBJECT: &str = "Your Solace password was updated";
/// Written by the TypeScript backend at sign-up for `LEGACY_PASSWORD`, before clients derived auth keys.
const LEGACY_HASH: &str = "dd9606626dae5b0a239158deba3bd517:f7ceb36210bb220f924c0085423c00d4fd9cfc3bc6c0bdf8d0907357c7610cbd52744f7c0016cade759d4a39954470e3c7ee2aad0761b3103637fdae72e4d86a";
const LEGACY_PASSWORD: &str = "solace-test-pw-123";

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
    assert!(
        text.contains("email support@solace.onl from another address"),
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
async fn a_legacy_hash_takes_the_raw_password_once_then_the_auth_key() {
    let app = TestApp::spawn().await;
    let user = app.user().await;
    sqlx::query(
        "UPDATE account SET password = $1 WHERE user_id = $2 AND provider_id = 'credential'",
    )
    .bind(LEGACY_HASH)
    .bind(&user.id)
    .execute(&app.db)
    .await
    .expect("legacy hash");
    let key = auth_key(LEGACY_PASSWORD, &user.email);
    let mut agent = app.anonymous();
    let refused = ok(agent
        .post(
            "/api/auth/sign-in/email",
            json!({"email": user.email, "password": key}),
        )
        .await);
    auth_error(
        &refused,
        400,
        "PASSWORD_UPGRADE_REQUIRED",
        "Send the password once more to finish upgrading its protection",
    );
    assert_eq!(password_hash(&app, &user).await, LEGACY_HASH);
    assert_eq!(
        sign_in_status(&app, &user.email, LEGACY_PASSWORD).await,
        200
    );
    assert!(password_hash(&app, &user).await.starts_with("ak1:"));
    assert_eq!(sign_in_status(&app, &user.email, &key).await, 200);
    assert_eq!(
        sign_in_status(&app, &user.email, LEGACY_PASSWORD).await,
        200,
        "shipped binaries still send the raw password"
    );
    let wrong = auth_key("solace-test-wrong", &user.email);
    assert_eq!(sign_in_status(&app, &user.email, &wrong).await, 401);
}

#[tokio::test]
async fn change_password_takes_auth_keys_salted_with_the_account_email() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let current = auth_key(&user.password, &user.email);
    let new = auth_key("solace-test-changed-password", &user.email);
    let before = password_hash(&app, &user).await;
    let elsewhere = user
        .post(
            "/api/auth/change-password",
            json!({"currentPassword": current, "newPassword": new, "email": "someone@else.test"}),
        )
        .await;
    auth_error(
        &elsewhere,
        400,
        "AUTH_KEY_EMAIL_MISMATCH",
        "Enter the email address of this account",
    );
    assert_eq!(password_hash(&app, &user).await, before);
    ok(user
        .post(
            "/api/auth/change-password",
            json!({"currentPassword": current, "newPassword": new, "email": user.email.to_uppercase()}),
        )
        .await
        .expect_status(200));
    assert_eq!(sign_in_status(&app, &user.email, &new).await, 200);
    assert_eq!(
        sign_in_status(&app, &user.email, "solace-test-changed-password").await,
        200,
        "the API derives the same key from a raw password"
    );
    assert_eq!(sign_in_status(&app, &user.email, &current).await, 401);
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
    let long = user
        .post(
            "/api/auth/verify-password",
            json!({"password": "x".repeat(129)}),
        )
        .await;
    auth_error(&long, 400, "PASSWORD_TOO_LONG", "Password too long");
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
async fn set_password_reset_and_delete_user_are_not_exposed() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    for path in [
        "/api/auth/set-password",
        "/api/auth/request-password-reset",
        "/api/auth/reset-password",
        "/api/auth/delete-user",
    ] {
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
