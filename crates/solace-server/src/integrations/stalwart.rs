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
use serde_json::Value;
use tokio::sync::Semaphore;

/// Resends after a concurrency-limit refusal, with full-jitter backoff that sums to at most 2.35 s.
const LIMIT_RETRIES: u32 = 6;
const LIMIT_BACKOFF: Duration = Duration::from_millis(50);
const LIMIT_BACKOFF_CAP: Duration = Duration::from_millis(800);

/// Calls a shared Stalwart account keeps in flight: half its `maxConcurrentRequests` of 32, leaving room for the Go worker on the same account.
const LANE_PERMITS: usize = 16;
pub static NOREPLY_LANE: Semaphore = Semaphore::const_new(LANE_PERMITS);
pub static PROVISIONER_LANE: Semaphore = Semaphore::const_new(LANE_PERMITS);

/// `send` once `lane` has room, so a burst queues here instead of outlasting the limit's resends.
pub async fn send_in(
    lane: &Semaphore,
    request: RequestBuilder,
) -> Result<(StatusCode, Bytes), reqwest::Error> {
    // The lanes are statics that are never closed, so acquiring only waits.
    let _permit = lane.acquire().await;
    send(request).await
}

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

/// The arguments of the first response to `method` in a JMAP envelope.
pub fn method_response<'a>(envelope: &'a Value, method: &str) -> Option<&'a Value> {
    envelope
        .get("methodResponses")?
        .as_array()?
        .iter()
        .find(|response| response.get(0).and_then(Value::as_str) == Some(method))?
        .get(1)
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

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use tokio::sync::Semaphore;

    use super::fake::{FakeStalwart, Reply};
    use super::send_in;

    #[tokio::test]
    async fn a_full_lane_holds_the_call_until_a_permit_frees() {
        let fake = FakeStalwart::start(|_| Reply::json(serde_json::json!({}))).await;
        let lane = Box::leak(Box::new(Semaphore::new(1)));
        let held = lane.acquire().await.expect("permit");
        let request = reqwest::Client::new().get(format!("{}/jmap/session", fake.base_url));
        let call = tokio::spawn(send_in(lane, request));
        tokio::time::sleep(Duration::from_millis(100)).await;
        assert!(
            fake.requests().is_empty(),
            "the call went out without a permit"
        );
        drop(held);
        let (status, _) = call.await.expect("task").expect("send");
        assert_eq!(status.as_u16(), 200);
        assert_eq!(fake.requests().len(), 1);
    }
}
