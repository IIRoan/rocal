//! `/api/invites`: sending, listing and revoking invites, scoped to the inviter.

use serde_json::json;
use solace_api_types::account::{Invite, InviteList, InviteStatus};

use crate::helpers::{Backend, TestApp, count, expect_unauthorized, expect_unknown_field, hex, ok};

#[tokio::test]
async fn anonymous_callers_are_refused() {
    let app = TestApp::spawn().await;
    let mut anon = app.anonymous();
    expect_unauthorized(&ok(anon
        .post("/api/invites", json!({"email": "x@example.com"}))
        .await));
    expect_unauthorized(&ok(anon.get("/api/invites").await));
    expect_unauthorized(&ok(anon.delete("/api/invites/whatever").await));
}

#[tokio::test]
async fn invite_mail_bursts_wait_out_stalwarts_concurrency_limit() {
    let app = TestApp::spawn().await;
    // TypeScript drops mail past the limit (step 3), and its burst would also fail mail that concurrent cases send.
    if app.backend == Backend::TypeScript {
        return;
    }
    let user = app.user().await;
    // Invite mail has no attachment, so the burst spends none of noreply's blob upload quota.
    let mut creates = tokio::task::JoinSet::new();
    for _ in 0..64 {
        let mut agent = user.agent.clone();
        let email = format!("burst-{}@example.com", hex(6));
        creates.spawn(async move { agent.post("/api/invites", json!({"email": email})).await });
    }
    for response in creates.join_all().await {
        let invite: Invite = ok(response
            .and_then(|r| r.expect_status(200))
            .and_then(|r| r.dto()));
        assert_eq!(invite.warnings, None, "every invite went out");
    }
}

#[tokio::test]
async fn an_invite_is_created_for_seven_days_and_mailed() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let local = format!("friend{}", hex(4));
    app.plain_mailbox(&local).await;
    let email = format!("{local}@{}", app.env.mail_domain);
    let invite: Invite = ok(user
        .post("/api/invites", json!({"email": email.to_uppercase()}))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(invite.email, email, "stored normalized");
    assert_eq!(invite.status, InviteStatus::Pending);
    assert_eq!(invite.invited_by_id.0, user.id);
    assert_eq!(invite.warnings, None);
    assert_eq!(invite.token.len(), 43, "32 random bytes, base64url");
    let days: f64 = sqlx::query_scalar(
        "SELECT extract(epoch FROM expires_at - created_at)::float8 / 86400 FROM invite WHERE id = $1",
    )
    .bind(&invite.id.0)
    .fetch_one(&app.db)
    .await
    .expect("invite");
    assert!((6.99..=7.01).contains(&days), "{days}");

    let message = app.wait_for_message(&local, "invited you to Solace").await;
    assert_eq!(
        message["subject"],
        json!(format!("{} invited you to Solace", user.name))
    );
    let part = message["textBody"][0]["partId"]
        .as_str()
        .unwrap_or_default();
    let text = message["bodyValues"][part]["value"]
        .as_str()
        .unwrap_or_default();
    let signup = format!("{}/login?invite={}", app.origin, invite.token);
    assert!(text.contains(&signup), "{text}");
}

#[tokio::test]
async fn invites_are_validated_and_deduplicated() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let existing = app.user().await;

    let invalid = user
        .post("/api/invites", json!({"email": "not-an-email"}))
        .await;
    let error = ok(invalid.expect_error(
        400,
        "Validation Error",
        "Please provide a valid email address.",
    ));
    assert!(error.get("details").is_none(), "{error}");

    let reserved = user
        .post("/api/invites", json!({"email": "admin@solace.onl"}))
        .await;
    let error = ok(reserved.expect_error(
        400,
        "Validation Error",
        "Cannot send an invite to a reserved system email address.",
    ));
    assert_eq!(error["details"]["issues"][0]["path"], json!("email"));

    let member = user
        .post("/api/invites", json!({"email": existing.email}))
        .await;
    ok(member
        .expect_error(
            409,
            "Conflict",
            "That email address already has an account.",
        )
        .map(|_| ()));

    let email = format!("dup{}@example.com", hex(4));
    ok(user
        .post("/api/invites", json!({"email": email}))
        .await
        .expect_status(200));
    let twice = user.post("/api/invites", json!({"email": email})).await;
    ok(twice
        .expect_error(
            409,
            "Conflict",
            "You already have an active invite for that email address.",
        )
        .map(|_| ()));

    let forged = user
        .post(
            "/api/invites",
            json!({"email": "x@example.com", "invitedById": existing.id}),
        )
        .await;
    expect_unknown_field(&forged, "invitedById");
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM invite WHERE invited_by_id = $1",
            &user.id
        )
        .await,
        1
    );
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM invite WHERE invited_by_id = $1",
            &existing.id
        )
        .await,
        0
    );
}

#[tokio::test]
async fn invites_are_listed_newest_first_for_their_sender_only() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let mut other = app.user().await;
    let first: Invite = ok(user
        .post(
            "/api/invites",
            json!({"email": format!("a{}@example.com", hex(4))}),
        )
        .await
        .dto());
    let second: Invite = ok(user
        .post(
            "/api/invites",
            json!({"email": format!("b{}@example.com", hex(4))}),
        )
        .await
        .dto());
    ok(other
        .post(
            "/api/invites",
            json!({"email": format!("c{}@example.com", hex(4))}),
        )
        .await
        .expect_status(200));

    let list: InviteList = ok(user
        .get("/api/invites")
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    let ids: Vec<_> = list.invites.iter().map(|i| i.id.0.clone()).collect();
    assert_eq!(ids, vec![second.id.0, first.id.0]);
}

#[tokio::test]
async fn only_the_sender_can_revoke_and_only_before_acceptance() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let mut other = app.user().await;
    let invite: Invite = ok(user
        .post(
            "/api/invites",
            json!({"email": format!("r{}@example.com", hex(4))}),
        )
        .await
        .dto());
    let path = format!("/api/invites/{}", invite.id.0);

    let foreign = other.delete(&path).await;
    ok(foreign
        .expect_error(403, "Forbidden", "You can only revoke your own invites.")
        .map(|_| ()));
    let missing = user
        .delete(&format!("/api/invites/missing{}", hex(4)))
        .await;
    ok(missing
        .expect_error(404, "Not Found", "Invite not found.")
        .map(|_| ()));

    let revoked = ok(user
        .delete(&path)
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    assert_eq!(revoked, json!({"success": true}));
    let again = ok(user
        .delete(&path)
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    assert_eq!(again, json!({"success": true}), "revoking twice is fine");
    let status: String = sqlx::query_scalar("SELECT status FROM invite WHERE id = $1")
        .bind(&invite.id.0)
        .fetch_one(&app.db)
        .await
        .expect("invite");
    assert_eq!(status, "revoked");

    let accepted: Invite = ok(user
        .post(
            "/api/invites",
            json!({"email": format!("s{}@example.com", hex(4))}),
        )
        .await
        .dto());
    sqlx::query("UPDATE invite SET status = 'accepted' WHERE id = $1")
        .bind(&accepted.id.0)
        .execute(&app.db)
        .await
        .expect("accept invite");
    let refused = user
        .delete(&format!("/api/invites/{}", accepted.id.0))
        .await;
    ok(refused
        .expect_error(
            400,
            "Validation Error",
            "Cannot revoke an invite that has already been accepted.",
        )
        .map(|_| ()));
}
