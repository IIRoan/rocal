//! The request id (`x-request-id` when sane, else a UUID) and the sanitized method and URL, available to error rendering.

use axum::extract::Request;
use axum::middleware::Next;
use axum::response::Response;

use crate::telemetry;

const MAX_REQUEST_ID_LENGTH: usize = 128;

#[derive(Debug, Clone)]
pub struct RequestContext {
    pub id: String,
    pub method: String,
    pub url: String,
}

tokio::task_local! {
    static CONTEXT: RequestContext;
}

pub fn current() -> Option<RequestContext> {
    CONTEXT.try_with(Clone::clone).ok()
}

pub async fn middleware(request: Request, next: Next) -> Response {
    let id = request
        .headers()
        .get("x-request-id")
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|id| !id.is_empty() && id.len() <= MAX_REQUEST_ID_LENGTH)
        .map_or_else(|| uuid::Uuid::new_v4().to_string(), str::to_owned);
    let context = RequestContext {
        id,
        method: request.method().to_string(),
        url: telemetry::sanitize_request_url(&request.uri().to_string()),
    };
    CONTEXT.scope(context, next.run(request)).await
}

/// Runs `future` as if it served a request with this id, for tests of error rendering.
#[cfg(test)]
pub async fn scoped<F: std::future::Future>(id: &str, future: F) -> F::Output {
    let context = RequestContext {
        id: id.to_owned(),
        method: "GET".into(),
        url: "/api/test".into(),
    };
    CONTEXT.scope(context, future).await
}
