//! `POST /api/internal/stalwart/webhook`: HMAC-signed Stalwart ingest events become opaque `new_mail` push jobs, deduplicated per message.

use serde_json::{Value, json};
use solace_api_tests::client::ApiResponse;
use solace_api_types::mail::StalwartWebhookResult;

use crate::helpers::{TestApp, hex, ok};
use crate::mail_support::{
    Mailbox, mailbox, method, post_signed, post_webhook, post_webhook_from, row_json,
    webhook_signature,
};

fn plain_error(response: &ApiResponse, status: u16, error: &str, message: &str) {
    assert_eq!(response.status.as_u16(), status, "{}", response.text());
    assert_eq!(
        ok(response.value()),
        json!({"error": error, "message": message}),
        "webhook errors are not the API envelope"
    );
}

fn result(response: &ApiResponse) -> StalwartWebhookResult {
    ok(ApiResponse {
        status: response.status,
        headers: response.headers.clone(),
        body: response.body.clone(),
    }
    .expect_status(200)
    .and_then(|r| r.dto()))
}

fn ingest(data: Value) -> Value {
    json!({"id": hex(8), "createdAt": "2026-10-14T12:00:00Z", "type": "message-ingest.ham", "data": data})
}

/// The `new_mail` push payloads queued for this user, oldest first.
async fn new_mail_jobs(app: &TestApp, user_id: &str) -> Vec<Value> {
    let rows: Vec<String> = sqlx::query_scalar(
        "SELECT payload::text FROM notification_job WHERE user_id = $1 AND kind = 'new_mail' ORDER BY created_at, id",
    )
    .bind(user_id)
    .fetch_all(&app.db)
    .await
    .expect("jobs");
    rows.iter()
        .map(|row| serde_json::from_str(row).expect("payload JSON"))
        .collect()
}

fn email_ids(jobs: &[Value]) -> Vec<String> {
    jobs.iter()
        .filter_map(|job| job["emailId"].as_str().map(str::to_owned))
        .collect()
}

#[tokio::test]
async fn unsigned_and_badly_signed_posts_are_refused() {
    let app = TestApp::spawn().await;
    let body = serde_json::to_vec(&json!({"events": []})).expect("body");
    let good = webhook_signature(&app.env.stalwart_webhook_secret, &body);
    let other_body = webhook_signature(&app.env.stalwart_webhook_secret, b"{}");
    let mut cases = vec![
        None,
        Some(webhook_signature("solace-test-wrong-secret", &body)),
        Some(good[..good.len() - 4].to_owned()),
        Some(format!("{good}AAAA")),
        Some("not base64!".to_owned()),
        Some(other_body),
        Some(String::new()),
    ];
    // Only the standard alphabet is accepted, although the decoder would take URL-safe input.
    let url_safe = good.replace('+', "-").replace('/', "_");
    if url_safe != good {
        cases.push(Some(url_safe));
    }
    for signature in cases {
        let response = post_webhook(&app, &body, signature.as_deref()).await;
        plain_error(&response, 401, "Unauthorized", "Invalid webhook signature.");
    }
    let response = post_webhook(&app, &body, Some(&format!("  {good} "))).await;
    assert_eq!(
        result(&response).processed_count,
        0,
        "the header is trimmed"
    );
}

#[tokio::test]
async fn unsigned_posts_are_rate_limited_per_address() {
    let app = TestApp::spawn().await;
    let address = format!("2001:db8:6::{}", hex(2));
    for _ in 0..30 {
        let response = post_webhook_from(&app, &address, b"{}", None).await;
        assert_eq!(response.status.as_u16(), 401);
    }
    let limited = post_webhook_from(&app, &address, b"{}", None).await;
    assert_eq!(limited.status.as_u16(), 429, "{}", limited.text());
    let body = ok(limited.value());
    assert_eq!(body["error"], json!("Too many requests"));
    assert!(
        body["message"]
            .as_str()
            .is_some_and(|m| m.starts_with("Rate limit exceeded. Try again in ")),
        "{body}"
    );
    assert_eq!(body.as_object().map(|b| b.len()), Some(2), "{body}");

    let signed = post_signed(&app, &json!({"events": []})).await;
    assert_eq!(
        signed.status.as_u16(),
        200,
        "signed posts are limited separately"
    );
}

#[tokio::test]
async fn signed_bodies_must_be_well_formed_payloads() {
    let app = TestApp::spawn().await;
    let secret = &app.env.stalwart_webhook_secret;
    let post_raw = |body: &'static [u8]| {
        let signature = webhook_signature(secret, body);
        let app = &app;
        async move { post_webhook(app, body, Some(&signature)).await }
    };
    plain_error(
        &post_raw(b"{not-json").await,
        400,
        "Bad request",
        "Webhook body must be valid JSON.",
    );
    for body in [
        &br#"{"events":"not-an-array"}"#[..],
        br#"{"events":[{"data":{}}]}"#,
        br#"{"events":[{"type":7}]}"#,
        br#"[]"#,
    ] {
        let signature = webhook_signature(secret, body);
        plain_error(
            &post_webhook(&app, body, Some(&signature)).await,
            400,
            "Bad request",
            "Webhook payload is invalid.",
        );
    }
    let empty = post_raw(b"{}").await;
    assert_eq!(
        result(&empty),
        StalwartWebhookResult {
            ok: true,
            processed_count: 0,
            enqueued_count: 0,
            ignored_count: 0
        },
        "events default to none"
    );
}

#[tokio::test]
async fn oversized_bodies_are_rejected_before_the_signature_check() {
    let app = TestApp::spawn().await;
    let body = vec![b'x'; 256 * 1024 + 1];
    plain_error(
        &post_webhook(&app, &body, None).await,
        413,
        "Payload too large",
        "Webhook body exceeds the allowed size.",
    );
    let signature = webhook_signature(&app.env.stalwart_webhook_secret, &body);
    plain_error(
        &post_webhook(&app, &body, Some(&signature)).await,
        413,
        "Payload too large",
        "Webhook body exceeds the allowed size.",
    );

    // Without a Content-Length the body is measured after reading it.
    let path = std::env::temp_dir().join(format!("solace-webhook-{}.json", hex(6)));
    std::fs::write(&path, vec![b'x'; 300 * 1024]).expect("temp body");
    let file = tokio::fs::File::open(&path).await.expect("temp body");
    let streamed = reqwest::Client::new()
        .post(format!("{}/api/internal/stalwart/webhook", app.base_url))
        .header("content-type", "application/json")
        .header("x-forwarded-for", format!("2001:db8:7::{}", hex(2)))
        .body(reqwest::Body::from(file))
        .send()
        .await
        .expect("streamed webhook");
    std::fs::remove_file(&path).expect("remove temp body");
    let status = streamed.status().as_u16();
    let body: Value = streamed.json().await.expect("JSON");
    assert_eq!(status, 413, "{body}");
    assert_eq!(body["error"], json!("Payload too large"));
}

#[tokio::test]
async fn events_for_unlinked_mailboxes_and_other_types_are_not_pushed() {
    let app = TestApp::spawn().await;
    let stranger = format!("nobody-{}@{}", hex(4), app.env.mail_domain);
    let response = post_signed(
        &app,
        &json!({"events": [
            ingest(json!({"accountId": format!("unlinked{}", hex(4)), "documentId": "7", "to": [stranger]})),
            {"type": "message-ingest.spam", "data": {"accountId": "x", "documentId": "8"}},
            {"type": "jmap-append", "data": {"accountId": "x", "documentId": "9"}},
            {"type": "telemetry.alert"},
            ingest(json!({"accountId": "x", "subject": "no document id"})),
            ingest(json!({"accountId": "", "documentId": "10"})),
        ]}),
    )
    .await;
    assert_eq!(
        result(&response),
        StalwartWebhookResult {
            ok: true,
            processed_count: 1,
            enqueued_count: 0,
            ignored_count: 5
        }
    );
}

#[tokio::test]
async fn linked_mailboxes_get_one_opaque_push_job_per_message() {
    let app = TestApp::spawn().await;
    let mut owner = mailbox(&app).await;
    let account = owner.account_id().to_owned();
    let email = owner.user.email.clone();

    let first = post_signed(
        &app,
        &json!({"events": [
            ingest(json!({"accountId": account, "documentId": "501", "to": [email], "from": "Sam <sam@example.com>", "subject": "Quarterly numbers", "messageId": "<abc@example.com>"})),
            {"type": "telemetry.alert"},
        ]}),
    )
    .await;
    assert_eq!(
        result(&first),
        StalwartWebhookResult {
            ok: true,
            processed_count: 1,
            enqueued_count: 1,
            ignored_count: 1
        }
    );
    let job = row_json(
        &app.db,
        "SELECT to_jsonb(j) - 'id' - 'user_id' - 'created_at' - 'updated_at' - 'available_at' FROM notification_job j \
         WHERE user_id = $1 AND kind = 'new_mail'",
        &owner.user.id,
    )
    .await;
    assert_eq!(
        job,
        json!({
            "kind": "new_mail",
            "channel": "push",
            "event_id": null,
            "payload": {"kind": "new_mail", "inboundCount": 1, "emailId": "501", "accountId": account},
            "status": "pending",
            "attempts": 0,
            "claimed_at": null,
            "last_error": null,
        }),
        "no sender, subject or Message-ID reaches the outbox"
    );

    // A redelivered event is counted but not queued twice.
    let again = post_signed(
        &app,
        &json!({"events": [ingest(json!({"accountId": account, "documentId": 501}))]}),
    )
    .await;
    assert_eq!(result(&again).enqueued_count, 1);
    assert_eq!(
        email_ids(&new_mail_jobs(&app, &owner.user.id).await),
        ["501"]
    );

    // An unknown telemetry account resolves through a linked recipient address.
    let by_recipient = post_signed(
        &app,
        &json!({"events": [
            ingest(json!({"accountId": format!("telemetry{}", hex(3)), "documentId": "502", "to": [{"email": email.to_uppercase(), "name": "Owner"}]})),
            ingest(json!({"accountId": 99_999_999, "documentId": "503", "to": format!(" {email} ")})),
        ]}),
    )
    .await;
    assert_eq!(result(&by_recipient).enqueued_count, 2);
    let jobs = new_mail_jobs(&app, &owner.user.id).await;
    assert_eq!(email_ids(&jobs), ["501", "502", "503"]);
    assert!(
        jobs.iter().all(|job| job["accountId"] == json!(account)),
        "the linked mailbox's account id is stored: {jobs:?}"
    );

    // With app notifications off the event still counts as enqueued, but nothing is queued.
    ok(owner
        .user
        .put("/api/settings", json!({"pushNotifications": false}))
        .await
        .expect_status(200));
    let muted = post_signed(
        &app,
        &json!({"events": [ingest(json!({"accountId": account, "documentId": "504"}))]}),
    )
    .await;
    assert_eq!(result(&muted).enqueued_count, 1);
    assert_eq!(new_mail_jobs(&app, &owner.user.id).await.len(), 3);
}

#[tokio::test]
async fn reminder_mail_is_not_pushed_but_lookalikes_are() {
    let app = TestApp::spawn().await;
    let mut owner: Mailbox = mailbox(&app).await;
    let account = owner.account_id().to_owned();
    let noreply = format!("noreply@{}", app.env.mail_domain);
    let reminder_id =
        |label: &str| format!("solace-reminder.{label}{}@{}", hex(3), app.env.mail_domain);

    let skipped = [
        json!({"documentId": "601", "from": format!("Reminder in 15 minutes <{noreply}>"), "messageId": format!("<{}>", reminder_id("a"))}),
        json!({"documentId": "602", "from": [{"email": noreply.to_uppercase(), "name": null}], "messageId": reminder_id("b")}),
        json!({"documentId": "603", "from": noreply, "message-id": format!("<{}>", reminder_id("c"))}),
        json!({"documentId": "604", "from": noreply, "message_id": reminder_id("d")}),
    ];
    for data in skipped {
        let mut data = data;
        data["accountId"] = json!(account);
        let response = post_signed(&app, &json!({"events": [ingest(data.clone())]})).await;
        assert_eq!(result(&response).enqueued_count, 0, "{data}");
    }
    assert!(new_mail_jobs(&app, &owner.user.id).await.is_empty());

    let pushed = [
        json!({"documentId": "611", "from": "Mallory <mallory@example.com>", "messageId": format!("<{}>", reminder_id("e"))}),
        json!({"documentId": "612", "from": noreply, "messageId": format!("<solace-reminder.f{}@example.com>", hex(3))}),
        json!({"documentId": "613", "from": noreply, "messageId": format!("<re.solace-reminder.g@{}>", app.env.mail_domain)}),
        json!({"documentId": "614", "from": noreply, "messageId": format!("<{}@{}>", hex(6), app.env.mail_domain)}),
        json!({"documentId": "615", "from": noreply}),
    ];
    for data in pushed {
        let mut data = data;
        data["accountId"] = json!(account);
        let response = post_signed(&app, &json!({"events": [ingest(data.clone())]})).await;
        assert_eq!(result(&response).enqueued_count, 1, "{data}");
    }
    assert_eq!(
        email_ids(&new_mail_jobs(&app, &owner.user.id).await),
        ["611", "612", "613", "614", "615"]
    );

    let mixed = post_signed(
        &app,
        &json!({"events": [
            ingest(json!({"accountId": account, "documentId": "621", "from": noreply, "messageId": reminder_id("m")})),
            ingest(json!({"accountId": account, "documentId": "622", "from": "sam@example.com"})),
        ]}),
    )
    .await;
    assert_eq!(
        result(&mixed),
        StalwartWebhookResult {
            ok: true,
            processed_count: 2,
            enqueued_count: 1,
            ignored_count: 0
        },
        "only the regular mail in a mixed batch is pushed"
    );
    assert_eq!(
        email_ids(&new_mail_jobs(&app, &owner.user.id).await).last(),
        Some(&"622".to_owned())
    );

    // Resolved through JMAP as the owner: the stored message's own Message-ID decides, unless only a heuristic found it.
    let stored_reminder = owner
        .append(
            "inbox",
            json!({"from": [{"email": noreply}], "to": [{"email": owner.user.email}], "subject": "Reminder: standup",
                   "messageId": [reminder_id("h")], "bodyValues": {"t": {"value": "Soon."}}, "textBody": [{"partId": "t", "type": "text/plain"}]}),
        )
        .await;
    let response = post_signed(
        &app,
        &json!({"events": [ingest(json!({"accountId": account, "documentId": stored_reminder}))]}),
    )
    .await;
    assert_eq!(
        result(&response).enqueued_count,
        0,
        "exact JMAP match on a reminder"
    );
    let response = post_signed(
        &app,
        &json!({"events": [ingest(json!({"accountId": account, "documentId": format!("doc{}", hex(3)), "from": noreply}))]}),
    )
    .await;
    assert_eq!(result(&response).enqueued_count, 1);
    let jobs = email_ids(&new_mail_jobs(&app, &owner.user.id).await);
    assert_eq!(
        jobs.last(),
        Some(&stored_reminder),
        "a recent-delivery guess is pushed under the guessed message's id"
    );
}

#[tokio::test]
async fn telemetry_document_ids_resolve_to_jmap_email_ids() {
    let app = TestApp::spawn().await;
    let mut owner = mailbox(&app).await;
    let account = owner.account_id().to_owned();
    let message_id = format!("{}@example.com", hex(8));
    let regular = owner
        .append(
            "inbox",
            json!({"from": [{"email": "sam@example.com"}], "to": [{"email": owner.user.email}], "subject": "Lunch?",
                   "messageId": [message_id], "bodyValues": {"t": {"value": "Noon."}}, "textBody": [{"partId": "t", "type": "text/plain"}]}),
        )
        .await;
    let reply = owner
        .jmap(json!([["Email/get", {"accountId": account, "ids": [regular], "properties": ["messageId"]}, "g"]]))
        .await;
    assert_eq!(
        method(&reply, "g")["list"][0]["messageId"],
        json!([message_id])
    );

    // An unknown document id carrying the RFC Message-ID resolves to the stored message.
    let response = post_signed(
        &app,
        &json!({"events": [ingest(json!({"accountId": account, "documentId": format!("doc{}", hex(3)), "messageId": format!("<{message_id}>")}))]}),
    )
    .await;
    assert_eq!(result(&response).enqueued_count, 1);
    assert_eq!(
        email_ids(&new_mail_jobs(&app, &owner.user.id).await),
        std::slice::from_ref(&regular)
    );

    // The JMAP id itself resolves directly; the existing job dedupes it.
    let response = post_signed(
        &app,
        &json!({"events": [ingest(json!({"accountId": account, "documentId": regular}))]}),
    )
    .await;
    assert_eq!(result(&response).enqueued_count, 1);
    assert_eq!(new_mail_jobs(&app, &owner.user.id).await.len(), 1);
}
