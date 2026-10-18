//! Sessions, passwords, passkeys, step-up and data made by either backend work on the other (step 4b, and step 5's rollback drill); runs when `INTEROP_TS_URL` is set.

use serde_json::json;
use solace_api_tests::client::Agent;
use solace_api_tests::seed::passkey_sign_in;
use solace_api_types::auth::SessionWithUser;

use crate::event_fixtures::{FUTURE_END, FUTURE_START, calendar_id, create_event, encrypted_event};
use crate::helpers::{TestApp, TestUser, ok, set_cookies_named};
use crate::passkeys::register;

/// The same browser, now talking to the other backend.
fn carry(agent: &Agent, to: &TestApp) -> Agent {
    let mut moved = to.anonymous();
    for (name, value) in agent.cookies() {
        moved.set_cookie(&name, &value);
    }
    moved
}

async fn session(agent: &mut Agent) -> SessionWithUser {
    ok(agent
        .get("/api/auth/get-session")
        .await
        .and_then(|r| r.expect_status(200))
        .and_then(|r| r.dto()))
}

async fn sign_in(app: &TestApp, user: &TestUser) -> Agent {
    let mut agent = app.anonymous();
    ok(agent
        .post(
            "/api/auth/sign-in/email",
            json!({"email": user.email, "password": user.password}),
        )
        .await
        .and_then(|r| r.expect_status(200)));
    agent
}

#[tokio::test]
async fn passwords_and_sessions_work_on_both_backends() {
    let Some((ts, rust)) = TestApp::interop().await else {
        return;
    };
    for (made, other) in [(&ts, &rust), (&rust, &ts)] {
        let label = format!("{:?} account on {:?}", made.backend, other.backend);
        let mut user = made.user().await;
        let issued = session(&mut user.agent).await;
        let seen = session(&mut carry(&user.agent, other)).await;
        assert_eq!(
            (&seen.user.id, &seen.session.id),
            (&issued.user.id, &issued.session.id),
            "{label}: the session cookie"
        );
        let mut signed_in = sign_in(other, &user).await;
        assert_eq!(
            session(&mut signed_in).await.user.id,
            issued.user.id,
            "{label}: the password hash"
        );
    }
}

#[tokio::test]
async fn passkeys_and_step_up_work_on_both_backends() {
    let Some((ts, rust)) = TestApp::interop().await else {
        return;
    };
    for (made, other) in [(&ts, &rust), (&rust, &ts)] {
        let label = format!("{:?} passkey on {:?}", made.backend, other.backend);
        let mut user = made.user().await;
        let (mut passkey, created) = register(made, &mut user, "Laptop").await;
        let mut agent = other.anonymous();
        ok(passkey_sign_in(&mut agent, &mut passkey, &other.origin).await);
        let status = ok(carry(&agent, made)
            .get("/api/account/auth-status")
            .await
            .and_then(|r| r.expect_status(200))
            .and_then(|r| r.value()));
        assert_eq!(
            status,
            json!({"authenticated": true, "hasPasskeys": true, "requiresPasskeyStepUp": false}),
            "{label}: the step-up cookie"
        );
        ok(passkey_sign_in(&mut made.anonymous(), &mut passkey, &made.origin).await);
        let counter: i32 = sqlx::query_scalar("SELECT counter FROM passkey WHERE id = $1")
            .bind(created["id"].as_str())
            .fetch_one(&made.db)
            .await
            .expect("passkey");
        assert_eq!(counter, 2, "{label}: the counter");
    }
}

#[tokio::test]
async fn data_and_sessions_renewed_on_rust_keep_working_on_typescript() {
    let Some((ts, rust)) = TestApp::interop().await else {
        return;
    };
    let mut user = rust.user().await;
    let calendar = calendar_id(&mut user, "Work").await;
    let event = create_event(
        &mut user,
        &encrypted_event(&calendar, FUTURE_START, FUTURE_END),
    )
    .await;
    ok(user
        .put(
            "/api/settings",
            json!({"theme": "dark", "compactView": true}),
        )
        .await
        .expect_status(200));
    // Thirteen days left means the session was issued a day ago, so Rust renews it on the next request.
    sqlx::query("UPDATE session SET expires_at = now() + interval '13 days' WHERE user_id = $1")
        .bind(&user.id)
        .execute(&rust.db)
        .await
        .expect("age the session");
    let renewal = ok(user.get("/api/settings").await.expect_status(200));
    assert_eq!(
        set_cookies_named(&renewal, &rust.session_cookie()).len(),
        1,
        "Rust renewed the session"
    );
    let mut on_typescript = carry(&user.agent, &ts);
    for path in [
        "/api/auth/get-session".to_owned(),
        "/api/settings".to_owned(),
        "/api/calendars".to_owned(),
        format!("/api/events?start={FUTURE_START}&end={FUTURE_END}"),
        format!("/api/events/{}", event.id.0),
    ] {
        let written = ok(user
            .get(&path)
            .await
            .expect_status(200)
            .and_then(|r| r.value()));
        let read = ok(on_typescript
            .get(&path)
            .await
            .and_then(|r| r.expect_status(200))
            .and_then(|r| r.value()));
        assert_eq!(read, written, "{path} after the switch to TypeScript");
    }
}
