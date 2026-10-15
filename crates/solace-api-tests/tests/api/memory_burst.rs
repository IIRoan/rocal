//! Step 5: the twenty concurrent sign-ins of the memory budget, against a deployed server whose memory is read from its container; runs only with `MEMORY_BURST=1`.

use serde_json::json;

use crate::helpers::{TestApp, ok};

#[tokio::test]
async fn twenty_concurrent_sign_ins() {
    if std::env::var("MEMORY_BURST").is_err() {
        return;
    }
    let app = TestApp::spawn().await;
    let mut accounts = Vec::new();
    for _ in 0..20 {
        let user = app.user().await;
        accounts.push((user.email.clone(), user.password.clone()));
    }
    let mut sign_ins = tokio::task::JoinSet::new();
    for (email, password) in accounts {
        let mut agent = app.anonymous();
        sign_ins.spawn(async move {
            agent
                .post(
                    "/api/auth/sign-in/email",
                    json!({"email": email, "password": password}),
                )
                .await
                .map(|response| response.status.as_u16())
        });
    }
    let mut statuses = Vec::new();
    while let Some(status) = sign_ins.join_next().await {
        statuses.push(ok(status.expect("sign-in task")));
    }
    assert!(statuses.iter().all(|status| *status == 200), "{statuses:?}");
}
