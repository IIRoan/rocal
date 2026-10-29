//! `/api/categories`: encrypted names, usage counts, ownership and deletion.

use serde_json::{Value, json};
use solace_api_tests::seed::{fake_envelope, fake_token};
use solace_api_types::SuccessMessage;
use solace_api_types::categories::{Category, CategoryList, CreateCategoryRequest};
use sqlx::PgPool;

use crate::calendars::{
    COLOR_MESSAGE, EventRow, create_calendar, db_json, event_row, insert_event, wire_timestamps,
};
use crate::helpers::{
    TestApp, TestUser, count, expect_field_error, expect_invalid, expect_unauthorized,
    expect_unknown_field, hex, ok,
};

const NOT_FOUND: &str = "Category not found or access denied";

fn encrypted_category(color: &str) -> CreateCategoryRequest {
    CreateCategoryRequest {
        color: color.into(),
        encrypted_name: fake_envelope(),
        blind_index_tokens: Some(vec![fake_token()]),
        encryption_key_version: Some(1),
    }
}

async fn create_category(user: &mut TestUser, color: &str) -> Category {
    create_category_with(user, &encrypted_category(color)).await
}

/// An encrypted category row straight in the database, for states the API cannot reach.
async fn insert_category(db: &PgPool, user_id: &str, active: bool) -> String {
    let id = format!("suitecat{}", hex(8));
    sqlx::query(
        "INSERT INTO event_category (id, name, encrypted_name, encryption_state, color, is_active, user_id, created_at, updated_at) \
         VALUES ($1, '', $2, 'encrypted', 'teal', $3, $4, now(), now())",
    )
    .bind(&id)
    .bind(fake_envelope())
    .bind(active)
    .bind(user_id)
    .execute(db)
    .await
    .expect("insert category");
    id
}

async fn create_category_with(user: &mut TestUser, request: &CreateCategoryRequest) -> Category {
    let body = serde_json::to_value(request).expect("request json");
    ok(user
        .post("/api/categories", body)
        .await
        .expect_status(200)
        .and_then(|r| r.dto()))
}

async fn update_category(user: &mut TestUser, id: &str, body: Value) -> Category {
    ok(user
        .put(&format!("/api/categories/{id}"), body)
        .await
        .expect_status(200)
        .and_then(|r| r.dto()))
}

async fn category_row(db: &PgPool, id: &str) -> Option<Value> {
    db_json(
        db,
        "SELECT row_to_json(c)::text FROM event_category c WHERE id = $1",
        id,
    )
    .await
}

async fn category_count(db: &PgPool, user_id: &str) -> i64 {
    count(
        db,
        "SELECT count(*) FROM event_category WHERE user_id = $1",
        user_id,
    )
    .await
}

#[tokio::test]
async fn anonymous_callers_are_refused() {
    let app = TestApp::spawn().await;
    let mut anon = app.anonymous();
    expect_unauthorized(&ok(anon.get("/api/categories").await));
    expect_unauthorized(&ok(anon
        .post(
            "/api/categories",
            json!({"encryptedName": "ct", "color": "blue"}),
        )
        .await));
    expect_unauthorized(&ok(anon
        .put("/api/categories/some-id", json!({"color": "rose"}))
        .await));
    expect_unauthorized(&ok(anon.delete("/api/categories/some-id").await));
}

#[tokio::test]
async fn create_stores_only_the_encrypted_name() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let request = encrypted_category("#123456");
    let created = create_category_with(&mut user, &request).await;

    assert_eq!(
        (created.name.as_str(), created.color.as_str()),
        ("", "#123456")
    );
    assert_eq!(
        created.encrypted_name.as_ref(),
        Some(&request.encrypted_name)
    );
    assert_eq!(created.user_id.0, user.id);
    assert!(created.is_active);
    assert_eq!(created.encryption_state, "encrypted");
    assert_eq!(created.encryption_key_version, 1);
    assert_eq!(created.created_at, created.updated_at);
    let row = category_row(&app.db, &created.id.0).await.expect("row");
    assert_eq!(
        (&row["name"], &row["user_id"], &row["encryption_state"]),
        (&json!(""), &json!(user.id), &json!("encrypted"))
    );
    assert_eq!(row["encrypted_name"], json!(request.encrypted_name));
    assert_eq!(
        wire_timestamps(&app.db, "event_category", &created.id.0).await,
        (created.created_at.0.clone(), created.updated_at.0.clone())
    );
}
#[tokio::test]
async fn the_list_holds_own_active_categories_by_name_with_usage_counts() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let mut other = app.user().await;
    let calendar = create_calendar(&mut user, "blue").await;
    let work = create_category(&mut user, "blue").await;
    let alpha = create_category(&mut user, "emerald").await;
    create_category(&mut other, "red").await;
    insert_category(&app.db, &user.id, false).await;
    for _ in 0..4 {
        let event = EventRow {
            category_id: Some(&work.id.0),
            ..EventRow::sealed()
        };
        insert_event(&app.db, &user.id, &calendar.id.0, event).await;
    }

    let list: CategoryList = ok(user
        .get("/api/categories")
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        list.categories.len(),
        2,
        "inactive and foreign ones are left out"
    );
    for (category, usage) in [(&alpha, 0), (&work, 4)] {
        let listed = list
            .categories
            .iter()
            .find(|c| c.category.id == category.id)
            .expect("listed category");
        assert_eq!((&listed.category, listed.usage_count), (category, usage));
    }
}

#[tokio::test]
async fn invalid_colors_are_rejected_with_the_allowed_list() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let target = create_category(&mut user, "blue").await;
    for color in ["chartreuse", "BLUE", "#12345", ""] {
        let created = user
            .post(
                "/api/categories",
                json!({"encryptedName": "ct", "color": color}),
            )
            .await;
        expect_invalid(&created, COLOR_MESSAGE, "color");
        let updated = user
            .put(
                &format!("/api/categories/{}", target.id),
                json!({"color": color}),
            )
            .await;
        expect_invalid(&updated, COLOR_MESSAGE, "color");
    }
    assert_eq!(category_count(&app.db, &user.id).await, 1);
    let row = category_row(&app.db, &target.id.0).await.expect("row");
    assert_eq!(row["color"], json!("blue"));
}

#[tokio::test]
async fn create_validation_reports_zod_messages() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let cases = [
        (json!({"encryptedName": "ct"}), "Required", "color"),
        (json!({"color": "blue"}), "Required", "encryptedName"),
        (
            json!({"encryptedName": 5, "color": "blue"}),
            "Expected string, received number",
            "encryptedName",
        ),
        (
            json!({"encryptedName": "ct", "color": "blue", "encryptionState": "encrypted"}),
            "Unrecognized key(s) in object: 'encryptionState'",
            "root",
        ),
        (
            json!({"encryptedName": "ct", "color": "blue", "encryptionKeyVersion": 0}),
            "Number must be greater than or equal to 1",
            "encryptionKeyVersion",
        ),
        (
            json!({"encryptedName": "ct", "color": "blue", "unexpected": true}),
            "Unrecognized key(s) in object: 'unexpected'",
            "root",
        ),
    ];
    for (body, message, path) in cases {
        let response = user.post("/api/categories", body.clone()).await;
        let error = response
            .expect_error(400, "Validation Error", message)
            .unwrap_or_else(|e| panic!("{body}: {e}"));
        assert_eq!(
            error["details"]["issues"][0]["path"],
            json!(path),
            "{body}: {error}"
        );
    }

    let blank = user
        .post("/api/categories", json!({"name": "", "color": ""}))
        .await;
    let body = expect_invalid(&blank, COLOR_MESSAGE, "color");
    assert_eq!(
        body["details"]["issues"],
        json!([
            {"path": "color", "message": COLOR_MESSAGE},
            {"path": "encryptedName", "message": "Required"},
            {"path": "root", "message": "Unrecognized key(s) in object: 'name'"},
        ])
    );
    assert_eq!(category_count(&app.db, &user.id).await, 0);
}
#[tokio::test]
async fn updates_change_name_and_color() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let created = create_category(&mut user, "blue").await;

    let updated = update_category(
        &mut user,
        &created.id.0,
        json!({"encryptedName": "renamed-ciphertext", "color": "emerald"}),
    )
    .await;
    assert_eq!(
        (
            updated.encrypted_name.as_deref(),
            updated.color.as_str(),
            updated.name.as_str()
        ),
        (Some("renamed-ciphertext"), "emerald", "")
    );
    assert_eq!(updated.encryption_state, "encrypted");
    assert_eq!(updated.created_at, created.created_at);
    assert!(updated.updated_at > created.updated_at);
    let row = category_row(&app.db, &created.id.0).await.expect("row");
    assert_eq!(
        (&row["encrypted_name"], &row["color"]),
        (&json!("renamed-ciphertext"), &json!("emerald"))
    );

    let recolored = update_category(&mut user, &created.id.0, json!({"color": "#abc"})).await;
    assert_eq!(
        (
            recolored.encrypted_name.as_deref(),
            recolored.color.as_str()
        ),
        (Some("renamed-ciphertext"), "#abc")
    );
}
#[tokio::test]
async fn encrypted_names_are_stored_byte_for_byte_beside_a_blank_name() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let ciphertext = r#"{"version":1,"iv":"AAECAwQFBgcICQoL","ciphertext":"q83v+w==/ü"}"#;

    let created = create_category_with(
        &mut user,
        &CreateCategoryRequest {
            color: "#123456".into(),
            encrypted_name: ciphertext.into(),
            blind_index_tokens: Some(vec!["idx-1".into(), "idx-2".into()]),
            encryption_key_version: Some(2),
        },
    )
    .await;
    assert_eq!(created.name, "");
    assert_eq!(created.encrypted_name.as_deref(), Some(ciphertext));
    assert_eq!(
        created.blind_index_tokens.as_deref(),
        Some(r#"["idx-1","idx-2"]"#)
    );
    assert_eq!(
        (
            created.encryption_state.as_str(),
            created.encryption_key_version
        ),
        ("encrypted", 2)
    );
    let row = category_row(&app.db, &created.id.0).await.expect("row");
    assert_eq!(
        (
            &row["name"],
            &row["encrypted_name"],
            &row["blind_index_tokens"]
        ),
        (
            &json!(""),
            &json!(ciphertext),
            &json!(r#"["idx-1","idx-2"]"#)
        )
    );

    let twin = create_category_with(
        &mut user,
        &CreateCategoryRequest {
            color: "blue".into(),
            encrypted_name: ciphertext.into(),
            ..Default::default()
        },
    )
    .await;
    assert_ne!(
        twin.id, created.id,
        "encrypted names are never checked for duplicates"
    );
    assert_eq!(
        (
            twin.blind_index_tokens.as_deref(),
            twin.encryption_key_version
        ),
        (Some("[]"), 1)
    );
}

#[tokio::test]
async fn plaintext_names_are_refused_as_unknown_keys() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let target = create_category(&mut user, "blue").await;
    let before = category_row(&app.db, &target.id.0).await;
    let created = user
        .post(
            "/api/categories",
            json!({"name": "Health", "encryptedName": "ciphertext", "color": "#123456"}),
        )
        .await;
    expect_unknown_field(&created, "name");
    let path = format!("/api/categories/{}", target.id);
    for body in [
        json!({"name": "Health"}),
        json!({"name": "Health", "encryptedName": "ciphertext"}),
    ] {
        expect_unknown_field(&user.put(&path, body).await, "name");
    }
    assert_eq!(category_count(&app.db, &user.id).await, 1);
    assert_eq!(category_row(&app.db, &target.id.0).await, before);

    for blank in ["", "   "] {
        expect_field_error(
            &user.put(&path, json!({"encryptedName": blank})).await,
            "Encrypted category name cannot be empty",
            "encryptedName",
        );
        expect_field_error(
            &user
                .post(
                    "/api/categories",
                    json!({"encryptedName": blank, "color": "blue"}),
                )
                .await,
            "Encrypted category name cannot be empty",
            "encryptedName",
        );
    }
    assert_eq!(category_row(&app.db, &target.id.0).await, before);
}
#[tokio::test]
async fn delete_detaches_events_and_removes_the_category() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar = create_calendar(&mut user, "blue").await;
    let category = create_category(&mut user, "blue").await;
    let kept = create_category(&mut user, "blue").await;
    let tagged = [
        insert_event(
            &app.db,
            &user.id,
            &calendar.id.0,
            EventRow {
                category_id: Some(&category.id.0),
                ..EventRow::sealed()
            },
        )
        .await,
        insert_event(
            &app.db,
            &user.id,
            &calendar.id.0,
            EventRow {
                category_id: Some(&category.id.0),
                ..EventRow::sealed()
            },
        )
        .await,
    ];
    let other = insert_event(
        &app.db,
        &user.id,
        &calendar.id.0,
        EventRow {
            category_id: Some(&kept.id.0),
            ..EventRow::sealed()
        },
    )
    .await;

    let deleted: SuccessMessage = ok(user
        .delete(&format!("/api/categories/{}", category.id))
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    assert_eq!(
        deleted,
        SuccessMessage {
            success: true,
            message: "Category deleted successfully".into()
        }
    );
    assert_eq!(
        category_row(&app.db, &category.id.0).await,
        None,
        "deleted, not deactivated"
    );
    for event in tagged {
        let row = event_row(&app.db, &event).await.expect("event survives");
        assert_eq!(row["category_id"], json!(null));
    }
    let row = event_row(&app.db, &other).await.expect("event");
    assert_eq!(row["category_id"], json!(kept.id.0));
}

#[tokio::test]
async fn other_users_categories_behave_as_not_found() {
    let app = TestApp::spawn().await;
    let mut owner = app.user().await;
    let mut other = app.user().await;
    let category = create_category(&mut owner, "blue").await;
    let before = category_row(&app.db, &category.id.0).await;
    let path = format!("/api/categories/{}", category.id);

    expect_field_error(
        &other.put(&path, json!({"color": "rose"})).await,
        NOT_FOUND,
        "categoryId",
    );
    expect_field_error(
        &other.put(&path, json!({"encryptedName": "ct"})).await,
        NOT_FOUND,
        "categoryId",
    );
    expect_field_error(&other.delete(&path).await, NOT_FOUND, "categoryId");
    expect_field_error(
        &owner
            .put("/api/categories/no-such-category", json!({"color": "rose"}))
            .await,
        NOT_FOUND,
        "categoryId",
    );
    expect_field_error(
        &owner.delete("/api/categories/no-such-category").await,
        NOT_FOUND,
        "categoryId",
    );

    assert_eq!(category_row(&app.db, &category.id.0).await, before);
    let list: CategoryList = ok(other.get("/api/categories").await.dto());
    assert!(list.categories.is_empty());
}

#[tokio::test]
async fn owner_ids_in_bodies_are_rejected() {
    let app = TestApp::spawn().await;
    let victim = app.user().await;
    let mut attacker = app.user().await;
    let category = create_category(&mut attacker, "blue").await;

    expect_unknown_field(
        &attacker
            .post(
                "/api/categories",
                json!({"encryptedName": "ct", "color": "blue", "userId": victim.id}),
            )
            .await,
        "userId",
    );
    expect_unknown_field(
        &attacker
            .put(
                &format!("/api/categories/{}", category.id),
                json!({"color": "rose", "userId": victim.id}),
            )
            .await,
        "userId",
    );
    assert_eq!(category_count(&app.db, &victim.id).await, 0);
    let row = category_row(&app.db, &category.id.0).await.expect("row");
    assert_eq!(
        (&row["color"], &row["user_id"]),
        (&json!("blue"), &json!(attacker.id))
    );
}
