//! `/api/mail/jmap/*`: the browser's JMAP relay to Stalwart. Only Bearer tokens are relayed, the session can mint one, and paths stay on the JMAP allowlist.

use std::time::{Duration, Instant};

use axum::body::{Body, Bytes};
use axum::extract::{Path, Request, State};
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::any;
use serde_json::{Value, json};
use thiserror::Error;
use utoipa_axum::router::OpenApiRouter;

use crate::auth::guard::{optional_session, step_up};
use crate::error::AppError;
use crate::http::BODY_LIMIT_BYTES;
use crate::http::client_ip::client_ip;
use crate::http::rate_limit::{self, Limit};
use crate::http::response_cookies::ResponseCookies;
use crate::instant;
use crate::mail::service;
use crate::state::AppState;
use crate::telemetry::redact_pii;

/// Deliberately loose: real clients are chatty, and this only has to make bearer guessing against Stalwart impractical.
const RATE_LIMIT: Limit = Limit {
    requests: 1200,
    window: Duration::from_secs(60),
};
const MAX_REDIRECT_HOPS: usize = 5;
/// Bodies up to this size are kept for the retry with a session-minted token after a 401; larger uploads stream once, after their token passed a session check.
const RETRY_BUFFER_BYTES: u64 = 1024 * 1024;
const SLOW_UPSTREAM: Duration = Duration::from_millis(400);

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .route("/api/mail/jmap/.well-known/jmap", any(discovery))
        .route("/api/mail/jmap/jmap", any(api))
        .route("/api/mail/jmap/jmap/{*rest}", any(nested))
}

async fn discovery(State(state): State<AppState>, request: Request) -> Response {
    relay(&state, "/.well-known/jmap".into(), request).await
}

async fn api(State(state): State<AppState>, request: Request) -> Response {
    relay(&state, "/jmap/".into(), request).await
}

async fn nested(
    State(state): State<AppState>,
    Path(rest): Path<String>,
    request: Request,
) -> Response {
    relay(&state, format!("/jmap/{rest}"), request).await
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum PathError {
    #[error("Invalid proxy path.")]
    Invalid,
    #[error("Proxy path is not allowed.")]
    NotAllowed,
    #[error("Invalid redirect location.")]
    InvalidRedirect,
    #[error("Redirect target is not allowed.")]
    RedirectNotAllowed,
    #[error("Too many upstream redirects.")]
    TooManyRedirects,
}

fn is_allowed_pathname(pathname: &str) -> bool {
    !pathname.contains('\\')
        && (matches!(
            pathname,
            "/.well-known/jmap" | "/jmap" | "/jmap/" | "/jmap/session"
        ) || pathname.starts_with("/jmap/upload/")
            || pathname.starts_with("/jmap/download/")
            || pathname.starts_with("/jmap/eventsource"))
}

fn base_url(upstream_base: &str) -> Result<url::Url, PathError> {
    url::Url::parse(&format!("{}/", upstream_base.trim_end_matches('/')))
        .map_err(|_| PathError::Invalid)
}

/// `buildSafeJmapUpstreamUrl`: the path resolved like `new URL`, kept on the Stalwart origin and the JMAP allowlist.
pub fn upstream_url(
    upstream_base: &str,
    path: &str,
    query: Option<&str>,
) -> Result<String, PathError> {
    let base = base_url(upstream_base)?;
    let path = if path.starts_with('/') {
        path.to_owned()
    } else {
        format!("/{path}")
    };
    let resolved = base.join(&path).map_err(|_| PathError::Invalid)?;
    if resolved.origin() != base.origin() {
        return Err(PathError::NotAllowed);
    }
    let mut pathname = String::with_capacity(resolved.path().len());
    for c in resolved.path().chars() {
        if !(c == '/' && pathname.ends_with('/')) {
            pathname.push(c);
        }
    }
    if !is_allowed_pathname(&pathname) {
        return Err(PathError::NotAllowed);
    }
    let search = query.map(|q| format!("?{q}")).unwrap_or_default();
    Ok(format!(
        "{}{pathname}{search}",
        upstream_base.trim_end_matches('/')
    ))
}

/// `resolveAllowedJmapRedirectUrl`: a same-origin `Location`, put back through the allowlist.
pub fn redirect_url(
    upstream_base: &str,
    current: &str,
    location: &str,
) -> Result<String, PathError> {
    let base = base_url(upstream_base)?;
    let resolved = url::Url::parse(current)
        .and_then(|current| current.join(location))
        .map_err(|_| PathError::InvalidRedirect)?;
    if resolved.origin() != base.origin() {
        return Err(PathError::RedirectNotAllowed);
    }
    upstream_url(upstream_base, resolved.path(), resolved.query())
}

fn is_redirect(status: StatusCode) -> bool {
    matches!(status.as_u16(), 301 | 302 | 303 | 307 | 308)
}

/// The proxy's own error body, which has never carried a request id.
fn proxy_error(status: StatusCode, error: &str, message: &str) -> Response {
    (
        status,
        axum::Json(json!({
            "error": error,
            "message": message,
            "statusCode": status.as_u16(),
            "timestamp": instant::iso(instant::now()).0,
        })),
    )
        .into_response()
}

enum Outgoing {
    Empty,
    Buffered(Bytes),
    /// Read once, so a 401 or a 307 after it went out can't be replayed.
    Streamed(Option<Body>),
}

impl Outgoing {
    fn take(&mut self) -> Option<reqwest::Body> {
        match self {
            Self::Empty => None,
            Self::Buffered(bytes) if bytes.is_empty() => None,
            Self::Buffered(bytes) => Some(reqwest::Body::from(bytes.clone())),
            Self::Streamed(body) => body
                .take()
                .map(|body| reqwest::Body::wrap_stream(body.into_data_stream())),
        }
    }

    fn replayable(&self) -> bool {
        !matches!(self, Self::Streamed(None))
    }

    /// The JMAP method names of a buffered request, for logs and `Server-Timing`.
    fn method_calls(&self) -> Vec<String> {
        let Self::Buffered(bytes) = self else {
            return Vec::new();
        };
        let Ok(body) = serde_json::from_slice::<Value>(bytes) else {
            return Vec::new();
        };
        body.get("methodCalls")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|call| call.get(0).and_then(Value::as_str).map(str::to_owned))
            .collect()
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum AuthSource {
    Session,
    ClientBearer,
    Missing,
}

impl AuthSource {
    fn as_str(self) -> &'static str {
        match self {
            Self::Session => "session",
            Self::ClientBearer => "client-bearer",
            Self::Missing => "missing",
        }
    }
}

#[derive(Default)]
struct Timings {
    auth: Duration,
    session: Duration,
    token: Duration,
}

fn operation(upstream_path: &str) -> &'static str {
    if upstream_path.contains("/upload/") {
        "blob-upload"
    } else if upstream_path.contains("/download/") {
        "blob-download"
    } else if upstream_path == "/.well-known/jmap" {
        "discovery"
    } else if upstream_path.starts_with("/jmap/") {
        "jmap-api"
    } else {
        "other"
    }
}

/// `proxyJmapRequest` behind the per-address limit.
async fn relay(state: &AppState, upstream_path: String, request: Request) -> Response {
    let started = Instant::now();
    let (parts, body) = request.into_parts();
    if let Err(AppError::RateLimited { message, .. }) =
        rate_limit::enforce("mail-jmap-proxy", &client_ip(&parts.headers), RATE_LIMIT)
    {
        return proxy_error(StatusCode::TOO_MANY_REQUESTS, "Too many requests", &message);
    }
    let client_authorization = parts
        .headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    // Forwarding Basic would turn the proxy into a credential-stuffing oracle against the mail server.
    if client_authorization
        .as_deref()
        .is_some_and(|value| !is_bearer(value))
    {
        return proxy_error(
            StatusCode::BAD_REQUEST,
            "Bad request",
            "Mailbox authorization must use a Bearer token.",
        );
    }
    let method = parts.method.clone();
    let Some(mut outgoing) = outgoing_body(&method, &parts.headers, body).await else {
        return proxy_error(
            StatusCode::PAYLOAD_TOO_LARGE,
            "Payload Too Large",
            "Request body is too large.",
        );
    };
    let cookies = parts.extensions.get::<ResponseCookies>();
    let mut attempt = Attempt {
        state,
        headers: &parts.headers,
        cookies,
        client_authorization: client_authorization.as_deref(),
        upstream_path: &upstream_path,
        query: parts.uri.query(),
        method: &method,
        started,
    };
    let first = attempt.send(&mut outgoing, None).await;
    match first {
        Sent::Upstream {
            response,
            auth_source,
            ..
        } if response.status() == StatusCode::UNAUTHORIZED && outgoing.replayable() => {
            tracing::debug!(
                operation = operation(&upstream_path),
                auth_source = auth_source.as_str(),
                "JMAP proxy refreshing upstream auth after 401"
            );
            attempt
                .send(&mut outgoing, Some(auth_source))
                .await
                .into_response(&outgoing, &upstream_path)
        }
        other => other.into_response(&outgoing, &upstream_path),
    }
}

/// `/^Bearer\s/i`.
fn is_bearer(value: &str) -> bool {
    value
        .get(..6)
        .is_some_and(|scheme| scheme.eq_ignore_ascii_case("bearer"))
        && value[6..].starts_with(char::is_whitespace)
}

/// The request body, or `None` past Vercel's limit.
async fn outgoing_body(method: &Method, headers: &HeaderMap, body: Body) -> Option<Outgoing> {
    if *method == Method::GET || *method == Method::HEAD {
        return Some(Outgoing::Empty);
    }
    let length = headers
        .get(header::CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok());
    match length {
        Some(length) if length > BODY_LIMIT_BYTES as u64 => None,
        Some(length) if length > RETRY_BUFFER_BYTES => Some(Outgoing::Streamed(Some(body))),
        _ => axum::body::to_bytes(body, BODY_LIMIT_BYTES)
            .await
            .ok()
            .map(Outgoing::Buffered),
    }
}

struct Attempt<'a> {
    state: &'a AppState,
    headers: &'a HeaderMap,
    cookies: Option<&'a ResponseCookies>,
    client_authorization: Option<&'a str>,
    upstream_path: &'a str,
    query: Option<&'a str>,
    method: &'a Method,
    started: Instant,
}

enum Sent {
    Early(Response),
    Upstream {
        response: reqwest::Response,
        auth_source: AuthSource,
        retried: bool,
        timings: Timings,
        upstream: Duration,
        started: Instant,
    },
}

impl Attempt<'_> {
    /// One upstream try; `retry_after` is the auth source whose token Stalwart just refused.
    async fn send(&mut self, outgoing: &mut Outgoing, retry_after: Option<AuthSource>) -> Sent {
        let mut timings = Timings::default();
        let mut authorization = self.client_authorization.map(str::to_owned);
        let mut auth_source = if authorization.is_some() {
            AuthSource::ClientBearer
        } else {
            AuthSource::Missing
        };
        // A client bearer skips the session lookup and token cache; the session mints only without one or after a 401.
        if retry_after.is_some() || authorization.is_none() {
            let auth_started = Instant::now();
            match self.session_token(retry_after, &mut timings).await {
                Ok(Some(token)) => {
                    authorization = Some(format!("Bearer {token}"));
                    auth_source = AuthSource::Session;
                }
                Ok(None) => {}
                Err(refused) => return Sent::Early(refused.into_response()),
            }
            timings.auth = auth_started.elapsed();
        }
        let Some(authorization) = authorization else {
            return Sent::Early(proxy_error(
                StatusCode::UNAUTHORIZED,
                "Unauthorized",
                "Mailbox authorization is required.",
            ));
        };
        let base = self.state.config.stalwart_base_url.clone();
        let url = match upstream_url(&base, self.upstream_path, self.query) {
            Ok(url) => url,
            Err(error) => {
                return Sent::Early(proxy_error(
                    StatusCode::BAD_REQUEST,
                    "Bad request",
                    &error.to_string(),
                ));
            }
        };
        let upstream_started = Instant::now();
        // A streamed body goes out once, so a token Stalwart refuses takes the 401 retry before the upload starts.
        let refused = if retry_after.is_none() && matches!(outgoing, Outgoing::Streamed(Some(_))) {
            self.refused(&base, &authorization).await
        } else {
            None
        };
        let fetched = match refused {
            Some(refusal) => Ok(refusal),
            None => self.fetch(&base, url, &authorization, outgoing).await,
        };
        let response = match fetched {
            Ok(response) => response,
            Err(Upstream::Path(error)) => {
                return Sent::Early(proxy_error(
                    StatusCode::BAD_REQUEST,
                    "Bad request",
                    &error.to_string(),
                ));
            }
            Err(Upstream::Network(error)) => {
                let message = network_message(error);
                tracing::error!(
                    operation = operation(self.upstream_path),
                    error = %redact_pii(&message),
                    "JMAP proxy upstream request failed"
                );
                return Sent::Early(proxy_error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "Mail server unreachable",
                    &format!("Could not connect to the mail server: {message}"),
                ));
            }
        };
        Sent::Upstream {
            response,
            auth_source,
            retried: retry_after.is_some(),
            timings,
            upstream: upstream_started.elapsed(),
            started: self.started,
        }
    }

    /// A token minted from the session; a session that still needs passkey step-up is refused as `/api/mail/oauth/access-token` refuses it.
    async fn session_token(
        &self,
        retry_after: Option<AuthSource>,
        timings: &mut Timings,
    ) -> Result<Option<String>, AppError> {
        let session_started = Instant::now();
        let active = optional_session(self.state, self.headers, self.cookies)
            .await
            .unwrap_or_else(|error| {
                tracing::debug!(error = %redact_pii(&error.to_string()), "JMAP proxy session lookup failed");
                None
            });
        timings.session = session_started.elapsed();
        let Some(active) = active else {
            return Ok(None);
        };
        step_up(self.state, self.headers, &active).await?;
        let user = active.user;
        let email = user.email.trim();
        if email.is_empty() {
            return Ok(None);
        }
        // Only a session-minted token that itself drew the 401 is dropped; a client bearer's 401 keeps the warm cache.
        if retry_after == Some(AuthSource::Session) {
            service::invalidate_access_token(self.state, &user.id);
        }
        let token_started = Instant::now();
        let token = service::access_token_for_user(self.state, &user.id, email).await;
        timings.token = token_started.elapsed();
        match token {
            Ok(token) => Ok(Some(token.access_token)),
            Err(error) => {
                tracing::debug!(error = %redact_pii(&error.to_string()), "JMAP proxy could not mint a mail token from the session");
                Ok(None)
            }
        }
    }

    /// Stalwart's 401 when it refuses `authorization` on the JMAP session; anything else lets the upload go ahead.
    async fn refused(&self, base: &str, authorization: &str) -> Option<reqwest::Response> {
        let url = upstream_url(base, "/jmap/session", None).ok()?;
        let request = self
            .state
            .http_no_redirect
            .get(&url)
            .header(header::AUTHORIZATION, authorization);
        let response = self
            .state
            .stalwart_gate
            .apply(request, &url)
            .send()
            .await
            .ok()?;
        (response.status() == StatusCode::UNAUTHORIZED).then_some(response)
    }

    /// `fetchJmapUpstream`: same-origin redirects are followed here, so a 307 never reaches the client.
    async fn fetch(
        &self,
        base: &str,
        mut url: String,
        authorization: &str,
        outgoing: &mut Outgoing,
    ) -> Result<reqwest::Response, Upstream> {
        let mut method = self.method.clone();
        let mut body = outgoing.take();
        for hop in 0..=MAX_REDIRECT_HOPS {
            let mut request =
                upstream_request(self.state, &method, &url, authorization, self.headers);
            // A streamed upload keeps its declared length instead of going out chunked.
            if body.is_some()
                && !outgoing.replayable()
                && let Some(length) = self.headers.get(header::CONTENT_LENGTH)
            {
                request = request.header(header::CONTENT_LENGTH, length);
            }
            if let Some(body) = body.take() {
                request = request.body(body);
            }
            let response = request.send().await.map_err(Upstream::Network)?;
            let location = response
                .headers()
                .get(header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .map(str::to_owned);
            let (true, Some(location)) = (is_redirect(response.status()), location) else {
                return Ok(response);
            };
            if hop == MAX_REDIRECT_HOPS {
                return Err(Upstream::Path(PathError::TooManyRedirects));
            }
            let keeps_method = matches!(response.status().as_u16(), 307 | 308);
            if keeps_method && !outgoing.replayable() {
                return Ok(response);
            }
            url = redirect_url(base, &url, &location).map_err(Upstream::Path)?;
            if keeps_method {
                body = outgoing.take();
            } else if method != Method::HEAD {
                method = Method::GET;
            }
        }
        Err(Upstream::Path(PathError::TooManyRedirects))
    }
}

/// The client's Bearer, `Accept` and `Content-Type`, and the backend-gate key, which replaces any the client sent.
fn upstream_request(
    state: &AppState,
    method: &Method,
    url: &str,
    authorization: &str,
    client: &HeaderMap,
) -> reqwest::RequestBuilder {
    let mut request = state
        .http_no_redirect
        .request(method.clone(), url)
        .header(header::AUTHORIZATION, authorization);
    for name in [header::ACCEPT, header::CONTENT_TYPE] {
        if let Some(value) = client.get(&name) {
            request = request.header(name, value);
        }
    }
    state.stalwart_gate.apply(request, url)
}

/// Only the content type and caching come back, so upstream headers like the gate key never reach the client.
fn relayed_headers(upstream: &HeaderMap) -> HeaderMap {
    let mut headers = HeaderMap::new();
    for name in [header::CONTENT_TYPE, header::CACHE_CONTROL] {
        if let Some(value) = upstream.get(&name) {
            headers.insert(name, value.clone());
        }
    }
    headers
}

enum Upstream {
    Path(PathError),
    Network(reqwest::Error),
}

/// The transport failure without the upstream URL, which would name the internal Stalwart host.
fn network_message(error: reqwest::Error) -> String {
    let error = error.without_url();
    let mut message = error.to_string();
    let mut source = std::error::Error::source(&error);
    while let Some(cause) = source {
        message.push_str(": ");
        message.push_str(&cause.to_string());
        source = cause.source();
    }
    message
}

impl Sent {
    fn into_response(self, outgoing: &Outgoing, upstream_path: &str) -> Response {
        let (response, auth_source, retried, timings, upstream, started) = match self {
            Sent::Early(response) => return response,
            Sent::Upstream {
                response,
                auth_source,
                retried,
                timings,
                upstream,
                started,
            } => (response, auth_source, retried, timings, upstream, started),
        };
        let status = response.status();
        let op = operation(upstream_path);
        let method_calls = outgoing.method_calls();
        let op_desc = if method_calls.is_empty() {
            op.to_owned()
        } else {
            method_calls
                .iter()
                .take(4)
                .cloned()
                .collect::<Vec<_>>()
                .join("+")
        };
        let op_desc: String = op_desc.chars().take(80).collect();
        if upstream >= SLOW_UPSTREAM {
            tracing::info!(
                event = "jmap_proxy_slow_upstream",
                operation = op,
                status = status.as_u16(),
                auth_source = auth_source.as_str(),
                retried,
                upstream_ms = upstream.as_millis(),
                total_ms = started.elapsed().as_millis(),
                "JMAP proxy slow upstream"
            );
        }
        if !status.is_success() {
            let send_failure = status == StatusCode::UNAUTHORIZED
                && (op == "blob-upload"
                    || method_calls
                        .iter()
                        .any(|m| m == "Email/set" || m == "EmailSubmission/set"));
            if status.is_server_error() || send_failure {
                tracing::error!(
                    operation = op,
                    status = status.as_u16(),
                    auth_source = auth_source.as_str(),
                    retried,
                    "JMAP proxy upstream responded with an error"
                );
            } else {
                tracing::warn!(
                    operation = op,
                    status = status.as_u16(),
                    auth_source = auth_source.as_str(),
                    retried,
                    "JMAP proxy upstream responded with an error"
                );
            }
        }
        let mut headers = relayed_headers(response.headers());
        let timing = format!(
            "auth;dur={:.1}, session;dur={:.1}, token;dur={:.1}, upstream;dur={:.1}, total;dur={:.1}, auth_source;desc=\"{}\", retry;desc=\"{}\", op;desc={}",
            millis(timings.auth),
            millis(timings.session),
            millis(timings.token),
            millis(upstream),
            millis(started.elapsed()),
            auth_source.as_str(),
            if retried { "1" } else { "0" },
            quote(if op_desc.is_empty() {
                "unknown"
            } else {
                &op_desc
            }),
        );
        if let Ok(value) = HeaderValue::from_str(&timing) {
            headers.insert("server-timing", value);
        }
        let mut relayed = Response::new(Body::from_stream(response.bytes_stream()));
        *relayed.status_mut() = status;
        *relayed.headers_mut() = headers;
        relayed
    }
}

/// `quoteServerTimingDesc`.
fn quote(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
}

fn millis(duration: Duration) -> f64 {
    duration.as_secs_f64() * 1000.0
}

#[cfg(test)]
mod tests {
    use axum::http::Request as HttpRequest;
    use tower::ServiceExt;

    use super::*;

    const BASE: &str = "https://mail.solace.onl";

    fn state(stalwart: &str) -> AppState {
        let config = crate::config::Config::from_lookup(|name| match name {
            "DATABASE_URL" => Some("postgres://solace_test:x@127.0.0.1:1/solace_test".into()),
            "BETTER_AUTH_SECRET" => Some("solace-test-auth-secret-0123456789abcdef".into()),
            "STALWART_BASE_URL" => Some(stalwart.into()),
            "STALWART_GATE_KEY" => Some("g".repeat(64)),
            _ => None,
        })
        .unwrap();
        let pool = sea_orm::sqlx::postgres::PgPoolOptions::new()
            .connect_lazy(&config.database_url)
            .unwrap();
        AppState::new(
            config,
            sea_orm::SqlxPostgresConnector::from_sqlx_postgres_pool(pool),
        )
        .unwrap()
    }

    #[test]
    fn upstream_urls_keep_the_stalwart_origin() {
        assert_eq!(
            upstream_url(BASE, "/jmap/", Some("types=Email")).unwrap(),
            "https://mail.solace.onl/jmap/?types=Email"
        );
        for allowed in [
            "/.well-known/jmap",
            "/jmap/",
            "/jmap/upload/account-1/",
            "/jmap/download/account-1/blob-1/file.eml",
            "/jmap/eventsource/",
        ] {
            assert_eq!(
                upstream_url(BASE, allowed, None).unwrap(),
                format!("{BASE}{allowed}")
            );
        }
        for refused in [
            "/jmap/%2e%2e%2f%2e%2e%2fapi/store/setting",
            "/jmap/../../api/store/setting",
            "/admin",
            "/slot-manager/status",
            "/jmap/upload\\..\\admin",
        ] {
            assert_eq!(
                upstream_url(BASE, refused, None),
                Err(PathError::NotAllowed),
                "{refused}"
            );
        }
    }

    #[test]
    fn follows_same_origin_redirects() {
        assert_eq!(
            redirect_url(
                BASE,
                "https://mail.solace.onl/.well-known/jmap",
                "/jmap/session"
            )
            .unwrap(),
            "https://mail.solace.onl/jmap/session"
        );
    }

    #[test]
    fn rejects_cross_origin_redirects() {
        assert_eq!(
            redirect_url(
                BASE,
                "https://mail.solace.onl/.well-known/jmap",
                "https://evil.example/jmap/"
            ),
            Err(PathError::RedirectNotAllowed)
        );
    }

    #[tokio::test]
    async fn sends_only_the_server_gate_key_and_never_returns_it() {
        let state = state("https://gate.test");
        let mut client = HeaderMap::new();
        client.insert(
            crate::integrations::stalwart::gate::GATE_HEADER,
            HeaderValue::from_static("forged"),
        );
        let request = upstream_request(
            &state,
            &Method::GET,
            "https://gate.test/jmap/session",
            "Bearer mail-access-token",
            &client,
        )
        .build()
        .unwrap();
        let sent: Vec<_> = request
            .headers()
            .get_all(crate::integrations::stalwart::gate::GATE_HEADER)
            .iter()
            .collect();
        assert_eq!(sent, [HeaderValue::from_str(&"g".repeat(64)).unwrap()]);
        let mut upstream = HeaderMap::new();
        upstream.insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/json"),
        );
        upstream.insert(
            crate::integrations::stalwart::gate::GATE_HEADER,
            HeaderValue::from_static("echo"),
        );
        let relayed = relayed_headers(&upstream);
        assert!(!relayed.contains_key(crate::integrations::stalwart::gate::GATE_HEADER));
        assert_eq!(
            relayed.get(header::CONTENT_TYPE).unwrap(),
            "application/json"
        );
    }

    #[tokio::test]
    async fn large_uploads_never_stream_on_a_token_stalwart_refuses() {
        use crate::db::scratch::ScratchDatabase;
        use crate::integrations::stalwart::fake::{FakeStalwart, Reply};
        use crate::mail::service::tests::{
            OWNER, Plan, cache_token, mail_state, provisioning, seed_mailbox,
        };
        use sea_orm::ConnectionTrait;

        let database = ScratchDatabase::create().await;
        let registry = provisioning(Plan::default());
        // Only the bearer the bridge login mints is good; the cached one was revoked.
        let fake = FakeStalwart::start(move |request| {
            let fresh = request.authorization.as_deref() == Some("Bearer stalwart-access-token");
            match request.path.as_str() {
                "/jmap/session" | "/jmap/upload/acct-1/" if !fresh => Reply::status(401),
                "/jmap/session" => Reply::json(json!({"username": "alice@solace.test"})),
                "/jmap/upload/acct-1/" => Reply::json(json!({"blobId": "blob-1"})),
                _ => registry(request),
            }
        })
        .await;
        let state = mail_state(&database, &fake).await;
        seed_mailbox(&state, "acct-1").await;
        cache_token(&state, "revoked-token");
        state
            .db
            .execute_unprepared(&format!(
                "INSERT INTO session (id, token, user_id, expires_at, created_at, updated_at) \
                 VALUES ('session-1', 'session-token', '{OWNER}', now() + interval '7 days', now(), now())"
            ))
            .await
            .unwrap();
        let signed = state
            .cookies
            .signed(&state.cookies.session_token(), "session-token", None);
        let cookie = signed.split(';').next().unwrap().to_owned();
        let size = usize::try_from(RETRY_BUFFER_BYTES).unwrap() + 512 * 1024;

        let response = routes()
            .split_for_parts()
            .0
            .with_state(state)
            .oneshot(
                HttpRequest::post("/api/mail/jmap/jmap/upload/acct-1/")
                    .header(header::COOKIE, cookie)
                    .header(header::CONTENT_TYPE, "application/octet-stream")
                    .header(header::CONTENT_LENGTH, size)
                    .body(Body::from(vec![7u8; size]))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let uploads: Vec<_> = fake
            .requests()
            .into_iter()
            .filter(|r| r.path == "/jmap/upload/acct-1/")
            .collect();
        assert_eq!(uploads.len(), 1, "the body went out once");
        assert_eq!(
            uploads[0].authorization.as_deref(),
            Some("Bearer stalwart-access-token")
        );
        assert_eq!(uploads[0].body.len(), size);
    }

    #[tokio::test]
    async fn unreachable_upstream_is_a_503() {
        let app = routes()
            .split_for_parts()
            .0
            .with_state(state("http://127.0.0.1:1"));
        let response = app
            .oneshot(
                HttpRequest::post("/api/mail/jmap/jmap")
                    .header(header::AUTHORIZATION, "Bearer mail-access-token")
                    .header(header::CONTENT_TYPE, "application/json")
                    .body(Body::from(
                        r#"{"using":["urn:ietf:params:jmap:core","urn:ietf:params:jmap:mail"],"methodCalls":[["Mailbox/get",{"accountId":"b"},"c1"]]}"#,
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
        let body: Value = serde_json::from_slice(
            &axum::body::to_bytes(response.into_body(), usize::MAX)
                .await
                .unwrap(),
        )
        .unwrap();
        assert_eq!(body["error"], "Mail server unreachable");
        let message = body["message"].as_str().unwrap();
        assert!(
            message.starts_with("Could not connect to the mail server: ")
                && message.contains("Connection refused")
                && !message.contains("127.0.0.1"),
            "{message}"
        );
    }
}
