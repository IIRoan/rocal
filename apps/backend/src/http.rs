//! HTTP plumbing: middleware, extractors, origin policy and the Zod-compatible validator.

pub mod client_ip;
#[cfg(test)]
mod contract_tests;
pub mod extract;
pub mod headers;
pub mod origins;
pub mod rate_limit;
pub mod request_context;
pub mod response_cookies;
pub mod schemas;
pub mod zod;

use std::time::Duration;

use axum::extract::Request;
use axum::http::Uri;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use crate::error::AppError;

/// Vercel's request body limit, which every shipped client already lives within.
pub const BODY_LIMIT_BYTES: usize = 4_500_000;
/// Vercel's function duration limit; streaming responses return before it and keep streaming.
pub const REQUEST_TIMEOUT: Duration = Duration::from_secs(300);

pub async fn timeout(request: Request, next: Next) -> Response {
    match tokio::time::timeout(REQUEST_TIMEOUT, next.run(request)).await {
        Ok(response) => response,
        Err(_) => AppError::internal("request timed out").into_response(),
    }
}

/// Elysia matches `/api/health/` like `/api/health`, so a trailing slash is dropped before routing; JMAP proxy paths keep theirs for Stalwart.
pub fn normalize_path(mut request: Request) -> Request {
    let path = request.uri().path();
    let proxied = path
        .strip_prefix("/api/mail/jmap/jmap/")
        .is_some_and(|rest| !rest.is_empty());
    if path.len() > 1 && path.ends_with('/') && !proxied {
        let trimmed = path.trim_end_matches('/');
        let trimmed = if trimmed.is_empty() { "/" } else { trimmed };
        let rebuilt = match request.uri().query() {
            Some(query) => format!("{trimmed}?{query}"),
            None => trimmed.to_owned(),
        };
        if let Ok(path_and_query) = rebuilt.parse() {
            let mut parts = request.uri().clone().into_parts();
            parts.path_and_query = Some(path_and_query);
            if let Ok(uri) = Uri::from_parts(parts) {
                *request.uri_mut() = uri;
            }
        }
    }
    request
}
