//! The JMAP proxy under `/api/mail/jmap/*`: Bearer-only relay to Stalwart, session-minted tokens, path allowlist and rate limit.

use reqwest::Method;
use serde_json::{Value, json};
use solace_api_tests::client::ApiResponse;

use crate::helpers::{TestApp, TestUser, ok};
use crate::mail_support::{
    JMAP_MAIL, Mailbox, access_token, mailbox, method, set_bridge_password, unique_subject,
};

const PROXY_ROUTES: [&str; 4] = [
    "/api/mail/jmap/.well-known/jmap",
    "/api/mail/jmap/jmap",
    "/api/mail/jmap/jmap/",
    "/api/mail/jmap/jmap/session",
];

async fn send(
    user: &mut TestUser,
    method: Method,
    path: &str,
    body: Option<Value>,
    headers: &[(&str, &str)],
) -> ApiResponse {
    ok(user.agent.send(method, path, body, headers).await)
}

/// The `auth_source` and `retry` the proxy reports in `Server-Timing`.
fn auth_source(response: &ApiResponse) -> (String, String) {
    let timing = response
        .headers
        .get("server-timing")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default()
        .to_owned();
    let desc = |name: &str| {
        timing
            .split(", ")
            .find_map(|part| part.strip_prefix(&format!("{name};desc=\"")))
            .map(|rest| rest.trim_end_matches('"').to_owned())
            .unwrap_or_default()
    };
    (desc("auth_source"), desc("retry"))
}

fn proxy_error(response: &ApiResponse, status: u16, error: &str, message: &str) {
    let body = ok(response.value());
    assert_eq!(response.status.as_u16(), status, "{body}");
    assert_eq!(
        (
            body["error"].as_str(),
            body["message"].as_str(),
            body["statusCode"].as_u64()
        ),
        (Some(error), Some(message), Some(u64::from(status))),
        "{body}"
    );
    assert!(
        body["timestamp"].is_string() && body.get("requestId").is_none(),
        "{body}"
    );
}

#[tokio::test]
async fn proxy_calls_without_mailbox_credentials_are_refused() {
    let app = TestApp::spawn().await;
    let mut anon = app.anonymous();
    let mut no_mailbox = app.user().await;
    for path in PROXY_ROUTES {
        for method in [Method::GET, Method::POST] {
            let response = ok(anon.send(method.clone(), path, None, &[]).await);
            proxy_error(
                &response,
                401,
                "Unauthorized",
                "Mailbox authorization is required.",
            );
        }
        // A session without a provisioned mailbox cannot mint a mail token either.
        let response = send(&mut no_mailbox, Method::GET, path, None, &[]).await;
        proxy_error(
            &response,
            401,
            "Unauthorized",
            "Mailbox authorization is required.",
        );
    }
}

#[tokio::test]
async fn only_bearer_credentials_are_relayed() {
    let app = TestApp::spawn().await;
    let mut anon = app.anonymous();
    for authorization in [
        "Basic YWRtaW46c29sYWNlLXRlc3QtYWRtaW4tbG9jYWw=",
        "Token abc",
        "bearer-less",
    ] {
        let response = ok(anon
            .send(
                Method::GET,
                "/api/mail/jmap/jmap/session",
                None,
                &[("authorization", authorization)],
            )
            .await);
        proxy_error(
            &response,
            400,
            "Bad request",
            "Mailbox authorization must use a Bearer token.",
        );
    }
}

#[tokio::test]
async fn paths_outside_the_jmap_allowlist_never_reach_stalwart() {
    let app = TestApp::spawn().await;
    let mut anon = app.anonymous();
    for path in [
        "/api/mail/jmap/jmap/%2e%2e%2f%2e%2e%2fapi/store/setting",
        "/api/mail/jmap/jmap/..%2fapi%2fprincipal",
        "/api/mail/jmap/jmap/api/principal",
        "/api/mail/jmap/jmap/sessions",
        "/api/mail/jmap/jmap/uploads/x",
        "/api/mail/jmap/jmap/upload%5c..%5cadmin",
    ] {
        let response = ok(anon
            .send(
                Method::GET,
                path,
                None,
                &[("authorization", "Bearer not-a-real-token")],
            )
            .await);
        proxy_error(&response, 400, "Bad request", "Proxy path is not allowed.");
    }
}

#[tokio::test]
async fn the_session_or_a_bearer_opens_the_callers_own_mailbox() {
    let app = TestApp::spawn().await;
    let mut owner = mailbox(&app).await;
    let token = access_token(&mut owner.user).await.access_token;
    let bearer = format!("Bearer {token}");

    let minted = send(
        &mut owner.user,
        Method::GET,
        "/api/mail/jmap/.well-known/jmap",
        None,
        &[],
    )
    .await;
    assert_eq!(minted.status.as_u16(), 200, "{}", minted.text());
    assert_eq!(auth_source(&minted), ("session".into(), "0".into()));
    let session = ok(minted.value());
    assert_eq!(session["username"], json!(owner.user.email));
    assert_eq!(
        session["primaryAccounts"]["urn:ietf:params:jmap:mail"],
        json!(owner.account_id())
    );
    assert!(
        minted
            .headers
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| v.starts_with("application/json")),
        "Stalwart's content type is passed through"
    );

    // A client bearer is relayed as is, with or without a session cookie.
    let mut anon = app.anonymous();
    let relayed = ok(anon
        .send(
            Method::GET,
            "/api/mail/jmap/jmap/session",
            None,
            &[("authorization", &bearer)],
        )
        .await);
    assert_eq!(relayed.status.as_u16(), 200);
    assert_eq!(auth_source(&relayed), ("client-bearer".into(), "0".into()));
    assert_eq!(ok(relayed.value())["username"], json!(owner.user.email));
    let both = send(
        &mut owner.user,
        Method::GET,
        "/api/mail/jmap/jmap/session",
        None,
        &[("authorization", &bearer)],
    )
    .await;
    assert_eq!(auth_source(&both), ("client-bearer".into(), "0".into()));

    // A stale bearer next to a session falls back to a session-minted token.
    let fallback = send(
        &mut owner.user,
        Method::GET,
        "/api/mail/jmap/jmap/session",
        None,
        &[("authorization", "Bearer stale-token")],
    )
    .await;
    assert_eq!(fallback.status.as_u16(), 200, "{}", fallback.text());
    assert_eq!(auth_source(&fallback), ("session".into(), "1".into()));

    // Without a session the upstream refusal comes back unchanged.
    let refused = ok(anon
        .send(
            Method::GET,
            "/api/mail/jmap/jmap/session",
            None,
            &[("authorization", "Bearer stale-token")],
        )
        .await);
    assert_eq!(refused.status.as_u16(), 401);
    assert_eq!(auth_source(&refused), ("client-bearer".into(), "1".into()));
    let problem = ok(refused.value());
    assert_eq!(problem["status"], json!(401), "{problem}");

    let calls = ok(owner
        .user
        .post(
            "/api/mail/jmap/jmap",
            json!({"using": JMAP_MAIL, "methodCalls": [["Mailbox/get", {"accountId": owner.account_id(), "properties": ["role"]}, "m"]]}),
        )
        .await
        .expect_status(200)
        .and_then(|r| r.value()));
    let mut roles: Vec<_> = method(&calls, "m")["list"]
        .as_array()
        .expect("mailboxes")
        .iter()
        .filter_map(|m| m["role"].as_str().map(str::to_owned))
        .collect();
    roles.sort();
    assert_eq!(roles, ["drafts", "inbox", "junk", "sent", "trash"]);
}

#[tokio::test]
async fn mail_flows_between_users_and_tokens_stay_in_their_own_account() {
    let app = TestApp::spawn().await;
    let mut sender = mailbox(&app).await;
    let mut recipient = mailbox(&app).await;
    let subject = unique_subject("Proxy delivery");

    let sent = sender.send(&recipient.user.email, &subject).await;
    let delivered = recipient.wait_for_inbox(&subject).await;
    let reply = recipient
        .jmap(json!([["Email/get", {"accountId": recipient.account_id(), "ids": [delivered], "properties": ["subject", "from", "blobId"]}, "g"]]))
        .await;
    let email = &method(&reply, "g")["list"][0];
    assert_eq!(email["subject"], json!(subject));
    assert_eq!(email["from"][0]["email"], json!(sender.user.email));

    // The sender's own token cannot read or write the recipient's account.
    let foreign = sender
        .jmap(json!([
            ["Email/get", {"accountId": recipient.account_id(), "ids": [delivered]}, "g"],
            ["Email/set", {"accountId": recipient.account_id(), "destroy": [delivered]}, "d"],
        ]))
        .await;
    for call in ["g", "d"] {
        assert_eq!(foreign["methodResponses"].as_array().map(Vec::len), Some(2));
        let response = foreign["methodResponses"]
            .as_array()
            .and_then(|r| r.iter().find(|r| r[2] == json!(call)))
            .expect("response");
        assert_eq!(response[0], json!("error"), "{foreign}");
        assert_eq!(response[1]["type"], json!("forbidden"), "{foreign}");
    }
    let still_there = recipient
        .jmap(json!([["Email/get", {"accountId": recipient.account_id(), "ids": [delivered], "properties": ["id"]}, "g"]]))
        .await;
    assert_eq!(method(&still_there, "g")["list"][0]["id"], json!(delivered));

    let blob = email["blobId"].as_str().expect("blob id").to_owned();
    let download = |account: &str| {
        format!("/api/mail/jmap/jmap/download/{account}/{blob}/message.eml?accept=message/rfc822")
    };
    let path = download(recipient.account_id());
    let raw = send(&mut recipient.user, Method::GET, &path, None, &[]).await;
    assert_eq!(raw.status.as_u16(), 200);
    assert_eq!(
        raw.headers
            .get("content-type")
            .and_then(|v| v.to_str().ok()),
        Some("message/rfc822"),
        "the accept query string reaches Stalwart"
    );
    assert!(
        raw.headers.get("cache-control").is_some(),
        "Stalwart's cache header is passed through"
    );
    let stolen = send(&mut sender.user, Method::GET, &path, None, &[]).await;
    assert_ne!(
        stolen.status.as_u16(),
        200,
        "another account's blob is not served"
    );
    assert!(!sent.is_empty());
}

#[tokio::test]
async fn uploads_and_downloads_relay_binary_bodies_unchanged() {
    let app = TestApp::spawn().await;
    let mut owner: Mailbox = mailbox(&app).await;
    let token = access_token(&mut owner.user).await.access_token;
    let bytes: Vec<u8> = (0..=255u8).cycle().take(4096).collect();

    let upload = reqwest::Client::new()
        .post(format!(
            "{}/api/mail/jmap/jmap/upload/{}/",
            app.base_url,
            owner.account_id()
        ))
        .bearer_auth(&token)
        .header("content-type", "application/octet-stream")
        .header("x-forwarded-for", owner.user.agent.client_ip())
        .body(bytes.clone())
        .send()
        .await
        .expect("upload");
    assert_eq!(
        upload.status().as_u16(),
        200,
        "Stalwart's status is passed through"
    );
    let uploaded: Value = upload.json().await.expect("upload JSON");
    assert_eq!(uploaded["size"], json!(4096), "{uploaded}");
    assert_eq!(uploaded["accountId"], json!(owner.account_id()));
    let blob = uploaded["blobId"].as_str().expect("blob id");

    let download = reqwest::Client::new()
        .get(format!(
            "{}/api/mail/jmap/jmap/download/{}/{blob}/file.bin?accept=application/octet-stream",
            app.base_url,
            owner.account_id()
        ))
        .bearer_auth(&token)
        .header("x-forwarded-for", owner.user.agent.client_ip())
        .send()
        .await
        .expect("download");
    assert_eq!(download.status().as_u16(), 200);
    assert_eq!(download.bytes().await.expect("bytes").to_vec(), bytes);
}

/// A session upload through the proxy, with an optional client bearer next to the session cookie.
async fn session_upload(
    app: &TestApp,
    owner: &Mailbox,
    bytes: &[u8],
    bearer: Option<&str>,
) -> ApiResponse {
    let cookie = owner
        .user
        .agent
        .cookies()
        .iter()
        .map(|(name, value)| format!("{name}={value}"))
        .collect::<Vec<_>>()
        .join("; ");
    let mut request = reqwest::Client::new()
        .post(format!(
            "{}/api/mail/jmap/jmap/upload/{}/",
            app.base_url,
            owner.account_id()
        ))
        .header("cookie", cookie)
        .header("origin", &app.origin)
        .header("content-type", "application/octet-stream")
        .header("x-forwarded-for", owner.user.agent.client_ip())
        .body(bytes.to_vec());
    if let Some(bearer) = bearer {
        request = request.header("authorization", bearer);
    }
    let response = request.send().await.expect("upload");
    ApiResponse {
        status: response.status(),
        headers: response.headers().clone(),
        body: response.bytes().await.expect("upload body").to_vec(),
    }
}

#[tokio::test]
async fn large_uploads_with_a_refused_token_retry_with_a_fresh_one() {
    let app = TestApp::spawn().await;
    let owner = mailbox(&app).await;
    // Past the 1 MiB the Rust proxy keeps for its 401 retry.
    let bytes: Vec<u8> = (0..=255u8).cycle().take(1536 * 1024).collect();

    // Setting the bridge password again revokes the bearer the backend cached while provisioning.
    set_bridge_password(&app, owner.account_id(), &owner.user.id, &owner.user.email).await;
    let cached = session_upload(&app, &owner, &bytes, None).await;
    assert_eq!(cached.status.as_u16(), 200, "{}", cached.text());
    assert_eq!(auth_source(&cached), ("session".into(), "1".into()));
    assert_eq!(ok(cached.value())["size"], json!(bytes.len()));

    // A refused client bearer falls back to the session, as smaller bodies do.
    let stale = session_upload(&app, &owner, &bytes, Some("Bearer stale-token")).await;
    assert_eq!(stale.status.as_u16(), 200, "{}", stale.text());
    assert_eq!(auth_source(&stale), ("session".into(), "1".into()));
}

#[tokio::test]
async fn the_proxy_is_rate_limited_per_client_address() {
    let app = TestApp::spawn().await;
    let anon = app.anonymous();
    let mut tasks = Vec::new();
    for _ in 0..12 {
        let mut agent = anon.clone();
        tasks.push(tokio::spawn(async move {
            let mut statuses = Vec::new();
            for _ in 0..100 {
                let response = agent
                    .get("/api/mail/jmap/jmap/session")
                    .await
                    .expect("request");
                statuses.push(response.status.as_u16());
            }
            statuses
        }));
    }
    let mut statuses = Vec::new();
    for task in tasks {
        statuses.extend(task.await.expect("task"));
    }
    assert_eq!(
        statuses.iter().filter(|s| **s == 401).count(),
        1200,
        "1200 requests per minute pass the limiter"
    );

    let mut same_address = anon.clone();
    let limited = ok(same_address.get("/api/mail/jmap/.well-known/jmap").await);
    let body = ok(limited.value());
    assert_eq!(limited.status.as_u16(), 429, "{body}");
    assert_eq!(body["error"], json!("Too many requests"));
    assert!(
        body["message"]
            .as_str()
            .is_some_and(|m| m.starts_with("Rate limit exceeded. Try again in ")),
        "{body}"
    );
    let mut other_address = app.anonymous();
    let response = ok(other_address.get("/api/mail/jmap/jmap/session").await);
    assert_eq!(
        response.status.as_u16(),
        401,
        "the limit is per client address"
    );
}

#[tokio::test]
async fn the_mail_server_reachability_probe_reports_ok() {
    let app = TestApp::spawn().await;
    let response = ok(app.anonymous().get("/api/health/mail-jmap").await);
    assert_eq!(response.status.as_u16(), 200, "{}", response.text());
    assert_eq!(ok(response.value()), json!({"status": "ok"}));
}
