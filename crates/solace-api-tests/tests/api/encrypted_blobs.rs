//! `/api/recent-contacts` and `/api/mail-settings`: one opaque encrypted blob per user, behind the same contract.

use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::json;
use solace_api_types::Timestamp;
use solace_api_types::mail_settings::MailSettings;
use solace_api_types::recent_contacts::RecentContacts;

use crate::helpers::{TestApp, TestUser, count, expect_unauthorized, expect_unknown_field, ok};

trait Blob: DeserializeOwned + Serialize + PartialEq + std::fmt::Debug {
    const PATH: &'static str;
    const TABLE: &'static str;
    fn fields(&self) -> (&str, i32, &Timestamp);
}

impl Blob for RecentContacts {
    const PATH: &'static str = "/api/recent-contacts";
    const TABLE: &'static str = "user_recent_contacts";
    fn fields(&self) -> (&str, i32, &Timestamp) {
        (
            &self.encrypted_content,
            self.encryption_key_version,
            &self.updated_at,
        )
    }
}

impl Blob for MailSettings {
    const PATH: &'static str = "/api/mail-settings";
    const TABLE: &'static str = "user_mail_settings";
    fn fields(&self) -> (&str, i32, &Timestamp) {
        (
            &self.encrypted_content,
            self.encryption_key_version,
            &self.updated_at,
        )
    }
}

async fn read<B: Blob>(user: &mut TestUser) -> Option<B> {
    ok(user
        .get(B::PATH)
        .await
        .expect_status(200)
        .and_then(|r| r.dto()))
}

async fn put<B: Blob>(user: &mut TestUser, body: serde_json::Value) -> B {
    ok(user
        .put(B::PATH, body)
        .await
        .expect_status(200)
        .and_then(|r| r.dto()))
}

/// The stored row with `updated_at` in the wire format.
async fn stored<B: Blob>(app: &TestApp, user_id: &str) -> Option<(String, i32, String)> {
    sqlx::query_as(&format!(
        "SELECT encrypted_content, encryption_key_version, to_char(updated_at, 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') FROM {} WHERE user_id = $1",
        B::TABLE
    ))
    .bind(user_id)
    .fetch_optional(&app.db)
    .await
    .expect("blob row")
}

async fn rows<B: Blob>(app: &TestApp, user_id: &str) -> i64 {
    count(
        &app.db,
        &format!("SELECT count(*) FROM {} WHERE user_id = $1", B::TABLE),
        user_id,
    )
    .await
}

#[tokio::test]
async fn anonymous_callers_are_refused() {
    let app = TestApp::spawn().await;
    let mut anon = app.anonymous();
    for path in [RecentContacts::PATH, MailSettings::PATH] {
        expect_unauthorized(&ok(anon.get(path).await));
        expect_unauthorized(&ok(anon.put(path, json!({"encryptedContent": "x"})).await));
    }
}

async fn reads_null<B: Blob>(app: &TestApp) {
    let mut user = app.user().await;
    let response = user.get(B::PATH).await;
    assert_eq!(response.status.as_u16(), 200);
    assert_eq!(response.text(), "null", "{}", B::PATH);
    assert!(
        response
            .headers
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| v.starts_with("application/json")),
        "{:?}",
        response.headers
    );
    assert_eq!(read::<B>(&mut user).await, None);
    assert_eq!(rows::<B>(app, &user.id).await, 0, "reading creates nothing");
}

#[tokio::test]
async fn reads_null_before_the_first_upload() {
    let app = TestApp::spawn().await;
    reads_null::<RecentContacts>(&app).await;
    reads_null::<MailSettings>(&app).await;
}

async fn uploads_replace<B: Blob>(app: &TestApp) {
    let mut user = app.user().await;
    let first = "{\"version\":1,\"algorithm\":\"AES-GCM\",\"iv\":\"AAEC\",\"ciphertext\":\"3q2+7w==\"}\n\u{e9}\u{1F600}";

    let created: B = put(&mut user, json!({"encryptedContent": first})).await;
    let (content, version, created_at) = created.fields();
    assert_eq!((content, version), (first, 1), "{}", B::PATH);
    assert_eq!(
        stored::<B>(app, &user.id).await,
        Some((first.to_owned(), 1, created_at.0.clone())),
        "stored byte for byte"
    );
    assert_eq!(read::<B>(&mut user).await.as_ref(), Some(&created));

    let rotated: B = put(
        &mut user,
        json!({"encryptedContent": "second", "encryptionKeyVersion": 3}),
    )
    .await;
    let (content, version, rotated_at) = rotated.fields();
    assert_eq!((content, version), ("second", 3));
    assert!(rotated_at > created_at, "{rotated_at:?} > {created_at:?}");

    let kept: B = put(&mut user, json!({"encryptedContent": "third"})).await;
    assert_eq!(
        (kept.fields().0, kept.fields().1),
        ("third", 3),
        "an omitted version keeps the stored one"
    );
    assert_eq!(read::<B>(&mut user).await.as_ref(), Some(&kept));
    assert_eq!(rows::<B>(app, &user.id).await, 1, "one row per user");
}

#[tokio::test]
async fn uploads_create_then_replace_the_blob() {
    let app = TestApp::spawn().await;
    uploads_replace::<RecentContacts>(&app).await;
    uploads_replace::<MailSettings>(&app).await;
}

async fn validates<B: Blob>(app: &TestApp) {
    let mut user = app.user().await;
    let cases = [
        (json!({}), "Required", "encryptedContent"),
        (
            json!({"encryptedContent": ""}),
            "String must contain at least 1 character(s)",
            "encryptedContent",
        ),
        (
            json!({"encryptedContent": "a".repeat(65_537)}),
            "String must contain at most 65536 character(s)",
            "encryptedContent",
        ),
        (
            json!({"encryptedContent": "\u{1F600}".repeat(32_769)}),
            "String must contain at most 65536 character(s)",
            "encryptedContent",
        ),
        (
            json!({"encryptedContent": 5}),
            "Expected string, received number",
            "encryptedContent",
        ),
        (
            json!({"encryptedContent": "x", "encryptionKeyVersion": 0}),
            "Number must be greater than or equal to 1",
            "encryptionKeyVersion",
        ),
        (
            json!({"encryptedContent": "x", "encryptionKeyVersion": 1001}),
            "Number must be less than or equal to 1000",
            "encryptionKeyVersion",
        ),
        (
            json!({"encryptedContent": "x", "encryptionKeyVersion": 1.5}),
            "Expected integer, received float",
            "encryptionKeyVersion",
        ),
        (
            json!({"encryptedContent": "x", "encryptionKeyVersion": "2"}),
            "Expected number, received string",
            "encryptionKeyVersion",
        ),
        (
            json!({"encryptedContent": "x", "encryptionKeyVersion": null}),
            "Expected number, received null",
            "encryptionKeyVersion",
        ),
        (json!(null), "Expected object, received null", "root"),
    ];
    for (case, (body, message, path)) in cases.into_iter().enumerate() {
        let response = user.put(B::PATH, body).await;
        let error = response
            .expect_error(400, "Validation Error", message)
            .unwrap_or_else(|e| panic!("{} case {case}: {e}", B::PATH));
        assert_eq!(
            error["details"]["issues"][0]["path"],
            json!(path),
            "{}",
            B::PATH
        );
    }
    expect_unknown_field(
        &user
            .put(
                B::PATH,
                json!({"encryptedContent": "x", "userId": "someone"}),
            )
            .await,
        "userId",
    );
    assert_eq!(rows::<B>(app, &user.id).await, 0);

    // 32768 emoji are exactly 65536 UTF-16 code units.
    let at_limit = "\u{1F600}".repeat(32_768);
    let stored_blob: B = put(
        &mut user,
        json!({"encryptedContent": at_limit, "encryptionKeyVersion": 1000}),
    )
    .await;
    let (content, version, _) = stored_blob.fields();
    assert_eq!((content, version), (at_limit.as_str(), 1000));
}

#[tokio::test]
async fn the_body_is_validated() {
    let app = TestApp::spawn().await;
    validates::<RecentContacts>(&app).await;
    validates::<MailSettings>(&app).await;
}

async fn isolated<B: Blob>(app: &TestApp) {
    let mut owner = app.user().await;
    let mut other = app.user().await;
    let owned: B = put(&mut owner, json!({"encryptedContent": "owner-secret"})).await;

    assert_eq!(read::<B>(&mut other).await, None);
    expect_unknown_field(
        &other
            .put(
                B::PATH,
                json!({"encryptedContent": "planted", "userId": owner.id}),
            )
            .await,
        "userId",
    );
    let theirs: B = put(&mut other, json!({"encryptedContent": "other-secret"})).await;
    assert_eq!(theirs.fields().0, "other-secret");
    assert_eq!(read::<B>(&mut owner).await.as_ref(), Some(&owned));
    assert_eq!(
        stored::<B>(app, &owner.id)
            .await
            .map(|row| row.0)
            .as_deref(),
        Some("owner-secret")
    );
}

#[tokio::test]
async fn each_user_reads_and_writes_only_their_own_blob() {
    let app = TestApp::spawn().await;
    isolated::<RecentContacts>(&app).await;
    isolated::<MailSettings>(&app).await;
}
