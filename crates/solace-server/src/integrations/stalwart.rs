//! Stalwart: the backend gate, the registry admin client and its limits, owner-authenticated JMAP, the reachability probe and the noreply mailer.

pub mod admin;
#[cfg(test)]
pub mod fake;
pub mod gate;
pub mod jmap;
pub mod limits;
pub mod mailer;
pub mod reachability;

use std::time::Duration;

use axum::body::Bytes;
use reqwest::{RequestBuilder, StatusCode};
use serde::Deserialize;

/// Resends after a concurrency-limit refusal, with full-jitter backoff that sums to at most 2.35 s.
const LIMIT_RETRIES: u32 = 6;
const LIMIT_BACKOFF: Duration = Duration::from_millis(50);
const LIMIT_BACKOFF_CAP: Duration = Duration::from_millis(800);

/// Sends `request` and reads its body, resending it while Stalwart refuses it at a per-account concurrency limit.
pub async fn send(mut request: RequestBuilder) -> Result<(StatusCode, Bytes), reqwest::Error> {
    let mut attempt = 0;
    loop {
        let retry = request.try_clone();
        let response = request.send().await?;
        let status = response.status();
        let body = response.bytes().await?;
        match retry {
            Some(next) if attempt < LIMIT_RETRIES && is_concurrency_limit(status, &body) => {
                tokio::time::sleep(backoff(attempt)).await;
                request = next;
                attempt += 1;
            }
            _ => return Ok((status, body)),
        }
    }
}

/// RFC 8620's `limit` request error for the per-account concurrency limits; Stalwart processed nothing, so resending can't apply a call twice.
fn is_concurrency_limit(status: StatusCode, body: &[u8]) -> bool {
    #[derive(Deserialize)]
    struct Problem {
        #[serde(rename = "type")]
        kind: String,
        limit: Option<String>,
    }
    status == StatusCode::BAD_REQUEST
        && serde_json::from_slice::<Problem>(body).is_ok_and(|problem| {
            problem.kind == "urn:ietf:params:jmap:error:limit"
                && matches!(
                    problem.limit.as_deref(),
                    Some("maxConcurrentRequests" | "maxConcurrentUpload")
                )
        })
}

fn backoff(attempt: u32) -> Duration {
    LIMIT_BACKOFF
        .saturating_mul(1 << attempt)
        .min(LIMIT_BACKOFF_CAP)
        .mul_f64(rand::random::<f64>())
}
