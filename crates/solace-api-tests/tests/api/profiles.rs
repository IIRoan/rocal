//! `/api/profiles`: avatar lookup, the authenticated WebP proxy, uploads stored only as re-encoded variants, and their cleanup.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use serde_json::{Value, json};
use solace_api_tests::client::ApiResponse;
use solace_api_types::profiles::{
    AvatarResponse, ProfileLookupRequest, ProfileLookupResponse, SolaceProfile, UploadAvatarRequest,
};

use crate::helpers::{
    TestApp, TestUser, expect_field_error, expect_invalid, expect_unauthorized,
    expect_unknown_field, fixture, header, hex, json_body, ok,
};

const UPLOAD_PREFIX: &str = "/api/profiles/avatars/";
const BAD_PICTURE: &str = "Profile picture must be a square JPEG, PNG or WebP image up to 512px.";

pub(crate) async fn upload(user: &mut TestUser, picture: &[u8]) -> ApiResponse {
    user.put(
        "/api/profiles/me/avatar",
        json_body(&UploadAvatarRequest {
            image: STANDARD.encode(picture),
        }),
    )
    .await
}

/// Uploads a fixture and returns the new avatar id.
pub(crate) async fn upload_fixture(user: &mut TestUser, name: &str) -> String {
    let uploaded: AvatarResponse = ok(upload(user, &fixture(name))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    let path = uploaded.image.expect("uploaded image path");
    path.strip_prefix(UPLOAD_PREFIX)
        .expect("opaque avatar path")
        .to_owned()
}

/// `(avatar_id, pending_avatar_id, image)` of a user row.
pub(crate) async fn avatar_state(
    app: &TestApp,
    user_id: &str,
) -> (Option<String>, Option<String>, Option<String>) {
    sqlx::query_as("SELECT avatar_id, pending_avatar_id, image FROM \"user\" WHERE id = $1")
        .bind(user_id)
        .fetch_one(&app.db)
        .await
        .expect("user row")
}

/// Whether the bucket still holds an avatar's objects; only attached ids are served, so a scratch account borrows the id.
pub(crate) async fn stored_objects_exist(
    app: &TestApp,
    viewer: &mut TestUser,
    avatar_id: &str,
) -> bool {
    let scratch = format!("suiteavatar{}", hex(8));
    sqlx::query(
        "INSERT INTO \"user\" (id, name, email, email_verified, avatar_id, created_at, updated_at) \
         VALUES ($1, 'Scratch', $2, true, $3, now(), now())",
    )
    .bind(&scratch)
    .bind(format!("{scratch}@example.com"))
    .bind(avatar_id)
    .execute(&app.db)
    .await
    .expect("borrow avatar id");
    let status = viewer
        .get(&format!("{UPLOAD_PREFIX}{avatar_id}"))
        .await
        .status;
    sqlx::query("DELETE FROM \"user\" WHERE id = $1")
        .bind(&scratch)
        .execute(&app.db)
        .await
        .expect("drop scratch user");
    match status.as_u16() {
        200 => true,
        404 => false,
        other => panic!("unexpected {other} for a borrowed avatar id"),
    }
}

/// Width and height from a WebP header (lossy `VP8 `, lossless `VP8L` or extended `VP8X`).
fn webp_size(bytes: &[u8]) -> (u32, u32) {
    assert!(
        bytes.len() > 30 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP",
        "not a WebP image"
    );
    let le = |range: std::ops::Range<usize>| {
        bytes[range]
            .iter()
            .rev()
            .fold(0u32, |acc, byte| (acc << 8) | u32::from(*byte))
    };
    match &bytes[12..16] {
        b"VP8 " => (le(26..28) & 0x3fff, le(28..30) & 0x3fff),
        b"VP8L" => {
            let bits = le(21..25);
            ((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1)
        }
        b"VP8X" => (le(24..27) + 1, le(27..30) + 1),
        other => panic!("unknown WebP chunk {other:?}"),
    }
}

/// A served variant: WebP bytes with the given cache policy; returns its edge length.
fn expect_webp(response: &ApiResponse, cache_control: &str) -> u32 {
    assert_eq!(response.status.as_u16(), 200, "{}", response.text());
    assert_eq!(header(response, "content-type"), Some("image/webp"));
    assert_eq!(header(response, "cache-control"), Some(cache_control));
    let (width, height) = webp_size(&response.body);
    assert_eq!(width, height, "variants are square");
    width
}

/// The routes answer a missing picture with a bare 404 and no body.
fn expect_no_picture(response: &ApiResponse) {
    assert_eq!(response.status.as_u16(), 404, "{}", response.text());
    assert!(response.body.is_empty(), "{}", response.text());
}

const UPLOADED_CACHE: &str = "private, max-age=86400, immutable";
const PROXY_CACHE: &str = "private, max-age=300";

async fn insert_person(app: &TestApp, email: &str, image: Option<&str>) -> String {
    let id = format!("suiteperson{}", hex(8));
    sqlx::query(
        "INSERT INTO \"user\" (id, name, email, email_verified, image, created_at, updated_at) \
         VALUES ($1, 'Someone', $2, true, $3, now(), now())",
    )
    .bind(&id)
    .bind(email)
    .bind(image)
    .execute(&app.db)
    .await
    .expect("insert person");
    id
}

async fn lookup(user: &mut TestUser, emails: &[&str]) -> ProfileLookupResponse {
    ok(user
        .post(
            "/api/profiles/lookup",
            json_body(&ProfileLookupRequest {
                emails: emails.iter().map(|e| (*e).to_owned()).collect(),
            }),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.dto()))
}

#[tokio::test]
async fn anonymous_callers_are_refused() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let avatar_id = upload_fixture(&mut owner, "avatar.png").await;
    let mut anon = app.anonymous();
    expect_unauthorized(&ok(anon
        .post("/api/profiles/lookup", json!({"emails": [owner.email]}))
        .await));
    expect_unauthorized(&ok(anon
        .get(&format!("/api/profiles/avatar?email={}", owner.email))
        .await));
    expect_unauthorized(&ok(anon.get(&format!("{UPLOAD_PREFIX}{avatar_id}")).await));
    expect_unauthorized(&ok(anon
        .put(
            "/api/profiles/me/avatar",
            json!({"image": STANDARD.encode(fixture("avatar.png"))}),
        )
        .await));
    expect_unauthorized(&ok(anon.delete("/api/profiles/me/avatar").await));
    assert_eq!(
        avatar_state(&app, &owner.id).await.0.as_deref(),
        Some(avatar_id.as_str())
    );
}

#[tokio::test]
async fn an_upload_is_stored_only_as_re_encoded_webp_variants() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let original = fixture("avatar-512.png");
    let uploaded: AvatarResponse = ok(upload(&mut user, &original)
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    let path = uploaded.image.clone().expect("path");
    let avatar_id = path.strip_prefix(UPLOAD_PREFIX).expect("opaque path");
    assert_eq!(avatar_id.len(), 22);
    assert!(
        avatar_id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'),
        "{avatar_id}"
    );
    assert_eq!(
        avatar_state(&app, &user.id).await,
        (Some(avatar_id.to_owned()), None, Some(path.clone()))
    );

    let served = user.get(&path).await;
    assert_eq!(expect_webp(&served, UPLOADED_CACHE), 512);
    assert_ne!(served.body, original, "the upload itself is never stored");

    let again = upload_fixture(&mut user, "avatar-512.png").await;
    assert_ne!(again, avatar_id, "every upload gets a fresh id");
}

#[tokio::test]
async fn the_smallest_covering_variant_is_served() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let avatar_id = upload_fixture(&mut user, "avatar-512.png").await;
    for (size, edge) in [
        ("", 512),
        ("?size=1", 32),
        ("?size=32", 32),
        ("?size=33", 64),
        ("?size=64", 64),
        ("?size=100", 128),
        ("?size=128", 128),
        ("?size=200", 256),
        ("?size=300", 512),
        ("?size=512", 512),
        ("?size=4096", 512),
        ("?size=", 512),
    ] {
        let served = user.get(&format!("{UPLOAD_PREFIX}{avatar_id}{size}")).await;
        assert_eq!(expect_webp(&served, UPLOADED_CACHE), edge, "{size}");
    }

    let mut small = app.user().await;
    let small_id = upload_fixture(&mut small, "avatar.png").await;
    for (size, edge) in [("?size=512", 64), ("?size=64", 64), ("?size=32", 32)] {
        let served = small.get(&format!("{UPLOAD_PREFIX}{small_id}{size}")).await;
        assert_eq!(
            expect_webp(&served, UPLOADED_CACHE),
            edge,
            "a 64px upload is never enlarged ({size})"
        );
    }
}

#[tokio::test]
async fn any_signed_in_user_can_see_an_uploaded_avatar() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut viewer = app.user().await;
    let avatar_id = upload_fixture(&mut owner, "avatar-512.png").await;

    let own = owner.get(&format!("{UPLOAD_PREFIX}{avatar_id}")).await;
    let seen = viewer.get(&format!("{UPLOAD_PREFIX}{avatar_id}")).await;
    expect_webp(&seen, UPLOADED_CACHE);
    assert_eq!(seen.body, own.body);

    assert_eq!(
        lookup(&mut viewer, &[&owner.email]).await,
        ProfileLookupResponse {
            profiles: vec![SolaceProfile {
                email: owner.email.clone(),
                image: format!("{UPLOAD_PREFIX}{avatar_id}"),
            }]
        }
    );
    let proxied = viewer
        .get(&format!(
            "/api/profiles/avatar?email={}&size=64",
            owner.email.to_uppercase()
        ))
        .await;
    assert_eq!(expect_webp(&proxied, PROXY_CACHE), 64);
    let default = viewer
        .get(&format!("/api/profiles/avatar?email={}", owner.email))
        .await;
    assert_eq!(expect_webp(&default, PROXY_CACHE), 512);
}

#[tokio::test]
async fn replacing_a_picture_retires_the_previous_objects() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let first = upload_fixture(&mut user, "avatar.png").await;
    let second = upload_fixture(&mut user, "avatar-512.png").await;

    assert_eq!(
        avatar_state(&app, &user.id).await,
        (
            Some(second.clone()),
            None,
            Some(format!("{UPLOAD_PREFIX}{second}"))
        )
    );
    expect_no_picture(&user.get(&format!("{UPLOAD_PREFIX}{first}")).await);
    assert!(
        !stored_objects_exist(&app, &mut user, &first).await,
        "the replaced picture's objects are deleted"
    );
    expect_webp(
        &user.get(&format!("{UPLOAD_PREFIX}{second}")).await,
        UPLOADED_CACHE,
    );
}

#[tokio::test]
async fn removing_a_picture_clears_the_reference_and_its_objects() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let avatar_id = upload_fixture(&mut user, "avatar.png").await;

    let removed: AvatarResponse = ok(user
        .delete("/api/profiles/me/avatar")
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(removed, AvatarResponse { image: None });
    assert_eq!(avatar_state(&app, &user.id).await, (None, None, None));
    expect_no_picture(&user.get(&format!("{UPLOAD_PREFIX}{avatar_id}")).await);
    assert!(!stored_objects_exist(&app, &mut user, &avatar_id).await);
    let email = user.email.clone();
    assert!(lookup(&mut user, &[&email]).await.profiles.is_empty());

    let again: AvatarResponse = ok(user
        .delete("/api/profiles/me/avatar")
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(again.image, None, "removing twice is fine");
}

#[tokio::test]
async fn invalid_pictures_are_rejected_and_the_current_one_kept() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let current = upload_fixture(&mut user, "avatar.png").await;
    let before = avatar_state(&app, &user.id).await;

    for picture in [
        fixture("avatar-wide.png"),
        fixture("avatar-large.png"),
        b"hello".to_vec(),
    ] {
        expect_field_error(&upload(&mut user, &picture).await, BAD_PICTURE, "image");
    }
    expect_field_error(
        &user
            .put("/api/profiles/me/avatar", json!({"image": "!!!!"}))
            .await,
        BAD_PICTURE,
        "image",
    );
    for (image, message) in [
        (json!(""), "String must contain at least 1 character(s)"),
        (
            json!("A".repeat(699_053)),
            "String must contain at most 699052 character(s)",
        ),
        (Value::Null, "Expected string, received null"),
    ] {
        expect_invalid(
            &user
                .put("/api/profiles/me/avatar", json!({"image": image}))
                .await,
            message,
            "image",
        );
    }
    expect_unknown_field(
        &user
            .put(
                "/api/profiles/me/avatar",
                json!({"image": STANDARD.encode(fixture("avatar.png")), "userId": user.id}),
            )
            .await,
        "userId",
    );

    assert_eq!(
        avatar_state(&app, &user.id).await,
        before,
        "failed uploads leave no pending slot"
    );
    expect_webp(
        &user.get(&format!("{UPLOAD_PREFIX}{current}")).await,
        UPLOADED_CACHE,
    );
}

#[tokio::test]
async fn an_interrupted_upload_is_cleaned_before_the_next_one() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let interrupted = upload_fixture(&mut user, "avatar.png").await;
    // As if the upload had stored its objects but never committed the switch.
    sqlx::query(
        "UPDATE \"user\" SET pending_avatar_id = avatar_id, avatar_id = NULL, image = NULL WHERE id = $1",
    )
    .bind(&user.id)
    .execute(&app.db)
    .await
    .expect("simulate an interrupted upload");

    let next = upload_fixture(&mut user, "avatar-512.png").await;
    assert_eq!(
        avatar_state(&app, &user.id).await,
        (
            Some(next.clone()),
            None,
            Some(format!("{UPLOAD_PREFIX}{next}"))
        )
    );
    assert!(!stored_objects_exist(&app, &mut user, &interrupted).await);
}

#[tokio::test]
async fn concurrent_uploads_leave_exactly_one_picture() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let picture = STANDARD.encode(fixture("avatar.png"));
    let mut uploads = tokio::task::JoinSet::new();
    for _ in 0..4 {
        let mut agent = user.agent.clone();
        let body = json!({"image": picture});
        uploads.spawn(async move { agent.put("/api/profiles/me/avatar", body).await });
    }
    let responses = uploads.join_all().await;

    let mut stored = Vec::new();
    for response in responses.into_iter().map(ok) {
        match response.status.as_u16() {
            200 => {
                let uploaded: AvatarResponse = ok(response.dto());
                let path = uploaded.image.expect("path");
                stored.push(path.trim_start_matches(UPLOAD_PREFIX).to_owned());
            }
            _ => {
                ok(response.expect_error(
                    409,
                    "Conflict",
                    "Profile picture changed. Please try again.",
                ));
            }
        }
    }
    assert!(!stored.is_empty(), "at least one upload wins");
    let (avatar_id, pending, image) = avatar_state(&app, &user.id).await;
    let avatar_id = avatar_id.expect("a current picture");
    assert!(stored.contains(&avatar_id), "{avatar_id} not in {stored:?}");
    assert_eq!(pending, None);
    assert_eq!(image, Some(format!("{UPLOAD_PREFIX}{avatar_id}")));
    for retired in stored.iter().filter(|id| **id != avatar_id) {
        assert!(
            !stored_objects_exist(&app, &mut user, retired).await,
            "{retired}"
        );
    }
}

#[tokio::test]
async fn lookup_returns_paths_only_for_people_with_a_usable_picture() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut viewer = app.user().await;
    let avatar_id = upload_fixture(&mut owner, "avatar.png").await;
    let tag = hex(6);
    let external = format!("ext-{tag}@example.com");
    let plain_http = format!("http-{tag}@example.com");
    let reserved = format!("root+{tag}@example.com");
    let no_picture = format!("nopic-{tag}@example.com");
    insert_person(&app, &external, Some("https://192.0.2.10/me.png")).await;
    insert_person(&app, &plain_http, Some("http://192.0.2.10/me.png")).await;
    insert_person(&app, &reserved, Some("https://192.0.2.10/root.png")).await;
    insert_person(&app, &no_picture, None).await;
    let real = insert_person(
        &app,
        &format!("real-{tag}@example.com"),
        Some("https://192.0.2.10/alias.png"),
    )
    .await;
    let alias = format!("alias-{tag}@solace.test");
    sqlx::query(
        "INSERT INTO mail_directory_entry (id, user_id, email, local_part, domain, stalwart_account_id, stalwart_domain_id, \
         public_key_armored, public_key_fingerprint, created_at, updated_at) \
         VALUES ($1, $2, $3, $4, 'solace.test', $5, 'suite', 'armored', 'fingerprint', now(), now())",
    )
    .bind(format!("suitedir{}", hex(8)))
    .bind(&real)
    .bind(&alias)
    .bind(format!("alias-{tag}"))
    .bind(format!("suite{}", hex(8)))
    .execute(&app.db)
    .await
    .expect("insert directory entry");

    let found = lookup(
        &mut viewer,
        &[
            &format!("  {}  ", owner.email.to_uppercase()),
            &owner.email,
            &format!("mailto:{}", owner.email),
            &external,
            &plain_http,
            &reserved,
            &no_picture,
            &alias,
            "not-an-email",
        ],
    )
    .await;
    assert_eq!(
        found.profiles,
        [
            SolaceProfile {
                email: owner.email.clone(),
                image: format!("{UPLOAD_PREFIX}{avatar_id}"),
            },
            SolaceProfile {
                email: external.clone(),
                image: format!(
                    "/api/profiles/avatar?email={}",
                    external.replace('@', "%40")
                ),
            },
            SolaceProfile {
                email: alias.clone(),
                image: format!("/api/profiles/avatar?email={}", alias.replace('@', "%40")),
            },
        ]
    );
    assert!(lookup(&mut viewer, &[]).await.profiles.is_empty());
    assert!(lookup(&mut viewer, &["x", "y@"]).await.profiles.is_empty());
}

#[tokio::test]
async fn lookup_validates_the_batch() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let many: Vec<String> = (0..51).map(|i| format!("u{i}@example.com")).collect();
    let cases = [
        (
            json!({"emails": many}),
            "Array must contain at most 50 element(s)",
            "emails",
        ),
        (
            json!({"emails": ["   "]}),
            "String must contain at least 1 character(s)",
            "emails.0",
        ),
        (
            json!({"emails": ["a@example.com", format!("{}@example.com", "a".repeat(243))]}),
            "String must contain at most 254 character(s)",
            "emails.1",
        ),
        (
            json!({"emails": "a@example.com"}),
            "Expected array, received string",
            "emails",
        ),
        (json!({}), "Required", "emails"),
    ];
    for (body, message, path) in cases {
        expect_invalid(
            &user.post("/api/profiles/lookup", body.clone()).await,
            message,
            path,
        );
    }
    expect_unknown_field(
        &user
            .post(
                "/api/profiles/lookup",
                json!({"emails": [], "userId": user.id}),
            )
            .await,
        "userId",
    );
    let fifty: Vec<String> = (0..50)
        .map(|i| format!("u{i}-{}@example.com", hex(4)))
        .collect();
    let refs: Vec<&str> = fifty.iter().map(String::as_str).collect();
    assert!(lookup(&mut user, &refs).await.profiles.is_empty());
}

#[tokio::test]
async fn the_email_proxy_refuses_private_hosts_and_unknown_people() {
    let app = TestApp::spawn().await;
    let mut viewer = app.user().await;
    let tag = hex(6);
    let cases = [
        (
            format!("doc-{tag}@example.com"),
            Some("https://192.0.2.10/me.png"),
        ),
        (
            format!("mapped-{tag}@example.com"),
            Some("https://[::ffff:7f00:1]/me.png"),
        ),
        (
            format!("plain-{tag}@example.com"),
            Some("http://192.0.2.10/me.png"),
        ),
        (
            format!("loop-{tag}@example.com"),
            Some("https://127.0.0.1/me.png"),
        ),
        (
            format!("admin+{tag}@example.com"),
            Some("https://192.0.2.10/me.png"),
        ),
        (format!("nopic-{tag}@example.com"), None),
    ];
    for (email, image) in &cases {
        insert_person(&app, email, *image).await;
        expect_no_picture(
            &viewer
                .get(&format!("/api/profiles/avatar?email={email}"))
                .await,
        );
    }
    expect_no_picture(
        &viewer
            .get(&format!(
                "/api/profiles/avatar?email=nobody-{tag}@example.com"
            ))
            .await,
    );
}

#[tokio::test]
async fn avatar_queries_are_validated() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let avatar_id = upload_fixture(&mut user, "avatar.png").await;
    let email_cases = [
        ("/api/profiles/avatar", "Required", "email"),
        (
            "/api/profiles/avatar?email=%20",
            "String must contain at least 1 character(s)",
            "email",
        ),
        (
            "/api/profiles/avatar?email=a@example.com&size=0",
            "Number must be greater than or equal to 1",
            "size",
        ),
        (
            "/api/profiles/avatar?email=a@example.com&size=4097",
            "Number must be less than or equal to 4096",
            "size",
        ),
        (
            "/api/profiles/avatar?email=a@example.com&size=abc",
            "Expected number, received nan",
            "size",
        ),
        (
            "/api/profiles/avatar?email=a@example.com&size=1.5",
            "Expected integer, received float",
            "size",
        ),
    ];
    for (path, message, field) in email_cases {
        expect_invalid(&user.get(path).await, message, field);
    }
    let long = format!("{}@example.com", "a".repeat(243));
    expect_invalid(
        &user
            .get(&format!("/api/profiles/avatar?email={long}"))
            .await,
        "String must contain at most 254 character(s)",
        "email",
    );
    expect_unknown_field(
        &user
            .get("/api/profiles/avatar?email=a@example.com&userId=x")
            .await,
        "userId",
    );
    for (query, message) in [
        ("?size=0", "Number must be greater than or equal to 1"),
        ("?size=4097", "Number must be less than or equal to 4096"),
        ("?size=abc", "Expected number, received nan"),
    ] {
        expect_invalid(
            &user
                .get(&format!("{UPLOAD_PREFIX}{avatar_id}{query}"))
                .await,
            message,
            "size",
        );
    }
    expect_unknown_field(
        &user
            .get(&format!("{UPLOAD_PREFIX}{avatar_id}?email=a@example.com"))
            .await,
        "email",
    );
    for malformed in ["short", "AAAAAAAAAAAAAAAAAAAAA!", "AAAAAAAAAAAAAAAAAAAAAAA"] {
        expect_invalid(
            &user.get(&format!("{UPLOAD_PREFIX}{malformed}")).await,
            "Invalid",
            "avatarId",
        );
    }
}

#[tokio::test]
async fn uploaded_avatars_resolve_only_while_attached_and_stored() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let unknown = "AAAAAAAAAAAAAAAAAAAAAA";
    expect_no_picture(&user.get(&format!("{UPLOAD_PREFIX}{unknown}")).await);
    // Attached but never stored: the bucket has no variant for it.
    let never_stored: String = format!("{}{}", hex(8), "_-abcd");
    assert!(!stored_objects_exist(&app, &mut user, &never_stored).await);
}

async fn update_user(user: &mut TestUser, body: Value) {
    let updated = ok(user
        .post("/api/auth/update-user", body)
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    assert_eq!(updated, json!({"status": true}));
}

#[tokio::test]
async fn a_legacy_image_change_retires_the_uploaded_picture() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let avatar_id = upload_fixture(&mut user, "avatar.png").await;
    update_user(&mut user, json!({"image": "https://192.0.2.10/me.png"})).await;
    assert_eq!(
        avatar_state(&app, &user.id).await,
        (None, None, Some("https://192.0.2.10/me.png".into()))
    );
    assert!(!stored_objects_exist(&app, &mut user, &avatar_id).await);
    let email = user.email.clone();
    assert_eq!(
        lookup(&mut user, &[&email]).await.profiles[0].image,
        format!("/api/profiles/avatar?email={}", email.replace('@', "%40"))
    );
}

#[tokio::test]
async fn legacy_updates_that_keep_the_image_keep_the_upload() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let avatar_id = upload_fixture(&mut user, "avatar.png").await;
    let path = format!("{UPLOAD_PREFIX}{avatar_id}");
    update_user(&mut user, json!({"name": "Renamed"})).await;
    update_user(&mut user, json!({"image": path})).await;
    assert_eq!(
        avatar_state(&app, &user.id).await,
        (Some(avatar_id.clone()), None, Some(path.clone()))
    );
    expect_webp(&user.get(&path).await, UPLOADED_CACHE);
}

#[tokio::test]
async fn a_legacy_image_removal_clears_the_uploaded_reference() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let avatar_id = upload_fixture(&mut user, "avatar.png").await;
    update_user(&mut user, json!({"image": null})).await;
    assert_eq!(avatar_state(&app, &user.id).await, (None, None, None));
    assert!(!stored_objects_exist(&app, &mut user, &avatar_id).await);
}

#[tokio::test]
async fn avatar_writes_are_rate_limited_per_user() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let mut other = app.user().await;
    for _ in 0..10 {
        ok(user
            .delete("/api/profiles/me/avatar")
            .await
            .expect_status(200));
    }
    let limited = upload(&mut user, &fixture("avatar.png")).await;
    assert_eq!(limited.status.as_u16(), 429, "{}", limited.text());
    let error = ok(limited.value());
    assert_eq!(error["error"], "Too Many Requests", "{error}");
    assert!(
        header(&limited, "retry-after")
            .is_some_and(|v| v.parse::<u64>().is_ok_and(|s| (1..=60).contains(&s))),
        "{:?}",
        limited.headers
    );
    assert_eq!(avatar_state(&app, &user.id).await, (None, None, None));
    ok(other
        .delete("/api/profiles/me/avatar")
        .await
        .expect_status(200));
}
