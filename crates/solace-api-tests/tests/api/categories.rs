//! `/api/categories`: plaintext and encrypted names, usage counts, ownership and deletion.

use serde_json::{Value, json};
use solace_api_types::SuccessMessage;
use solace_api_types::categories::{Category, CategoryList, CreateCategoryRequest};
use sqlx::PgPool;

use crate::calendars::{
    COLOR_MESSAGE, EventRow, PLAINTEXT_BESIDE_CIPHERTEXT, add_encryption_device, create_calendar,
    db_json, event_row, expect_field_error, expect_issue, insert_event,
};
use crate::helpers::{
    TestApp, TestUser, count, expect_unauthorized, expect_unknown_field, hex, ok,
};

const NOT_FOUND: &str = "Category not found or access denied";
const DUPLICATE: &str = "A category with this name already exists";

async fn create_category(user: &mut TestUser, name: &str, color: &str) -> Category {
    let request = CreateCategoryRequest {
        name: Some(name.into()),
        color: color.into(),
        ..Default::default()
    };
    create_category_with(user, &request).await
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
        .post("/api/categories", json!({"name": "Work", "color": "blue"}))
        .await));
    expect_unauthorized(&ok(anon
        .put("/api/categories/some-id", json!({"color": "rose"}))
        .await));
    expect_unauthorized(&ok(anon.delete("/api/categories/some-id").await));
}

#[tokio::test]
async fn create_trims_plaintext_names() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let created = create_category(&mut user, "  Work  ", "#123456").await;

    assert_eq!(
        (created.name.as_str(), created.color.as_str()),
        ("Work", "#123456")
    );
    assert_eq!(created.user_id.0, user.id);
    assert!(created.is_active);
    assert_eq!(created.encryption_state, "plaintext");
    assert_eq!(
        (&created.encrypted_name, &created.blind_index_tokens),
        (&None, &None)
    );
    assert_eq!(created.encryption_key_version, 1);
    assert_eq!(created.created_at, created.updated_at);
    let row = category_row(&app.db, &created.id.0).await.expect("row");
    assert_eq!(
        (&row["name"], &row["user_id"], &row["encryption_state"]),
        (&json!("Work"), &json!(user.id), &json!("plaintext"))
    );
}

#[tokio::test]
async fn the_list_holds_own_active_categories_by_name_with_usage_counts() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let mut other = app.user().await;
    let calendar = create_calendar(&mut user, "Cal", "blue").await;
    let work = create_category(&mut user, "Work", "blue").await;
    let alpha = create_category(&mut user, "Alpha", "emerald").await;
    create_category(&mut other, "Foreign", "red").await;
    sqlx::query(
        "INSERT INTO event_category (id, name, color, is_active, user_id, created_at, updated_at) \
         VALUES ($1, 'Archived', 'teal', false, $2, now(), now())",
    )
    .bind(format!("suitecat{}", hex(8)))
    .bind(&user.id)
    .execute(&app.db)
    .await
    .expect("insert inactive category");
    for _ in 0..4 {
        let event = EventRow {
            category_id: Some(&work.id.0),
            ..Default::default()
        };
        insert_event(&app.db, &user.id, &calendar.id.0, event).await;
    }

    let list: CategoryList = ok(user
        .get("/api/categories")
        .await
        .expect_status(200)
        .and_then(|r| r.dto()));
    let summary: Vec<(&str, i64)> = list
        .categories
        .iter()
        .map(|c| (c.category.name.as_str(), c.usage_count))
        .collect();
    assert_eq!(summary, [("Alpha", 0), ("Work", 4)]);
    assert_eq!(list.categories[0].category, alpha);
    assert_eq!(list.categories[1].category, work);
}

#[tokio::test]
async fn invalid_colors_are_rejected_with_the_allowed_list() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let target = create_category(&mut user, "Target", "blue").await;
    for color in ["chartreuse", "BLUE", "#12345", ""] {
        let created = user
            .post("/api/categories", json!({"name": "Work", "color": color}))
            .await;
        expect_issue(&created, COLOR_MESSAGE, "color");
        let updated = user
            .put(
                &format!("/api/categories/{}", target.id),
                json!({"color": color}),
            )
            .await;
        expect_issue(&updated, COLOR_MESSAGE, "color");
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
        (json!({"name": "Work"}), "Required", "color"),
        (
            json!({"name": 5, "color": "blue"}),
            "Expected string, received number",
            "name",
        ),
        (
            json!({"name": "Work", "color": "blue", "encryptionState": "invalid_state"}),
            "Invalid enum value. Expected 'plaintext' | 'shadow_write' | 'encrypted', received 'invalid_state'",
            "encryptionState",
        ),
        (
            json!({"name": "Work", "color": "blue", "encryptionKeyVersion": 0}),
            "Number must be greater than or equal to 1",
            "encryptionKeyVersion",
        ),
        (
            json!({"name": "Work", "color": "blue", "unexpected": true}),
            "Unrecognized key(s) in object: 'unexpected'",
            "root",
        ),
        (
            json!({"color": "blue"}),
            "Category name is required.",
            "encryptedName",
        ),
        (
            json!({"name": "  ", "color": "blue"}),
            "Category name is required.",
            "encryptedName",
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
    let body = expect_issue(&blank, COLOR_MESSAGE, "color");
    assert_eq!(
        body["details"]["issues"],
        json!([
            {"path": "color", "message": COLOR_MESSAGE},
            {"path": "encryptedName", "message": "Category name is required."},
        ])
    );
    assert_eq!(category_count(&app.db, &user.id).await, 0);
}

#[tokio::test]
async fn names_are_at_most_100_utf16_units_after_trimming() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    for name in ["x".repeat(101), "\u{1F600}".repeat(51)] {
        let response = user
            .post("/api/categories", json!({"name": name, "color": "blue"}))
            .await;
        expect_field_error(
            &response,
            "Category name cannot exceed 100 characters",
            "name",
        );
    }
    assert_eq!(category_count(&app.db, &user.id).await, 0);

    let padded = create_category(&mut user, &format!("  {}  ", "x".repeat(100)), "blue").await;
    assert_eq!(padded.name, "x".repeat(100));
    let emoji = create_category(&mut user, &"\u{1F600}".repeat(50), "blue").await;
    assert_eq!(emoji.name.chars().count(), 50);
}

#[tokio::test]
async fn blank_names_on_update_fail_in_the_service() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let category = create_category(&mut user, "Keep", "blue").await;
    let path = format!("/api/categories/{}", category.id);
    for name in ["   ", ""] {
        expect_field_error(
            &user.put(&path, json!({"name": name})).await,
            "Category name is required and cannot be empty",
            "name",
        );
    }
    expect_field_error(
        &user.put(&path, json!({"name": "x".repeat(101)})).await,
        "Category name cannot exceed 100 characters",
        "name",
    );
    let row = category_row(&app.db, &category.id.0).await.expect("row");
    assert_eq!(row["name"], json!("Keep"));
}

#[tokio::test]
async fn duplicate_plaintext_names_are_rejected() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let work = create_category(&mut user, "Work", "blue").await;
    let personal = create_category(&mut user, "Personal", "blue").await;
    sqlx::query(
        "INSERT INTO event_category (id, name, color, is_active, user_id, created_at, updated_at) \
         VALUES ($1, 'Archived', 'teal', false, $2, now(), now())",
    )
    .bind(format!("suitecat{}", hex(8)))
    .bind(&user.id)
    .execute(&app.db)
    .await
    .expect("insert inactive category");

    // Inactive categories still hold their names.
    for name in ["Work", " Work ", "Archived"] {
        let response = user
            .post("/api/categories", json!({"name": name, "color": "blue"}))
            .await;
        expect_field_error(&response, DUPLICATE, "name");
    }
    let renamed = user
        .put(
            &format!("/api/categories/{}", work.id),
            json!({"name": "  Personal  "}),
        )
        .await;
    expect_field_error(&renamed, DUPLICATE, "name");
    let row = category_row(&app.db, &work.id.0).await.expect("row");
    assert_eq!(row["name"], json!("Work"));
    assert_eq!(category_count(&app.db, &user.id).await, 3);

    let same = update_category(&mut user, &personal.id.0, json!({"name": " Personal "})).await;
    assert_eq!(same.name, "Personal", "keeping its own name is fine");
}

#[tokio::test]
async fn updates_change_name_and_color() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let created = create_category(&mut user, "Work", "blue").await;

    let updated = update_category(
        &mut user,
        &created.id.0,
        json!({"name": "  Focus  ", "color": "emerald"}),
    )
    .await;
    assert_eq!(
        (updated.name.as_str(), updated.color.as_str()),
        ("Focus", "emerald")
    );
    assert_eq!(updated.encryption_state, "plaintext");
    assert_eq!(updated.created_at, created.created_at);
    assert!(updated.updated_at > created.updated_at);
    let row = category_row(&app.db, &created.id.0).await.expect("row");
    assert_eq!(
        (&row["name"], &row["color"]),
        (&json!("Focus"), &json!("emerald"))
    );

    let recolored = update_category(&mut user, &created.id.0, json!({"color": "#abc"})).await;
    assert_eq!(
        (recolored.name.as_str(), recolored.color.as_str()),
        ("Focus", "#abc")
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
            encrypted_name: Some(ciphertext.into()),
            blind_index_tokens: Some(vec!["idx-1".into(), "idx-2".into()]),
            encryption_state: Some("shadow_write".into()),
            encryption_key_version: Some(2),
            ..Default::default()
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
            encrypted_name: Some(ciphertext.into()),
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
async fn uploading_a_ciphertext_name_blanks_the_stored_name() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let created = create_category(&mut user, "Health", "blue").await;
    add_encryption_device(&app.db, &user.id).await;

    let updated = update_category(
        &mut user,
        &created.id.0,
        json!({"encryptedName": "ciphertext", "blindIndexTokens": ["idx"], "encryptionKeyVersion": 1}),
    )
    .await;
    assert_eq!(updated.name, "");
    assert_eq!(updated.encrypted_name.as_deref(), Some("ciphertext"));
    assert_eq!(updated.blind_index_tokens.as_deref(), Some(r#"["idx"]"#));
    assert_eq!(updated.encryption_state, "encrypted");
    assert_eq!(updated.color, "blue");
    let row = category_row(&app.db, &created.id.0).await.expect("row");
    assert_eq!(
        (&row["name"], &row["encryption_state"]),
        (&json!(""), &json!("encrypted"))
    );
}

#[tokio::test]
async fn plaintext_names_beside_ciphertext_are_rejected() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let target = create_category(&mut user, "Target", "blue").await;
    let created = user
        .post(
            "/api/categories",
            json!({"name": "Health", "encryptedName": "ciphertext", "color": "#123456"}),
        )
        .await;
    expect_issue(&created, PLAINTEXT_BESIDE_CIPHERTEXT, "name");
    let updated = user
        .put(
            &format!("/api/categories/{}", target.id),
            json!({"name": "Health", "encryptedName": "ciphertext"}),
        )
        .await;
    expect_issue(&updated, PLAINTEXT_BESIDE_CIPHERTEXT, "name");
    assert_eq!(category_count(&app.db, &user.id).await, 1);
    let row = category_row(&app.db, &target.id.0).await.expect("row");
    assert_eq!(
        (&row["name"], &row["encrypted_name"]),
        (&json!("Target"), &json!(null))
    );

    let empty = user
        .put(
            &format!("/api/categories/{}", target.id),
            json!({"encryptedName": ""}),
        )
        .await;
    expect_field_error(
        &empty,
        "Encrypted category name cannot be empty",
        "encryptedName",
    );
}

#[tokio::test]
async fn accounts_with_an_e2ee_device_must_encrypt_category_names() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let category = create_category(&mut user, "Before", "blue").await;
    add_encryption_device(&app.db, &user.id).await;
    let message = "Category name encryption requires an active encryption session.";

    let created = user
        .post(
            "/api/categories",
            json!({"name": "Health", "color": "blue"}),
        )
        .await;
    expect_field_error(&created, message, "encryptedName");
    let path = format!("/api/categories/{}", category.id);
    // Even resending the current name counts as plaintext.
    for name in ["After", "Before"] {
        expect_field_error(
            &user.put(&path, json!({"name": name})).await,
            message,
            "encryptedName",
        );
    }
    assert_eq!(category_count(&app.db, &user.id).await, 1);

    let recolored = update_category(&mut user, &category.id.0, json!({"color": "rose"})).await;
    assert_eq!(
        (recolored.name.as_str(), recolored.color.as_str()),
        ("Before", "rose")
    );
}

#[tokio::test]
async fn delete_detaches_events_and_removes_the_category() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar = create_calendar(&mut user, "Cal", "blue").await;
    let category = create_category(&mut user, "Work", "blue").await;
    let kept = create_category(&mut user, "Kept", "blue").await;
    let tagged = [
        insert_event(
            &app.db,
            &user.id,
            &calendar.id.0,
            EventRow {
                category_id: Some(&category.id.0),
                ..Default::default()
            },
        )
        .await,
        insert_event(
            &app.db,
            &user.id,
            &calendar.id.0,
            EventRow {
                category_id: Some(&category.id.0),
                ..Default::default()
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
            ..Default::default()
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
    let category = create_category(&mut owner, "Private", "blue").await;
    let before = category_row(&app.db, &category.id.0).await;
    let path = format!("/api/categories/{}", category.id);

    expect_field_error(
        &other.put(&path, json!({"color": "rose"})).await,
        NOT_FOUND,
        "categoryId",
    );
    expect_field_error(
        &other.put(&path, json!({"name": "Mine"})).await,
        NOT_FOUND,
        "categoryId",
    );
    expect_field_error(&other.delete(&path).await, NOT_FOUND, "categoryId");
    expect_field_error(
        &owner
            .put("/api/categories/no-such-category", json!({"name": "Focus"}))
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
    let category = create_category(&mut attacker, "Mine", "blue").await;

    expect_unknown_field(
        &attacker
            .post(
                "/api/categories",
                json!({"name": "Planted", "color": "blue", "userId": victim.id}),
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
