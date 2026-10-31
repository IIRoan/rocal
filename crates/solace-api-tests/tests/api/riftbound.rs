use crate::helpers::{TestApp, expect_unauthorized, expect_unknown_field, ok};
use serde_json::{Value, json};
use solace_api_tests::{
    client::ResponseResult,
    seed::{fake_envelope, hex},
};
use solace_api_types::subscriptions::ImportIcsResponse;

#[tokio::test]
async fn public_riftbound_proxy_requires_a_solace_session_before_validation() {
    let app = TestApp::spawn().await;
    let mut anonymous = app.anonymous();
    expect_unauthorized(&ok(anonymous
        .post("/api/riftbound/stores/resolve", json!({}))
        .await));
    expect_unauthorized(&ok(anonymous
        .post("/api/riftbound/events", json!({"riotId":"private"}))
        .await));
    expect_unauthorized(&ok(anonymous
        .post("/api/subscriptions/import-ics", json!({}))
        .await));
}

#[tokio::test]
async fn riftbound_accepts_only_opaque_public_ids_and_never_a_riot_identity_or_url() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let invalid = ok(user
        .post(
            "/api/riftbound/stores/resolve",
            json!({"eventId":"https://private.test"}),
        )
        .await
        .expect_status(400));
    assert_eq!(
        ok(invalid.json::<Value>())["message"],
        "Use a valid Riftbound event link."
    );
    let invalid = ok(user
        .post(
            "/api/riftbound/events",
            json!({"storeIds":["not-a-store-id"],"includeRegistrations":true}),
        )
        .await
        .expect_status(400));
    assert_eq!(
        ok(invalid.json::<Value>())["message"],
        "Use resolved Riftbound store IDs."
    );
    expect_unknown_field(
        &user
            .post(
                "/api/riftbound/events",
                json!({"storeIds":["00000000-0000-4000-8000-000000000001"],"includeRegistrations":true,"riotId":"fixture#tag"}),
            )
            .await,
        "riotId",
    );
    expect_unknown_field(
        &user
            .post(
                "/api/riftbound/stores/resolve",
                json!({"eventId":"123","userId":"someone-else"}),
            )
            .await,
        "userId",
    );
}

#[tokio::test]
async fn recent_past_imports_are_idempotent_owner_scoped_and_ciphertext_only() {
    let app = TestApp::spawn().await;
    let mut user = app.user().await;
    let calendar = ok(user
        .post(
            "/api/calendars",
            json!({"encryptedName":fake_envelope(), "color":"#73665b"}),
        )
        .await
        .expect_status(200)
        .and_then(|response| response.value()));
    let calendar_id = calendar["id"].as_str().expect("calendar id");
    let envelope = fake_envelope();
    let (start, end): (String, String) = sqlx::query_as(
        r#"SELECT to_char(timezone('UTC', now()) - interval '1 day', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), to_char(timezone('UTC', now()) - interval '20 hours', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')"#,
    )
    .fetch_one(&app.db)
    .await
    .expect("yesterday's event times");
    let body = json!({"calendarId":calendar_id,"skipExisting":true,"encryptedEvents":[{
        "externalId":"fixture-keyed-event","encryptedContent":envelope,
        "start":start,"end":end,"allDay":false,"timezone":"UTC"
    }]});
    assert!(calendar_id.bytes().all(|byte| byte.is_ascii_alphanumeric()));
    let fixture = format!("riftbound_import_delay_{}", hex(8));
    // Delay this calendar's insert so the unlocked importer reliably races across clients.
    for sql in [
        format!(
            "CREATE FUNCTION {fixture}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.1); RETURN NEW; END $$"
        ),
        format!(
            "CREATE TRIGGER {fixture} BEFORE INSERT ON calendar_event FOR EACH ROW WHEN (NEW.calendar_id = '{calendar_id}') EXECUTE FUNCTION {fixture}()"
        ),
    ] {
        sqlx::query(&sql)
            .execute(&app.db)
            .await
            .expect("concurrent import fixture");
    }
    let mut first = user.agent.clone();
    let mut second = user.agent.clone();
    let (first, second) = tokio::join!(
        first.post("/api/subscriptions/import-ics", body.clone()),
        second.post("/api/subscriptions/import-ics", body.clone())
    );
    sqlx::query(&format!("DROP TRIGGER {fixture} ON calendar_event"))
        .execute(&app.db)
        .await
        .expect("remove import fixture");
    sqlx::query(&format!("DROP FUNCTION {fixture}()"))
        .execute(&app.db)
        .await
        .expect("remove import fixture");
    let first: ImportIcsResponse = ok(first.expect_status(200).and_then(|response| response.dto()));
    let second: ImportIcsResponse = ok(second
        .expect_status(200)
        .and_then(|response| response.dto()));
    assert_eq!(first.events_created + second.events_created, 1);
    assert_eq!((first.errors, second.errors), (None, None));
    let repeated: ImportIcsResponse = ok(user
        .post("/api/subscriptions/import-ics", body.clone())
        .await
        .expect_status(200)
        .and_then(|response| response.dto()));
    assert_eq!((repeated.events_created, repeated.errors), (0, None));
    let mut stranger = app.user().await;
    ok(stranger
        .post("/api/subscriptions/import-ics", body.clone())
        .await
        .expect_status(404));
    let mut plaintext = body.clone();
    plaintext["encryptedEvents"][0]["title"] = json!("Must not be stored");
    ok(user
        .post("/api/subscriptions/import-ics", plaintext)
        .await
        .expect_status(400));
    let rows: Vec<(String, Option<String>, Option<String>, String)> = sqlx::query_as(
        r#"SELECT title, description, encrypted_content, to_char(start, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') FROM calendar_event WHERE calendar_id=$1"#,
    )
    .bind(calendar_id)
    .fetch_all(&app.db)
    .await
    .expect("stored ciphertext");
    assert_eq!(rows, vec![(String::new(), None, Some(envelope), start)]);
}
