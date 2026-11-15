//! Recovery kits: storing one behind the current password and step-up, and the reset that consumes it.

use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use solace_api_tests::client::{Agent, ResponseResult};
use solace_api_tests::seed::{fake_envelope, fake_token, passkey_sign_in};
use solace_api_types::e2ee::RecoveryKitStatus;

use crate::helpers::{
    TestApp, TestUser, auth_error, auth_key, count, expect_field_error, expect_unauthorized, hex,
    ok,
};
use crate::passkeys::register;

const INVALID_KIT: (&str, &str) = (
    "INVALID_RECOVERY_KIT",
    "Email or recovery key is incorrect.",
);

fn recovery_auth_key() -> String {
    format!("rk1:{}", fake_token())
}

fn kit_request(user: &TestUser, recovery_key: &str) -> Value {
    json!({
        "currentPassword": auth_key(&user.password, &user.email),
        "recoveryAuthKey": recovery_key,
        "wrappedAccountKey": fake_envelope(),
        "wrappedSearchKey": fake_envelope(),
    })
}

async fn create_kit(user: &mut TestUser) -> String {
    let key = recovery_auth_key();
    let body = kit_request(user, &key);
    ok(user
        .put("/api/e2ee/recovery-kit", body)
        .await
        .expect_status(200));
    key
}

fn password_envelope() -> Value {
    json!({
        "kdfAlgorithm": "Argon2id",
        "kdfSalt": fake_token(),
        "kdfIterations": 3,
        "kdfMemoryKiB": 65536,
        "kdfParallelism": 4,
        "wrappedAccountKey": fake_envelope(),
        "wrappedSearchKey": fake_envelope(),
    })
}

fn complete_body(user: &TestUser, key: &str, new_password: &str) -> Value {
    json!({
        "email": user.email,
        "recoveryAuthKey": key,
        "newPassword": auth_key(new_password, &user.email),
        "passwordEnvelope": password_envelope(),
    })
}

async fn sign_in_status(app: &TestApp, email: &str, password: &str) -> u16 {
    ok(app
        .anonymous()
        .post(
            "/api/auth/sign-in/email",
            json!({"email": email, "password": password}),
        )
        .await)
    .status
    .as_u16()
}

async fn start(agent: &mut Agent, email: &str, key: &str) -> solace_api_tests::client::ApiResponse {
    ok(agent
        .post(
            "/api/auth/recovery/start",
            json!({"email": email, "recoveryAuthKey": key}),
        )
        .await)
}

#[tokio::test]
async fn a_kit_is_stored_behind_the_current_password_and_reported_by_status() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let status: RecoveryKitStatus = ok(user.get("/api/e2ee/recovery-kit").await.dto());
    assert_eq!(
        status,
        RecoveryKitStatus {
            exists: false,
            created_at: None
        }
    );

    let key = recovery_auth_key();
    let mut wrong = kit_request(&user, &key);
    wrong["currentPassword"] = json!(auth_key("solace-test-wrong", &user.email));
    expect_field_error(
        &user.put("/api/e2ee/recovery-kit", wrong).await,
        "Incorrect password",
        "currentPassword",
    );
    let mut malformed = kit_request(&user, &key);
    malformed["recoveryAuthKey"] = json!(format!("ak1:{}", fake_token()));
    expect_field_error(
        &user.put("/api/e2ee/recovery-kit", malformed).await,
        "Recovery key is malformed",
        "recoveryAuthKey",
    );
    let mut extra = kit_request(&user, &key);
    extra["recoveryKey"] = json!("ABCD-EFGH");
    assert_eq!(
        user.put("/api/e2ee/recovery-kit", extra)
            .await
            .status
            .as_u16(),
        400,
        "the key itself is never accepted"
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM user_recovery_kit WHERE user_id = $1",
            &user.id
        )
        .await,
        0
    );

    let body = kit_request(&user, &key);
    let stored: RecoveryKitStatus = ok(user
        .put("/api/e2ee/recovery-kit", body)
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert!(stored.exists && stored.created_at.is_some());
    assert_eq!(
        ok(user
            .get("/api/e2ee/recovery-kit")
            .await
            .dto::<RecoveryKitStatus>()),
        stored
    );
    let hash: String =
        sqlx::query_scalar("SELECT auth_key_hash FROM user_recovery_kit WHERE user_id = $1")
            .bind(&user.id)
            .fetch_one(&app.db)
            .await
            .expect("kit row");
    let expected: String = Sha256::digest(key.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    assert_eq!(hash, expected);

    let mut anonymous = app.anonymous();
    expect_unauthorized(&ok(anonymous.get("/api/e2ee/recovery-kit").await));
    let body = kit_request(&user, &key);
    expect_unauthorized(&ok(anonymous.put("/api/e2ee/recovery-kit", body).await));
    expect_unauthorized(&ok(anonymous.delete("/api/e2ee/recovery-kit").await));

    ok(user
        .delete("/api/e2ee/recovery-kit")
        .await
        .expect_status(200));
    assert!(
        !ok(user
            .get("/api/e2ee/recovery-kit")
            .await
            .dto::<RecoveryKitStatus>())
        .exists
    );
    assert_eq!(
        user.delete("/api/e2ee/recovery-kit").await.status.as_u16(),
        404
    );
}

#[tokio::test]
async fn a_new_kit_replaces_the_old_one_and_tells_the_owner() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    app.plain_mailbox(user.local_part()).await;
    let first = create_kit(&mut user).await;
    let second = create_kit(&mut user).await;

    let mut agent = app.anonymous();
    let response = start(&mut agent, &user.email, &first).await;
    auth_error(&response, 401, INVALID_KIT.0, INVALID_KIT.1);
    ok(start(&mut agent, &user.email, &second)
        .await
        .expect_status(200));
    let message = app
        .wait_for_message(user.local_part(), "A new Solace recovery kit was created")
        .await;
    assert!(!message.to_string().contains(&second), "{message}");
}

#[tokio::test]
async fn storing_a_kit_needs_step_up_once_the_account_has_a_passkey() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let (mut passkey, _) = register(&app, &mut user, "Laptop").await;
    let mut password_only = app.anonymous();
    ok(password_only
        .post(
            "/api/auth/sign-in/email",
            json!({"email": user.email, "password": user.password}),
        )
        .await
        .expect_status(200));
    let response = ok(password_only
        .put(
            "/api/e2ee/recovery-kit",
            kit_request(&user, &recovery_auth_key()),
        )
        .await);
    assert_eq!(response.status.as_u16(), 403, "{}", response.text());

    let mut stepped_up = app.anonymous();
    ok(passkey_sign_in(&mut stepped_up, &mut passkey, &app.origin).await);
    ok(stepped_up
        .put(
            "/api/e2ee/recovery-kit",
            kit_request(&user, &recovery_auth_key()),
        )
        .await
        .expect_status(200));
}

#[tokio::test]
async fn start_answers_one_way_for_an_unknown_email_no_kit_and_a_wrong_key() {
    let app = TestApp::spawn().await;
    let mut with_kit = app.user().await;
    let without_kit = app.user().await;
    let key = create_kit(&mut with_kit).await;
    let mut agent = app.anonymous();

    let mut bodies = Vec::new();
    for (email, presented) in [
        (format!("nobody-{}@example.com", hex(6)), key.clone()),
        (without_kit.email.clone(), key.clone()),
        (with_kit.email.clone(), recovery_auth_key()),
        (with_kit.email.clone(), "rk1:short".to_owned()),
    ] {
        let response = start(&mut agent, &email, &presented).await;
        auth_error(&response, 401, INVALID_KIT.0, INVALID_KIT.1);
        bodies.push(response.text());
    }
    assert!(
        bodies.windows(2).all(|pair| pair[0] == pair[1]),
        "{bodies:?}"
    );

    let envelope = ok(start(&mut agent, &with_kit.email.to_uppercase(), &key)
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    let stored: (String, String) = sqlx::query_as(
        "SELECT wrapped_account_key, wrapped_search_key FROM user_recovery_kit WHERE user_id = $1",
    )
    .bind(&with_kit.id)
    .fetch_one(&app.db)
    .await
    .expect("kit");
    assert_eq!(
        envelope,
        json!({"wrappedAccountKey": stored.0, "wrappedSearchKey": stored.1, "keyVersion": 1})
    );
}

#[tokio::test]
async fn completing_a_recovery_resets_the_password_ends_sessions_and_consumes_the_kit() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    app.plain_mailbox(user.local_part()).await;
    let key = create_kit(&mut user).await;
    let mut other_device = app.anonymous();
    ok(other_device
        .post(
            "/api/auth/sign-in/email",
            json!({"email": user.email, "password": user.password}),
        )
        .await
        .expect_status(200));
    let new_password = format!("solace-test-{}", hex(8));
    let mut agent = app.anonymous();

    let mut raw = complete_body(&user, &key, &new_password);
    raw["newPassword"] = json!(new_password);
    auth_error(
        &ok(agent.post("/api/auth/recovery/complete", raw).await),
        400,
        "AUTH_KEY_REQUIRED",
        "Update Solace to reset your password",
    );
    let wrong_key = complete_body(&user, &recovery_auth_key(), &new_password);
    auth_error(
        &ok(agent.post("/api/auth/recovery/complete", wrong_key).await),
        401,
        INVALID_KIT.0,
        INVALID_KIT.1,
    );
    let unchanged = sqlx::query_scalar::<_, String>(
        "SELECT password FROM account WHERE user_id = $1 AND provider_id = 'credential'",
    )
    .bind(&user.id)
    .fetch_one(&app.db)
    .await
    .expect("password");

    let body = complete_body(&user, &key, &new_password);
    let salt = body["passwordEnvelope"]["kdfSalt"].clone();
    let done = ok(agent
        .post("/api/auth/recovery/complete", body)
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    assert_eq!(done, json!({"status": true}));

    assert_eq!(sign_in_status(&app, &user.email, &new_password).await, 200);
    assert_eq!(sign_in_status(&app, &user.email, &user.password).await, 401);
    let stored: String = sqlx::query_scalar(
        "SELECT password FROM account WHERE user_id = $1 AND provider_id = 'credential'",
    )
    .bind(&user.id)
    .fetch_one(&app.db)
    .await
    .expect("password");
    assert_ne!(stored, unchanged);
    let envelope: (String, String) = sqlx::query_as(
        "SELECT kdf_salt, kdf_algorithm FROM user_encryption_password WHERE user_id = $1",
    )
    .bind(&user.id)
    .fetch_one(&app.db)
    .await
    .expect("envelope");
    assert_eq!((json!(envelope.0), envelope.1.as_str()), (salt, "Argon2id"));

    for agent in [&mut user.agent, &mut other_device] {
        expect_unauthorized(&ok(agent.get("/api/settings").await));
    }
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM user_recovery_kit WHERE user_id = $1",
            &user.id
        )
        .await,
        0
    );
    auth_error(
        &start(&mut agent, &user.email, &key).await,
        401,
        INVALID_KIT.0,
        INVALID_KIT.1,
    );
    let again = complete_body(&user, &key, &format!("solace-test-{}", hex(8)));
    auth_error(
        &ok(agent.post("/api/auth/recovery/complete", again).await),
        401,
        INVALID_KIT.0,
        INVALID_KIT.1,
    );
    app.wait_for_message(
        user.local_part(),
        "Your Solace password was reset with your recovery kit",
    )
    .await;
}

#[tokio::test]
async fn a_recovery_can_remove_lost_passkeys() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let key = create_kit(&mut user).await;
    register(&app, &mut user, "Lost phone").await;
    let new_password = format!("solace-test-{}", hex(8));
    let mut remove = complete_body(&user, &key, &new_password);
    remove["removePasskeys"] = json!(true);
    ok(app
        .anonymous()
        .post("/api/auth/recovery/complete", remove)
        .await
        .expect_status(200));
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM passkey WHERE \"userId\" = $1",
            &user.id
        )
        .await,
        0
    );
    let mut signed_in = app.anonymous();
    ok(signed_in
        .post(
            "/api/auth/sign-in/email",
            json!({"email": user.email, "password": new_password}),
        )
        .await
        .expect_status(200));
    ok(signed_in.get("/api/settings").await.expect_status(200));
}

#[tokio::test]
async fn a_recovery_keeps_passkeys_unless_asked() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let key = create_kit(&mut user).await;
    register(&app, &mut user, "Laptop").await;
    let new_password = format!("solace-test-{}", hex(8));
    ok(app
        .anonymous()
        .post(
            "/api/auth/recovery/complete",
            complete_body(&user, &key, &new_password),
        )
        .await
        .expect_status(200));
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM passkey WHERE \"userId\" = $1",
            &user.id
        )
        .await,
        1
    );
}

#[tokio::test]
async fn start_allows_ten_attempts_per_client_in_fifteen_minutes() {
    let app = TestApp::spawn().await;
    let user = app.user().await;
    let mut agent = app.anonymous();
    for _ in 0..10 {
        assert_eq!(
            start(&mut agent, &user.email, &recovery_auth_key())
                .await
                .status
                .as_u16(),
            401
        );
    }
    let limited = start(&mut agent, &user.email, &recovery_auth_key()).await;
    assert_eq!(limited.status.as_u16(), 429, "{}", limited.text());
}
