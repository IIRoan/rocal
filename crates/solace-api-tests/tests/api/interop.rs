//! Step 4b: sessions, passwords, passkeys and step-up made by either backend work on the other; runs when `INTEROP_TS_URL` is set.

use serde_json::json;
use solace_api_tests::client::Agent;
use solace_api_tests::seed::passkey_sign_in;
use solace_api_types::auth::SessionWithUser;

use crate::helpers::{TestApp, TestUser, ok};
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
