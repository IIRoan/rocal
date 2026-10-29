//! Password change, auth keys, verification and profile updates through Better Auth; forgotten passwords go to support.

use serde_json::{Value, json};
use solace_api_tests::client::ResponseResult;
use solace_api_tests::seed::fake_token;
use solace_api_types::auth::{SessionWithUser, StatusFlag};

use crate::helpers::{
    TestApp, TestUser, auth_error, auth_key, count, hex, ok, set_cookies_named, signed_cookie_token,
};

const UPDATED_SUBJECT: &str = "Your Solace password was updated";

/// A password and the hash the TypeScript backend wrote for it at sign-up, before clients derived auth keys.
fn legacy_credential() -> (String, String) {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../apps/backend/tests/fixtures/passwords.json"
    );
    let vectors: Value =
        serde_json::from_str(&std::fs::read_to_string(path).expect("password vectors"))
            .expect("password vectors json");
    let field = |name: &str| {
        vectors["legacyHash"][name]
            .as_str()
            .expect("legacy hash vector")
            .to_owned()
    };
    (field("password"), field("hash"))
}

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
    let (legacy_password, legacy_hash) = legacy_credential();
    sqlx::query(
        "UPDATE account SET password = $1 WHERE user_id = $2 AND provider_id = 'credential'",
    )
    .bind(&legacy_hash)
    .bind(&user.id)
    .execute(&app.db)
    .await
    .expect("legacy hash");
    let key = auth_key(&legacy_password, &user.email);
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
    assert_eq!(password_hash(&app, &user).await, legacy_hash);
    assert_eq!(
        sign_in_status(&app, &user.email, &legacy_password).await,
        200
    );
    assert!(password_hash(&app, &user).await.starts_with("ak1:"));
    assert_eq!(sign_in_status(&app, &user.email, &key).await, 200);
    assert_eq!(
        sign_in_status(&app, &user.email, &legacy_password).await,
        200,
        "shipped binaries still send the raw password"
    );
    let wrong = auth_key(&format!("solace-test-{}", hex(8)), &user.email);
    assert_eq!(sign_in_status(&app, &user.email, &wrong).await, 401);
}

#[tokio::test]
async fn a_legacy_upgrade_never_undoes_a_password_changed_meanwhile() {
    const SET_PASSWORD: &str =
        "UPDATE account SET password = $1 WHERE user_id = $2 AND provider_id = 'credential'";
    let app = TestApp::spawn().await;
    let user = app.user().await;
    let (legacy_password, legacy_hash) = legacy_credential();
    sqlx::query(SET_PASSWORD)
        .bind(&legacy_hash)
        .bind(&user.id)
        .execute(&app.db)
        .await
        .expect("legacy hash");
    let changed = format!("ak1:changed-{}", hex(8));
    let (db, user_id, new_hash) = (&app.db, &user.id, &changed);
    // Holding the credential row parks the sign-in's upgrade until this "password change" commits.
    let change = async move {
        let mut lock = db.begin().await.expect("transaction");
        let pid: i32 = sqlx::query_scalar("SELECT pg_backend_pid()")
            .fetch_one(&mut *lock)
            .await
            .expect("backend pid");
        sqlx::query(
            "SELECT 1 FROM account WHERE user_id = $1 AND provider_id = 'credential' FOR UPDATE",
        )
        .bind(user_id)
        .execute(&mut *lock)
        .await
        .expect("row lock");
        let blocked = "SELECT count(*) FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))";
        for attempt in 0.. {
            let waiting: i64 = sqlx::query_scalar(blocked)
                .bind(pid)
                .fetch_one(db)
                .await
                .expect("blocked queries");
            if waiting > 0 {
                break;
            }
            assert!(attempt < 400, "the sign-in never reached its upgrade");
            tokio::time::sleep(std::time::Duration::from_millis(25)).await;
        }
        sqlx::query(SET_PASSWORD)
            .bind(new_hash)
            .bind(user_id)
            .execute(&mut *lock)
            .await
            .expect("changed hash");
        lock.commit().await.expect("commit");
    };
    let (status, ()) = tokio::join!(sign_in_status(&app, &user.email, &legacy_password), change);
    assert_eq!(
        status, 200,
        "the raw password was valid when it was checked"
    );
    assert_eq!(password_hash(&app, &user).await, changed);
}

#[tokio::test]
async fn change_password_takes_auth_keys_salted_with_the_account_email() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let current = auth_key(&user.password, &user.email);
    let changed = format!("solace-test-{}", hex(8));
    let new = auth_key(&changed, &user.email);
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
        sign_in_status(&app, &user.email, &changed).await,
        200,
        "the API derives the same key from a raw password"
    );
    assert_eq!(sign_in_status(&app, &user.email, &current).await, 401);
}

async fn envelope_salt(app: &TestApp, user: &TestUser) -> Option<String> {
    sqlx::query_scalar("SELECT kdf_salt FROM user_encryption_password WHERE user_id = $1")
        .bind(&user.id)
        .fetch_optional(&app.db)
        .await
        .expect("password envelope")
}

fn envelope(salt: &str) -> Value {
    json!({"kdfSalt": salt, "wrappedAccountKey": fake_token(), "wrappedSearchKey": fake_token()})
}

#[tokio::test]
async fn change_password_stores_the_envelope_for_the_new_password_with_it() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    ok(user
        .put("/api/e2ee/password", envelope("salt-for-the-old-password"))
        .await
        .expect_status(200));
    let current = user.password.clone();
    ok(user
        .post(
            "/api/auth/change-password",
            json!({
                "currentPassword": current,
                "newPassword": "solace-test-changed-password",
                "passwordEnvelope": envelope(" salt-for-the-new-password "),
            }),
        )
        .await
        .expect_status(200));
    assert_eq!(
        envelope_salt(&app, &user).await.as_deref(),
        Some("salt-for-the-new-password")
    );
    assert_eq!(
        sign_in_status(&app, &user.email, "solace-test-changed-password").await,
        200
    );
}

#[tokio::test]
async fn a_refused_password_change_keeps_the_previous_password_and_envelope() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    ok(user
        .put("/api/e2ee/password", envelope("salt-for-the-old-password"))
        .await
        .expect_status(200));
    let before = password_hash(&app, &user).await;
    let current = user.password.clone();
    let wrong = user
        .post(
            "/api/auth/change-password",
            json!({
                "currentPassword": "solace-test-wrong",
                "newPassword": "solace-test-changed-password",
                "passwordEnvelope": envelope("salt-for-the-new-password"),
            }),
        )
        .await;
    auth_error(&wrong, 400, "INVALID_PASSWORD", "Invalid password");
    for broken in [
        json!({"kdfSalt": "salt-for-the-new-password", "wrappedAccountKey": fake_token()}),
        envelope("   "),
    ] {
        let response = user
            .post(
                "/api/auth/change-password",
                json!({
                    "currentPassword": current,
                    "newPassword": "solace-test-changed-password",
                    "passwordEnvelope": broken,
                }),
            )
            .await;
        assert_eq!(response.status.as_u16(), 400, "{}", response.text());
    }
    assert_eq!(password_hash(&app, &user).await, before);
    assert_eq!(
        envelope_salt(&app, &user).await.as_deref(),
        Some("salt-for-the-old-password")
    );
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
