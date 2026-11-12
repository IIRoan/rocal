use crate::helpers::{TestApp, hex};

#[tokio::test]
async fn old_writers_cannot_reintroduce_search_tokens() {
    let app = TestApp::spawn().await;
    let user = app.user().await;
    let calendar_id = format!("legacycal{}", hex(8));
    let event_id = format!("legacyevent{}", hex(8));
    let category_id = format!("legacycategory{}", hex(8));
    sqlx::query("INSERT INTO calendar (id, name, color, user_id, created_at, updated_at, blind_index_tokens) VALUES ($1, '', 'blue', $2, now(), now(), '[\"legacy\"]')")
        .bind(&calendar_id)
        .bind(&user.id)
        .execute(&app.db)
        .await
        .expect("old calendar insert");
    sqlx::query("INSERT INTO calendar_event (id, title, start, \"end\", calendar_id, user_id, created_at, updated_at, blind_index_tokens) VALUES ($1, '', now(), now() + interval '1 hour', $2, $3, now(), now(), '[\"legacy\"]')")
        .bind(&event_id)
        .bind(&calendar_id)
        .bind(&user.id)
        .execute(&app.db)
        .await
        .expect("old event insert");
    sqlx::query("INSERT INTO event_category (id, name, color, user_id, created_at, updated_at, blind_index_tokens) VALUES ($1, '', 'blue', $2, now(), now(), '[\"legacy\"]')")
        .bind(&category_id)
        .bind(&user.id)
        .execute(&app.db)
        .await
        .expect("old category insert");

    for (table, id) in [
        ("calendar", calendar_id),
        ("calendar_event", event_id),
        ("event_category", category_id),
    ] {
        let query = format!("SELECT blind_index_tokens FROM {table} WHERE id = $1");
        let tokens: Option<String> = sqlx::query_scalar(&query)
            .bind(&id)
            .fetch_one(&app.db)
            .await
            .expect("tokens after old insert");
        assert_eq!(tokens, None, "{table}: old inserts discard tokens");
        sqlx::query(&format!(
            "UPDATE {table} SET blind_index_tokens = '[\"legacy-update\"]' WHERE id = $1"
        ))
        .bind(&id)
        .execute(&app.db)
        .await
        .expect("old token update");
        let tokens: Option<String> = sqlx::query_scalar(&query)
            .bind(&id)
            .fetch_one(&app.db)
            .await
            .expect("tokens after old update");
        assert_eq!(tokens, None, "{table}: old updates discard tokens");
    }
}
