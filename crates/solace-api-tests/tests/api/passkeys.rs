//! Passkeys (better-auth passkey plugin wire format), the passkey step-up, the native bridge endpoints and one-time tokens.

use serde_json::{Value, json};
use solace_api_tests::client::{Agent, ApiResponse, ResponseResult};
use solace_api_tests::seed::passkey_sign_in;
use solace_api_tests::webauthn::SoftPasskey;
use solace_api_types::auth::{AuthError, SessionWithUser, StatusFlag};

use crate::helpers::{TestApp, TestUser, count, ok, set_cookies_named, signed_cookie_token};

const STEP_UP_COOKIE: &str = "solace-passkey-step-up";

fn auth_error(response: &ApiResponse, status: u16, code: &str, message: &str) {
    assert_eq!(response.status.as_u16(), status, "{}", response.text());
    let error: AuthError = ok(response.dto());
    assert_eq!(
        (error.code.as_str(), error.message.as_str()),
        (code, message)
    );
}

fn rp_id(app: &TestApp) -> String {
    url::Url::parse(&app.origin)
        .ok()
        .and_then(|url| url.host_str().map(str::to_owned))
        .expect("origin host")
}

pub(crate) async fn register(
    app: &TestApp,
    user: &mut TestUser,
    name: &str,
) -> (SoftPasskey, Value) {
    let options = ok(user
        .get("/api/auth/passkey/generate-register-options")
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    let mut passkey = SoftPasskey::new(&rp_id(app)).expect("passkey");
    let response = passkey
        .register(&options, &app.origin)
        .expect("attestation");
    let created = ok(user
        .post(
            "/api/auth/passkey/verify-registration",
            json!({"response": response, "name": name}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    (passkey, created)
}

/// The step-up cookie's `{u, s, e}` payload, without checking its signature.
fn step_up_payload(value: &str) -> Value {
    use base64::Engine;
    let value = percent_encoding::percent_decode_str(value)
        .decode_utf8_lossy()
        .into_owned();
    let encoded = value.split('.').next().unwrap_or_default();
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(encoded)
        .expect("base64url payload");
    serde_json::from_slice(&bytes).expect("payload json")
}

/// A step-up cookie signed like the backend does (HMAC-SHA256 base64url over the base64url payload).
fn forge_step_up(secret: &str, user_id: &str, session_id: &str, expires: i64) -> String {
    use base64::Engine;
    use base64::engine::general_purpose::URL_SAFE_NO_PAD;
    use hmac::{KeyInit, Mac};
    let encoded =
        URL_SAFE_NO_PAD.encode(json!({"u": user_id, "s": session_id, "e": expires}).to_string());
    let mut mac = hmac::Hmac::<sha2::Sha256>::new_from_slice(secret.as_bytes()).expect("key");
    mac.update(encoded.as_bytes());
    format!(
        "{encoded}.{}",
        URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes())
    )
}

async fn session_id(agent: &mut Agent) -> String {
    let session: SessionWithUser = ok(agent.get("/api/auth/get-session").await.dto());
    session.session.id.0
}

async fn password_agent(app: &TestApp, user: &TestUser) -> Agent {
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

fn expect_step_up_required(response: &ApiResponse) {
    let body = response
        .expect_error(403, "Forbidden", "Passkey verification required.")
        .expect("403 envelope");
    assert_eq!(
        body["details"],
        json!({"code": "PASSKEY_STEP_UP_REQUIRED"}),
        "{body}"
    );
    assert!(body.get("requestId").is_none(), "{body}");
}

/// With this step-up cookie (or none), neither an app route nor the get-session renewal grants step-up.
async fn expect_no_step_up(agent: &mut Agent, cookie: Option<&str>) {
    for path in ["/api/settings", "/api/auth/get-session"] {
        if let Some(cookie) = cookie {
            agent.set_cookie(STEP_UP_COOKIE, cookie);
        }
        let response = ok(agent.get(path).await);
        if path == "/api/settings" {
            expect_step_up_required(&response);
        }
        assert!(
            set_cookies_named(&response, STEP_UP_COOKIE)
                .iter()
                .all(|c| c.contains("Max-Age=0")),
            "{path}: {:?}",
            response.set_cookies()
        );
    }
}

#[tokio::test]
async fn registration_options_follow_simplewebauthn() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let response = user
        .get("/api/auth/passkey/generate-register-options")
        .await;
    let challenge_cookie = set_cookies_named(&response, &app.auth_cookie("better-auth-passkey"));
    assert_eq!(challenge_cookie.len(), 1, "{:?}", response.set_cookies());
    assert!(
        challenge_cookie[0].contains("Max-Age=300"),
        "{}",
        challenge_cookie[0]
    );
    let options = ok(response.value());
    assert_eq!(options["rp"], json!({"id": rp_id(&app), "name": "Rocani"}));
    assert_eq!(options["attestation"], json!("none"));
    assert_eq!(options["user"]["name"], json!(user.email));
    assert_eq!(options["user"]["displayName"], json!(user.email));
    assert_eq!(options["excludeCredentials"], json!([]));
    assert_eq!(
        options["authenticatorSelection"],
        json!({"requireResidentKey": false, "residentKey": "preferred", "userVerification": "preferred"})
    );
    assert_eq!(options["timeout"], json!(60000));
    assert!(options["challenge"].as_str().is_some_and(|c| c.len() >= 43));

    let mut anon = app.anonymous();
    let response = ok(anon
        .get("/api/auth/passkey/generate-register-options")
        .await);
    assert_eq!(response.status.as_u16(), 401, "{}", response.text());
}

#[tokio::test]
async fn registering_stores_the_cose_key_and_grants_step_up() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let (passkey, created) = register(&app, &mut user, "Laptop").await;
    assert_eq!(created["name"], json!("Laptop"));
    assert_eq!(created["userId"], json!(user.id));
    assert_eq!(created["credentialID"], json!(passkey.credential_id));
    assert_eq!(
        (
            &created["counter"],
            &created["deviceType"],
            &created["backedUp"],
            &created["transports"]
        ),
        (
            &json!(0),
            &json!("singleDevice"),
            &json!(false),
            &json!("internal")
        )
    );
    assert_eq!(
        created["aaguid"],
        json!("00000000-0000-0000-0000-000000000000")
    );
    let public_key = created["publicKey"].as_str().expect("publicKey");
    assert!(
        public_key.starts_with("pQECAyYg"),
        "standard base64 of the COSE ES256 key: {public_key}"
    );

    let (stored_key, stored_credential): (String, String) =
        sqlx::query_as("SELECT \"publicKey\", \"credentialID\" FROM passkey WHERE \"userId\" = $1")
            .bind(&user.id)
            .fetch_one(&app.db)
            .await
            .expect("passkey row");
    assert_eq!(
        (stored_key.as_str(), stored_credential.as_str()),
        (public_key, passkey.credential_id.as_str())
    );

    let step_up = user
        .agent
        .cookie(STEP_UP_COOKIE)
        .expect("step-up cookie")
        .to_owned();
    let payload = step_up_payload(&step_up);
    let sid = session_id(&mut user.agent).await;
    assert_eq!(
        (&payload["u"], &payload["s"]),
        (&json!(user.id), &json!(sid))
    );

    let options = ok(user
        .get("/api/auth/passkey/generate-register-options")
        .await
        .value());
    assert_eq!(
        options["excludeCredentials"][0]["id"],
        json!(passkey.credential_id)
    );
}

#[tokio::test]
async fn a_registration_needs_its_challenge_cookie_and_the_right_origin() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let options = ok(user
        .get("/api/auth/passkey/generate-register-options")
        .await
        .value());
    let mut passkey = SoftPasskey::new(&rp_id(&app)).expect("passkey");

    let wrong_origin = passkey
        .register(&options, "https://evil.example")
        .expect("attestation");
    let response = user
        .post(
            "/api/auth/passkey/verify-registration",
            json!({"response": wrong_origin}),
        )
        .await;
    auth_error(
        &response,
        500,
        "FAILED_TO_VERIFY_REGISTRATION",
        "Failed to verify registration",
    );

    let mut stranger = app.user().await;
    let options = ok(user
        .get("/api/auth/passkey/generate-register-options")
        .await
        .value());
    let response_body = passkey
        .register(&options, &app.origin)
        .expect("attestation");
    let response = stranger
        .post(
            "/api/auth/passkey/verify-registration",
            json!({"response": response_body}),
        )
        .await;
    auth_error(&response, 400, "CHALLENGE_NOT_FOUND", "Challenge not found");
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM passkey WHERE \"userId\" = $1",
            &user.id
        )
        .await,
        0
    );
}

#[tokio::test]
async fn passkeys_are_listed_renamed_and_deleted_by_their_owner_only() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let mut other = app.user().await;
    let (_, created) = register(&app, &mut user, "Laptop").await;
    let id = created["id"].as_str().expect("id").to_owned();

    let listed = ok(user
        .get("/api/auth/passkey/list-user-passkeys")
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    assert_eq!(listed, json!([created]));
    let none = ok(other
        .get("/api/auth/passkey/list-user-passkeys")
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    assert_eq!(none, json!([]));

    let foreign_update = other
        .post(
            "/api/auth/passkey/update-passkey",
            json!({"id": id, "name": "Mine"}),
        )
        .await;
    auth_error(
        &foreign_update,
        401,
        "YOU_ARE_NOT_ALLOWED_TO_REGISTER_THIS_PASSKEY",
        "You are not allowed to register this passkey",
    );
    let foreign_delete = other
        .post("/api/auth/passkey/delete-passkey", json!({"id": id}))
        .await;
    assert_eq!(
        foreign_delete.status.as_u16(),
        401,
        "{}",
        foreign_delete.text()
    );
    let missing = user
        .post(
            "/api/auth/passkey/delete-passkey",
            json!({"id": "missing-passkey"}),
        )
        .await;
    auth_error(&missing, 404, "PASSKEY_NOT_FOUND", "Passkey not found");

    let renamed = ok(user
        .post(
            "/api/auth/passkey/update-passkey",
            json!({"id": id, "name": "Phone"}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    assert_eq!(renamed["passkey"]["name"], json!("Phone"));
    assert_eq!(renamed["passkey"]["id"], json!(id));
    let deleted: StatusFlag = ok(user
        .post("/api/auth/passkey/delete-passkey", json!({"id": id}))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert!(deleted.status);
    assert_eq!(
        count(&app.db, "SELECT count(*) FROM passkey WHERE id = $1", &id).await,
        0
    );
}

#[tokio::test]
async fn signing_in_with_a_passkey_creates_a_session_with_step_up() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let (mut passkey, created) = register(&app, &mut user, "Laptop").await;

    let mut agent = app.anonymous();
    let options_response = ok(agent
        .get("/api/auth/passkey/generate-authenticate-options")
        .await
        .expect_status(200));
    let options = ok(options_response.value());
    assert_eq!(options["rpId"], json!(rp_id(&app)));
    assert_eq!(options["userVerification"], json!("preferred"));
    assert!(
        options.get("allowCredentials").is_none(),
        "no session, no allow list: {options}"
    );
    let assertion = passkey
        .authenticate(&options, &app.origin)
        .expect("assertion");
    let response = ok(agent
        .post(
            "/api/auth/passkey/verify-authentication",
            json!({"response": assertion}),
        )
        .await
        .expect_status(200));
    let body: SessionWithUser = ok(response.dto());
    assert_eq!(body.user.id.0, user.id);
    let token = signed_cookie_token(
        &app.env.better_auth_secret,
        agent.cookie(&app.session_cookie()).expect("cookie"),
    );
    assert_eq!(token.as_deref(), Some(body.session.token.as_str()));
    let payload = step_up_payload(agent.cookie(STEP_UP_COOKIE).expect("step-up cookie"));
    assert_eq!(
        (&payload["u"], &payload["s"]),
        (&json!(user.id), &json!(body.session.id.0))
    );
    let step_up = set_cookies_named(&response, STEP_UP_COOKIE);
    let step_up = step_up.first().expect("step-up Set-Cookie");
    for attribute in ["Max-Age=1209600", "Path=/", "HttpOnly"] {
        assert!(
            step_up.contains(attribute),
            "{attribute} missing: {step_up}"
        );
    }
    let counter: i32 = sqlx::query_scalar("SELECT counter FROM passkey WHERE id = $1")
        .bind(created["id"].as_str())
        .fetch_one(&app.db)
        .await
        .expect("passkey");
    assert_eq!(counter, 1);
    ok(agent.get("/api/settings").await.expect_status(200));
}

#[tokio::test]
async fn passkey_sign_in_rejects_unknown_replayed_and_forged_assertions() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let (mut passkey, _) = register(&app, &mut user, "Laptop").await;

    let mut agent = app.anonymous();
    let options = ok(agent
        .get("/api/auth/passkey/generate-authenticate-options")
        .await
        .value());
    let mut stranger = SoftPasskey::new(&rp_id(&app)).expect("passkey");
    let unknown = stranger
        .authenticate(&options, &app.origin)
        .expect("assertion");
    let response = ok(agent
        .post(
            "/api/auth/passkey/verify-authentication",
            json!({"response": unknown}),
        )
        .await);
    auth_error(&response, 401, "PASSKEY_NOT_FOUND", "Passkey not found");

    let replayed = passkey
        .authenticate(&options, &app.origin)
        .expect("assertion");
    let response = ok(agent
        .post(
            "/api/auth/passkey/verify-authentication",
            json!({"response": replayed}),
        )
        .await);
    auth_error(&response, 400, "CHALLENGE_NOT_FOUND", "Challenge not found");

    // A well-formed signature that does not verify fails verification; a malformed one fails parsing.
    let options = ok(agent
        .get("/api/auth/passkey/generate-authenticate-options")
        .await
        .value());
    let mut forged = passkey
        .authenticate(&options, &app.origin)
        .expect("assertion");
    forged["response"]["signature"] = json!(
        "MEUCIQDrdQ7NH5Bm3MHYZ6XuL8Dss4C6CfJYv4IL0F4x52IgVAIgYvsrH0nv8oZAqL2tSBlp9bMTvk7hpZcYxMbRrHgJPQU"
    );
    let response = ok(agent
        .post(
            "/api/auth/passkey/verify-authentication",
            json!({"response": forged}),
        )
        .await);
    auth_error(
        &response,
        401,
        "AUTHENTICATION_FAILED",
        "Authentication failed",
    );
    let options = ok(agent
        .get("/api/auth/passkey/generate-authenticate-options")
        .await
        .value());
    let mut garbage = passkey
        .authenticate(&options, &app.origin)
        .expect("assertion");
    garbage["response"]["signature"] = json!("AAAA");
    let response = ok(agent
        .post(
            "/api/auth/passkey/verify-authentication",
            json!({"response": garbage}),
        )
        .await);
    auth_error(
        &response,
        400,
        "AUTHENTICATION_FAILED",
        "Authentication failed",
    );
    assert!(agent.cookie(&app.session_cookie()).is_none());
    assert!(
        agent.cookie(STEP_UP_COOKIE).is_none(),
        "a failed assertion grants no step-up"
    );
}

#[tokio::test]
async fn accounts_with_a_passkey_need_step_up_after_a_password_sign_in() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let (mut passkey, _) = register(&app, &mut user, "Laptop").await;

    let mut password_only = password_agent(&app, &user).await;
    assert!(password_only.cookie(STEP_UP_COOKIE).is_none());
    expect_no_step_up(&mut password_only, None).await;
    let status = ok(password_only
        .get("/api/account/auth-status")
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    assert_eq!(
        status,
        json!({"authenticated": true, "hasPasskeys": true, "requiresPasskeyStepUp": true})
    );

    // A step-up cookie belongs to one session: replaying another session's cookie does not help.
    let borrowed = user
        .agent
        .cookie(STEP_UP_COOKIE)
        .expect("registering session's cookie")
        .to_owned();
    expect_no_step_up(&mut password_only, Some(&borrowed)).await;
    expect_no_step_up(&mut password_only, Some(&format!("{borrowed}x"))).await;
    let sid = session_id(&mut password_only).await;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("clock")
        .as_secs() as i64;
    for (user_id, expires) in [("someone-else", now + 86_400), (user.id.as_str(), now - 1)] {
        let forged = forge_step_up(&app.env.better_auth_secret, user_id, &sid, expires);
        expect_no_step_up(&mut password_only, Some(&forged)).await;
    }

    let mut passkey_agent = app.anonymous();
    ok(passkey_sign_in(&mut passkey_agent, &mut passkey, &app.origin).await);
    ok(passkey_agent.get("/api/settings").await.expect_status(200));
    let status = ok(passkey_agent.get("/api/account/auth-status").await.value());
    assert_eq!(
        status,
        json!({"authenticated": true, "hasPasskeys": true, "requiresPasskeyStepUp": false})
    );
}

/// A step-up cookie older than a day is re-issued by get-session and by every guarded app route.
#[tokio::test]
async fn an_old_step_up_cookie_is_renewed_daily_during_use() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    register(&app, &mut user, "Laptop").await;
    let sid = session_id(&mut user.agent).await;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("clock")
        .as_secs() as i64;
    for path in ["/api/auth/get-session", "/api/settings"] {
        let old = forge_step_up(
            &app.env.better_auth_secret,
            &user.id,
            &sid,
            now + 13 * 86_400 - 60,
        );
        user.agent.replace_cookie(STEP_UP_COOKIE, &old);
        let response = user.get(path).await;
        assert_eq!(response.status.as_u16(), 200, "{path}");
        assert_eq!(
            set_cookies_named(&response, STEP_UP_COOKIE).len(),
            1,
            "{path}: {:?}",
            response.set_cookies()
        );
        let payload = step_up_payload(user.agent.cookie(STEP_UP_COOKIE).expect("cookie"));
        assert!(
            payload["e"]
                .as_i64()
                .is_some_and(|e| e >= now + 14 * 86_400 - 5),
            "{path}: {payload}"
        );
        assert_eq!(
            (&payload["u"], &payload["s"]),
            (&json!(user.id), &json!(sid))
        );
    }

    let recent = forge_step_up(
        &app.env.better_auth_secret,
        &user.id,
        &sid,
        now + 14 * 86_400 - 60,
    );
    user.agent.replace_cookie(STEP_UP_COOKIE, &recent);
    let response = user.get("/api/settings").await;
    assert!(
        set_cookies_named(&response, STEP_UP_COOKIE).is_empty(),
        "a recent cookie is not re-issued"
    );

    let expired = forge_step_up(&app.env.better_auth_secret, &user.id, &sid, now - 1);
    user.agent.replace_cookie(STEP_UP_COOKIE, &expired);
    expect_step_up_required(&user.get("/api/settings").await);
}

#[tokio::test]
async fn the_bridge_freshens_a_session_for_native_passkey_setup() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let before = user
        .agent
        .cookie(&app.session_cookie())
        .expect("cookie")
        .to_owned();
    let response = user
        .post("/api/auth/passkey-bridge/freshen-session", json!({}))
        .await;
    assert_eq!(set_cookies_named(&response, &app.session_cookie()).len(), 1);
    assert_eq!(
        ok(response.expect_status(200).and_then(|r| r.value())),
        json!({"ok": true})
    );
    assert_ne!(
        user.agent.cookie(&app.session_cookie()),
        Some(before.as_str())
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

    let mut anon = app.anonymous();
    for path in [
        "/api/auth/passkey-bridge/freshen-session",
        "/api/auth/passkey-bridge/complete-step-up",
    ] {
        let response = ok(anon.post(path, json!({})).await);
        assert_eq!(response.status.as_u16(), 401, "{path}: {}", response.text());
    }
}

/// Known gap: complete-step-up trusts any session, so a password-only session can mark itself passkey-verified.
#[tokio::test]
async fn complete_step_up_marks_any_session_verified_known_gap() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    register(&app, &mut user, "Laptop").await;
    let mut password_only = password_agent(&app, &user).await;
    expect_step_up_required(&ok(password_only.get("/api/settings").await));
    let body = ok(password_only
        .post("/api/auth/passkey-bridge/complete-step-up", json!({}))
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    assert_eq!(body, json!({"ok": true}));
    ok(password_only.get("/api/settings").await.expect_status(200));
}

/// The plugin's `expiresIn: 3` is in minutes; the token is stored as a SHA-256 hash pointing at the issuing session.
#[tokio::test]
async fn one_time_tokens_hand_over_the_issuing_session_once_within_three_minutes() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let session_token = signed_cookie_token(
        &app.env.better_auth_secret,
        user.agent.cookie(&app.session_cookie()).expect("cookie"),
    )
    .expect("session token");
    let generated = ok(user
        .get("/api/auth/one-time-token/generate")
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    let token = generated["token"].as_str().expect("token").to_owned();
    assert_eq!(token.len(), 32);
    let identifier = format!("one-time-token:{}", sha256_base64url(&token));
    let (value, seconds): (String, f64) = sqlx::query_as(
        "SELECT value, extract(epoch FROM expires_at - (now() AT TIME ZONE 'UTC'))::float8 FROM verification WHERE identifier = $1",
    )
    .bind(&identifier)
    .fetch_one(&app.db)
    .await
    .expect("hashed one-time token");
    assert_eq!(value, session_token);
    assert!((170.0..=181.0).contains(&seconds), "{seconds}");

    let mut native = app.anonymous();
    let response = ok(native
        .post("/api/auth/one-time-token/verify", json!({"token": token}))
        .await
        .expect_status(200));
    let body: SessionWithUser = ok(response.dto());
    assert_eq!(
        (body.user.id.0.as_str(), body.session.token.as_str()),
        (user.id.as_str(), session_token.as_str())
    );
    assert_eq!(
        signed_cookie_token(
            &app.env.better_auth_secret,
            native.cookie(&app.session_cookie()).expect("cookie")
        )
        .as_deref(),
        Some(session_token.as_str())
    );
    let again = ok(native
        .post("/api/auth/one-time-token/verify", json!({"token": token}))
        .await);
    assert_eq!(again.status.as_u16(), 400);
    assert_eq!(ok(again.value()), json!({"message": "Invalid token"}));

    let late = ok(user.get("/api/auth/one-time-token/generate").await.value())["token"]
        .as_str()
        .expect("token")
        .to_owned();
    sqlx::query(
        "UPDATE verification SET expires_at = now() - interval '1 second' WHERE identifier = $1",
    )
    .bind(format!("one-time-token:{}", sha256_base64url(&late)))
    .execute(&app.db)
    .await
    .expect("expire token");
    let expired = ok(app
        .anonymous()
        .post("/api/auth/one-time-token/verify", json!({"token": late}))
        .await);
    assert_eq!(expired.status.as_u16(), 400, "{}", expired.text());

    let mut anon = app.anonymous();
    let response = ok(anon.get("/api/auth/one-time-token/generate").await);
    assert_eq!(response.status.as_u16(), 401, "{}", response.text());
}

pub fn sha256_base64url(value: &str) -> String {
    use base64::Engine;
    use sha2::Digest;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(sha2::Sha256::digest(value.as_bytes()))
}
