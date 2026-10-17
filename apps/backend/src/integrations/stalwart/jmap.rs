//! `lib/stalwart-user-jmap.ts`: JMAP as the mailbox owner with their mail token, so server-side mail work needs no admin rights.

use axum::body::Bytes;
use reqwest::{Client, RequestBuilder};
use serde_json::{Value, json};

use super::admin::parse_envelope;
use super::gate::StalwartGate;
use crate::error::AppError;
use crate::mail::service as mail;
use crate::state::AppState;

/// One JMAP request as `user_id`; a 401 drops their cached token and retries once with a fresh one.
pub async fn call(
    state: &AppState,
    user_id: &str,
    email: &str,
    using: &[&str],
    method_calls: Value,
) -> Result<Value, AppError> {
    let body = json!({"using": using, "methodCalls": method_calls});
    let (mut status, mut reply) = post(state, user_id, email, &body).await?;
    if status == reqwest::StatusCode::UNAUTHORIZED {
        mail::invalidate_access_token(state, user_id);
        (status, reply) = post(state, user_id, email, &body).await?;
    }
    if !status.is_success() {
        return Err(AppError::Internal(format!(
            "Stalwart JMAP request failed with status {}.",
            status.as_u16()
        )));
    }
    let envelope: Value = serde_json::from_slice(&reply).map_err(AppError::internal)?;
    Ok(parse_envelope(envelope))
}

async fn post(
    state: &AppState,
    user_id: &str,
    email: &str,
    body: &Value,
) -> Result<(reqwest::StatusCode, Bytes), AppError> {
    let token = mail::access_token_for_user(state, user_id, email).await?;
    super::send(
        request(
            &state.http,
            &state.stalwart_gate,
            &state.config.stalwart_base_url,
            &token.access_token,
        )
        .json(body),
    )
    .await
    .map_err(AppError::internal)
}

fn request(http: &Client, gate: &StalwartGate, base_url: &str, token: &str) -> RequestBuilder {
    let url = format!("{}/jmap/", base_url.trim_end_matches('/'));
    gate.apply(http.post(&url), &url).bearer_auth(token)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::super::fake::{FakeStalwart, Recorded, Reply};
    use super::*;
    use crate::db::scratch::ScratchDatabase;
    use crate::mail::service::tests::{OWNER, mail_state, seed_mailbox};

    /// The mailbox owner's Stalwart: the registry and login for minting, and JMAP that refuses `stale-token`.
    fn stalwart(jmap: fn(&Recorded) -> Reply) -> impl Fn(&Recorded) -> Reply {
        move |request| match request.path.as_str() {
            "/api/auth" => Reply::json(json!({"type": "authenticated", "clientCode": "code-1"})),
            "/auth/token" => {
                Reply::json(json!({"access_token": "fresh-token", "expires_in": 3600}))
            }
            _ if request.first_method() == "x:OAuthClient/query" => Reply::json(
                json!({"methodResponses": [["x:OAuthClient/query", {"ids": []}, "c1"]]}),
            ),
            _ if request.first_method() == "x:OAuthClient/set" => Reply::json(
                json!({"methodResponses": [["x:OAuthClient/set", {"created": {"client1": {"id": "c"}}}, "c1"]]}),
            ),
            _ => jmap(request),
        }
    }

    fn calls() -> Value {
        json!([["Email/get", {"accountId": "acct-1"}, "c1"]])
    }

    #[tokio::test]
    async fn reminted_once_after_a_401() {
        let database = ScratchDatabase::create().await;
        let fake = FakeStalwart::start(stalwart(|request| {
            if request.authorization.as_deref() == Some("Bearer fresh-token") {
                Reply::json(json!({"methodResponses": [["Email/get", {"list": []}, "c1"]], "sessionState": "s"}))
            } else {
                Reply::status(401)
            }
        }))
        .await;
        let state = mail_state(&database, &fake).await;
        seed_mailbox(&state, "acct-1").await;
        mail::tests::cache_token(&state, "stale-token");

        let envelope = call(
            &state,
            OWNER,
            "alice@solace.test",
            &["urn:ietf:params:jmap:core"],
            calls(),
        )
        .await
        .unwrap();
        assert_eq!(
            envelope,
            json!({"methodResponses": [["Email/get", {"list": []}, "c1"]]})
        );
        let jmap: Vec<_> = fake
            .requests()
            .into_iter()
            .filter(|r| r.first_method() == "Email/get")
            .collect();
        assert_eq!(jmap.len(), 2, "one retry");
        assert_eq!(jmap[0].authorization.as_deref(), Some("Bearer stale-token"));
        assert_eq!(jmap[1].authorization.as_deref(), Some("Bearer fresh-token"));
        assert_eq!(
            jmap[1].json(),
            json!({"using": ["urn:ietf:params:jmap:core"], "methodCalls": calls()})
        );
    }

    #[tokio::test]
    async fn resends_calls_refused_at_the_concurrency_limit() {
        let database = ScratchDatabase::create().await;
        let refusals = std::sync::atomic::AtomicUsize::new(2);
        let fake = FakeStalwart::start(move |request| {
            let refuse = refusals
                .fetch_update(
                    std::sync::atomic::Ordering::SeqCst,
                    std::sync::atomic::Ordering::SeqCst,
                    |left| left.checked_sub(1),
                )
                .is_ok();
            if refuse {
                Reply::concurrency_limit()
            } else {
                assert_eq!(request.authorization.as_deref(), Some("Bearer owner-token"));
                Reply::json(json!({"methodResponses": [["Email/get", {"list": []}, "c1"]]}))
            }
        })
        .await;
        let state = mail_state(&database, &fake).await;
        seed_mailbox(&state, "acct-1").await;
        mail::tests::cache_token(&state, "owner-token");

        let envelope = call(
            &state,
            OWNER,
            "alice@solace.test",
            &["urn:ietf:params:jmap:core"],
            calls(),
        )
        .await
        .unwrap();
        assert_eq!(
            envelope,
            json!({"methodResponses": [["Email/get", {"list": []}, "c1"]]})
        );
        assert_eq!(fake.requests().len(), 3, "resent with the same token");
    }

    #[tokio::test]
    async fn surfaces_non_401_failures() {
        let database = ScratchDatabase::create().await;
        let fake = FakeStalwart::start(stalwart(|_| Reply::status(503))).await;
        let state = mail_state(&database, &fake).await;
        seed_mailbox(&state, "acct-1").await;
        mail::tests::cache_token(&state, "owner-token");

        let error = call(
            &state,
            OWNER,
            "alice@solace.test",
            &["urn:ietf:params:jmap:core"],
            calls(),
        )
        .await
        .unwrap_err();
        assert!(error.to_string().contains("status 503"), "{error}");
        let jmap: Vec<_> = fake
            .requests()
            .into_iter()
            .filter(|r| r.first_method() == "Email/get")
            .collect();
        assert_eq!(jmap.len(), 1, "no retry after a 503");
        assert_eq!(jmap[0].authorization.as_deref(), Some("Bearer owner-token"));
    }

    #[test]
    fn sends_the_gate_key_when_configured() {
        let gate = StalwartGate::new("https://gate.test", Some(&"g".repeat(64)));
        let built = request(&Client::new(), &gate, "https://gate.test/", "owner-token")
            .build()
            .unwrap();
        assert_eq!(built.url().as_str(), "https://gate.test/jmap/");
        let header = |name: &str| built.headers().get(name).and_then(|v| v.to_str().ok());
        assert_eq!(header("X-Solace-Gate"), Some("g".repeat(64).as_str()));
        assert_eq!(header("Authorization"), Some("Bearer owner-token"));
    }
}
