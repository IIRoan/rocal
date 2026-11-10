//! Account-owned ciphertext, strict required-nullable CAS, and retention with the account.

use crate::helpers::{TestApp, count, expect_unauthorized, expect_unknown_field, ok};
use serde_json::json;
use solace_api_types::mail::MailTrust;

const PATH: &str = "/api/mail/trust";

#[tokio::test]
async fn mail_trust_anonymous_guard_runs_before_validation() {
    let app = TestApp::spawn().await;
    let mut anonymous = app.anonymous();
    expect_unauthorized(&ok(anonymous.get(PATH).await));
    expect_unauthorized(&ok(anonymous.put(PATH, json!({})).await));
}

#[tokio::test]
async fn mail_trust_is_isolated_and_preserves_ciphertext_exactly() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut other = app.user().await;
    let empty: MailTrust = ok(owner.get(PATH).await.dto());
    assert_eq!(empty.encrypted_trust, None);
    let ciphertext = "SYNTHETIC-only opaque ciphertext\r\nwith exact whitespace ";
    let stored: MailTrust = ok(owner
        .put(
            PATH,
            json!({"encryptedTrust":ciphertext,"expectedEncryptedTrust":null}),
        )
        .await
        .dto());
    assert_eq!(stored.encrypted_trust.as_deref(), Some(ciphertext));
    let other_empty: MailTrust = ok(other.get(PATH).await.dto());
    assert_eq!(other_empty.encrypted_trust, None);
    expect_unknown_field(&other.put(PATH,json!({"encryptedTrust":"SYNTHETIC-forgery","expectedEncryptedTrust":null,"userId":owner.id})).await,"userId");
    let unchanged: MailTrust = ok(owner.get(PATH).await.dto());
    assert_eq!(unchanged, stored);
    let database: String =
        sqlx::query_scalar("SELECT encrypted_trust FROM user_mail_trust WHERE user_id=$1")
            .bind(&owner.id)
            .fetch_one(&app.db)
            .await
            .expect("owned ciphertext");
    assert_eq!(database, ciphertext);
    let auth_column: i64 = sqlx::query_scalar("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='user' AND column_name='encrypted_mail_trust'")
        .fetch_one(&app.db).await.expect("auth-row schema");
    assert_eq!(
        auth_column, 0,
        "trust ciphertext must not inflate auth-row reads"
    );
}

#[tokio::test]
async fn mail_trust_requires_nullable_expectation_and_bounded_strict_inputs() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    for body in [
        json!({"encryptedTrust":"SYNTHETIC"}),
        json!({"encryptedTrust":null,"expectedEncryptedTrust":null}),
        json!({"encryptedTrust":"","expectedEncryptedTrust":null}),
        json!({"encryptedTrust":"SYNTHETIC","expectedEncryptedTrust":0}),
        json!({"encryptedTrust":"x".repeat(1_400_001),"expectedEncryptedTrust":null}),
        json!({"encryptedTrust":"SYNTHETIC","expectedEncryptedTrust":"x".repeat(1_400_001)}),
    ] {
        assert_eq!(owner.put(PATH, body).await.status.as_u16(), 400);
    }
    for field in ["email", "fingerprint", "userId"] {
        let mut body = json!({"encryptedTrust":"SYNTHETIC","expectedEncryptedTrust":null});
        body[field] = json!("SYNTHETIC");
        expect_unknown_field(&owner.put(PATH, body).await, field);
    }
    let at_limit = "x".repeat(1_400_000);
    let stored: MailTrust = ok(owner
        .put(
            PATH,
            json!({"encryptedTrust":at_limit,"expectedEncryptedTrust":null}),
        )
        .await
        .dto());
    assert_eq!(stored.encrypted_trust.as_deref(), Some(at_limit.as_str()));
    ok(owner
        .put(
            PATH,
            json!({"encryptedTrust":"y".repeat(1_400_000),"expectedEncryptedTrust":at_limit}),
        )
        .await
        .expect_status(200));
    sqlx::query("UPDATE user_mail_trust SET encrypted_trust='' WHERE user_id=$1")
        .bind(&owner.id)
        .execute(&app.db)
        .await
        .expect("synthetic corrupt ciphertext");
    let empty: MailTrust = ok(owner.get(PATH).await.dto());
    assert_eq!(empty.encrypted_trust.as_deref(), Some(""));
    ok(owner
        .put(
            PATH,
            json!({"encryptedTrust":"SYNTHETIC-recovered","expectedEncryptedTrust":""}),
        )
        .await
        .expect_status(200));

    assert!(
        serde_json::from_value::<solace_api_types::mail::PutMailTrustRequest>(
            json!({"encryptedTrust":"SYNTHETIC"})
        )
        .is_err()
    );
}

#[tokio::test]
async fn mail_trust_first_write_race_and_stale_updates_have_one_winner() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut first = owner.agent.clone();
    let mut second = owner.agent.clone();
    let (left, right) = tokio::join!(
        first.put(
            PATH,
            json!({"encryptedTrust":"SYNTHETIC-left","expectedEncryptedTrust":null})
        ),
        second.put(
            PATH,
            json!({"encryptedTrust":"SYNTHETIC-right","expectedEncryptedTrust":null})
        )
    );
    let left = ok(left);
    let right = ok(right);
    let mut statuses = [left.status.as_u16(), right.status.as_u16()];
    statuses.sort_unstable();
    assert_eq!(statuses, [200, 409]);
    let winner: MailTrust = ok(owner.get(PATH).await.dto());
    assert!(matches!(
        winner.encrypted_trust.as_deref(),
        Some("SYNTHETIC-left" | "SYNTHETIC-right")
    ));
    assert_eq!(
        owner
            .put(
                PATH,
                json!({"encryptedTrust":"SYNTHETIC-stale","expectedEncryptedTrust":null})
            )
            .await
            .status
            .as_u16(),
        409
    );
    let unchanged: MailTrust = ok(owner.get(PATH).await.dto());
    assert_eq!(unchanged, winner);
    let reset: MailTrust=ok(owner.put(PATH,json!({"encryptedTrust":"SYNTHETIC-sealed-empty-state","expectedEncryptedTrust":winner.encrypted_trust})).await.dto());
    assert_eq!(
        reset.encrypted_trust.as_deref(),
        Some("SYNTHETIC-sealed-empty-state")
    );
}

#[tokio::test]
async fn mail_trust_survives_old_settings_writers_and_is_deleted_with_the_account() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    ok(owner
        .put(
            PATH,
            json!({"encryptedTrust":"SYNTHETIC-history","expectedEncryptedTrust":null}),
        )
        .await
        .expect_status(200));
    ok(owner
        .put("/api/settings", json!({"theme":"dark"}))
        .await
        .expect_status(200));
    ok(owner.delete("/api/settings").await.expect_status(200));
    ok(owner
        .put(
            "/api/mail-settings",
            json!({"encryptedContent":"SYNTHETIC-old-client-settings"}),
        )
        .await
        .expect_status(200));
    let unchanged: MailTrust = ok(owner.get(PATH).await.dto());
    assert_eq!(
        unchanged.encrypted_trust.as_deref(),
        Some("SYNTHETIC-history")
    );
    ok(owner.delete("/api/account").await.expect_status(200));
    assert_eq!(
        count(
            &app.db,
            "SELECT count(*) FROM user_mail_trust WHERE user_id=$1",
            &owner.id
        )
        .await,
        0
    );
}
