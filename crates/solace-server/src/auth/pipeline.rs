//! The request path Better Auth runs before an endpoint: rate limit, Expo origin, media type and body, then the origin and redirect-URL checks.

use axum::body::{Body, Bytes};
use axum::extract::{FromRequestParts, Request, State};
use axum::http::request::Parts;
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode, header};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use serde_json::{Value, json};

use super::api::{ApiError, codes};
use super::rate_limit;
use crate::http::headers::request_host;
use crate::http::{BODY_LIMIT_BYTES, extract};
use crate::state::AppState;

/// Endpoints that also accept HTML form posts.
const FORM_PATHS: [&str; 2] = ["/sign-in/email", "/sign-up/email"];

/// The parsed body of a Better Auth request, `None` when there was none.
#[derive(Clone, Debug, Default)]
pub struct AuthBody(pub Option<Value>);

impl<S: Send + Sync> FromRequestParts<S> for AuthBody {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        Ok(parts.extensions.get::<Self>().cloned().unwrap_or_default())
    }
}

/// Applies to `/api/auth/*` only.
pub async fn middleware(State(state): State<AppState>, request: Request, next: Next) -> Response {
    if !request.uri().path().starts_with("/api/auth/") {
        return next.run(request).await;
    }
    match prepare(&state, request).await {
        Ok(request) => next.run(request).await,
        Err(rejection) => rejection.into_response(),
    }
}

/// Why the pipeline answered before the endpoint ran.
enum Rejection {
    Api(ApiError),
    TooManyRequests(i64),
}

impl From<ApiError> for Rejection {
    fn from(error: ApiError) -> Self {
        Self::Api(error)
    }
}

impl IntoResponse for Rejection {
    fn into_response(self) -> Response {
        match self {
            Self::Api(error) => error.into_response(),
            Self::TooManyRequests(retry_after) => too_many_requests(retry_after),
        }
    }
}

async fn prepare(state: &AppState, request: Request) -> Result<Request, Rejection> {
    let path = request
        .uri()
        .path()
        .strip_prefix("/api/auth")
        .unwrap_or_default()
        .to_owned();
    if let Some(rule) = rate_limit::rule_for(&path) {
        let ip = rate_limit::client_key_ip(request.headers(), state.config.is_production);
        let key = rate_limit::hashed_key(&state.config.auth_secret, &ip, &path);
        match rate_limit::consume(&state.db, &key, rule).await {
            Ok(None) => {}
            Ok(Some(retry_after)) => return Err(Rejection::TooManyRequests(retry_after)),
            Err(error) => return Err(ApiError::from(error).into()),
        }
    }
    let (mut parts, body) = request.into_parts();
    // The Expo plugin: native apps send their scheme as `expo-origin` and Better Auth judges it as the Origin.
    if !parts.headers.contains_key(header::ORIGIN)
        && let Some(expo) = parts.headers.get("expo-origin").cloned()
    {
        parts.headers.insert(header::ORIGIN, expo);
    }
    let reads_body = !matches!(parts.method, Method::GET | Method::HEAD | Method::OPTIONS);
    let mut parsed = None;
    let mut bytes = Bytes::new();
    if reads_body {
        bytes = axum::body::to_bytes(body, BODY_LIMIT_BYTES)
            .await
            .map_err(|_| {
                ApiError::new(
                    StatusCode::PAYLOAD_TOO_LARGE,
                    "BAD_REQUEST",
                    "Request body too large",
                )
            })?;
        parsed = parse(&parts.headers, &path, &bytes)?;
        check_origin(state, &parts.headers, parsed.as_ref(), parts.uri.query())?;
    }
    parts.extensions.insert(AuthBody(parsed));
    Ok(Request::from_parts(parts, Body::from(bytes)))
}

fn too_many_requests(retry_after: i64) -> Response {
    let mut response = (
        StatusCode::TOO_MANY_REQUESTS,
        axum::Json(json!({"message": "Too many requests. Please try again later."})),
    )
        .into_response();
    if let Ok(value) = HeaderValue::from_str(&retry_after.to_string()) {
        response.headers_mut().insert("x-retry-after", value);
    }
    response
}

/// better-call's body handling: allowed media types per endpoint, JSON or form, empty as `undefined`.
fn parse(headers: &HeaderMap, path: &str, bytes: &[u8]) -> Result<Option<Value>, ApiError> {
    if bytes.is_empty() {
        return Ok(None);
    }
    let media = headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.split(';').next())
        .map(|v| v.trim().to_ascii_lowercase())
        .unwrap_or_default();
    let allows_form = FORM_PATHS.contains(&path);
    match media.as_str() {
        "application/json" => serde_json::from_slice(bytes).map(Some).map_err(|_| {
            ApiError::new(
                StatusCode::BAD_REQUEST,
                "BAD_REQUEST",
                "Invalid JSON in request body",
            )
        }),
        "application/x-www-form-urlencoded" if allows_form => {
            Ok(Some(Value::Object(extract::form_object(bytes))))
        }
        other => {
            let allowed = if allows_form {
                "application/x-www-form-urlencoded, application/json"
            } else {
                "application/json"
            };
            Err(ApiError::new(
                StatusCode::UNSUPPORTED_MEDIA_TYPE,
                "UNSUPPORTED_MEDIA_TYPE",
                format!("Content-Type \"{other}\" is not allowed. Allowed types: {allowed}"),
            ))
        }
    }
}

/// `originCheckMiddleware`: with cookies, the Origin must be trusted; redirect targets in the body must be trusted origins or safe relative paths.
fn check_origin(
    state: &AppState,
    headers: &HeaderMap,
    body: Option<&Value>,
    query: Option<&str>,
) -> Result<(), ApiError> {
    validate_origin(state, headers, false)?;
    let field = |name: &str| body.and_then(|b| b.get(name));
    let query_callback = query.and_then(|q| {
        url::form_urlencoded::parse(q.as_bytes())
            .find(|(key, _)| key == "callbackURL")
            .map(|(_, value)| Value::String(value.into_owned()))
    });
    let callback = field("callbackURL").cloned().or(query_callback);
    let targets = [
        (callback, "callbackURL", "INVALID_CALLBACK_URL"),
        (
            field("redirectTo").cloned(),
            "redirectURL",
            "INVALID_REDIRECT_URL",
        ),
        (
            field("errorCallbackURL").cloned(),
            "errorCallbackURL",
            "INVALID_ERROR_CALLBACK_URL",
        ),
        (
            field("newUserCallbackURL").cloned(),
            "newUserCallbackURL",
            "INVALID_NEW_USER_CALLBACK_URL",
        ),
    ];
    for (value, label, code) in targets {
        let Some(value) = value.filter(is_truthy) else {
            continue;
        };
        let Value::String(url) = value else {
            return Err(ApiError::message(
                StatusCode::BAD_REQUEST,
                format!("Invalid {label}: expected a string"),
            ));
        };
        if !is_trusted_target(state, &url) {
            return Err(ApiError::new(
                StatusCode::FORBIDDEN,
                code,
                format!("Invalid {label}"),
            ));
        }
    }
    Ok(())
}

fn is_truthy(value: &Value) -> bool {
    !matches!(value, Value::Null | Value::Bool(false)) && value != &json!("") && value != &json!(0)
}

/// `validateOrigin`: only requests with cookies (or `force`) are checked; the Origin or Referer must match a trusted origin.
pub fn validate_origin(state: &AppState, headers: &HeaderMap, force: bool) -> Result<(), ApiError> {
    if !force && !headers.contains_key(header::COOKIE) {
        return Ok(());
    }
    let header_value = |name: header::HeaderName| {
        headers
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned)
    };
    let origin = header_value(header::ORIGIN);
    let candidate = origin
        .clone()
        .or_else(|| header_value(header::REFERER))
        .unwrap_or_default();
    if candidate.is_empty() || candidate == "null" {
        return Err(codes::missing_or_null_origin());
    }
    let host = request_host(headers);
    let trusted = trusted_origins(state, origin.as_deref(), host.as_deref());
    if trusted
        .iter()
        .any(|pattern| matches_origin_pattern(&candidate, pattern, false))
    {
        Ok(())
    } else {
        Err(codes::invalid_origin())
    }
}

/// `formCsrfMiddleware` on sign-in and sign-up: blocks cross-site navigations, checks the origin when the browser says where it came from.
pub fn form_csrf(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
    if headers.contains_key(header::COOKIE) {
        return validate_origin(state, headers, false);
    }
    let value = |name: &str| {
        headers
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(str::trim)
            .unwrap_or_default()
    };
    let (site, mode, dest) = (
        value("sec-fetch-site"),
        value("sec-fetch-mode"),
        value("sec-fetch-dest"),
    );
    if !site.is_empty() || !mode.is_empty() || !dest.is_empty() {
        if site == "cross-site" && mode == "navigate" {
            return Err(codes::cross_site_navigation());
        }
        return validate_origin(state, headers, true);
    }
    if headers.contains_key(header::ORIGIN) || headers.contains_key(header::REFERER) {
        return validate_origin(state, headers, true);
    }
    Ok(())
}

/// The static and per-request trusted origins, plus `exp://` outside production (the Expo plugin's development default).
fn trusted_origins(state: &AppState, origin: Option<&str>, host: Option<&str>) -> Vec<String> {
    let mut trusted = state.origins.auth_trusted(origin, host);
    if !state.config.is_production {
        trusted.push("exp://".into());
    }
    trusted
}

/// `isTrustedOrigin(url, { allowRelativePaths: true })` against the static list.
pub fn is_trusted_target(state: &AppState, url: &str) -> bool {
    trusted_origins(state, None, None)
        .iter()
        .any(|pattern| matches_origin_pattern(url, pattern, true))
}

/// Better Auth's `matchesOriginPattern` for the patterns Solace configures (no wildcards).
pub fn matches_origin_pattern(url: &str, pattern: &str, allow_relative: bool) -> bool {
    if url.starts_with('/') {
        return allow_relative && is_safe_relative(url);
    }
    let parsed = url::Url::parse(url).ok();
    match parsed.as_ref().map(url::Url::scheme) {
        Some("http" | "https") | None => parsed.is_some_and(|parsed| origin_of(&parsed) == pattern),
        Some(_) => {
            let (Some(actual), Some(expected)) = (custom_scheme(url), custom_scheme(pattern))
            else {
                return false;
            };
            if actual.scheme != expected.scheme
                || (!expected.authority.is_empty() && actual.authority != expected.authority)
            {
                return false;
            }
            expected.path.is_empty()
                || actual.path == expected.path
                || actual.path.starts_with(&format!("{}/", expected.path))
        }
    }
}

fn origin_of(url: &url::Url) -> String {
    url.origin().ascii_serialization()
}

struct CustomScheme {
    scheme: String,
    authority: String,
    path: String,
}

/// Splits `scheme://authority/path` without URL parsing, like `parseCustomSchemeOrigin`.
fn custom_scheme(value: &str) -> Option<CustomScheme> {
    if value.chars().any(|c| c.is_control()) {
        return None;
    }
    let scheme_end = value.find(':').filter(|i| *i > 0)?;
    let scheme = value[..scheme_end].to_lowercase();
    let mut rest = &value[scheme_end + 1..];
    let mut authority = "";
    if let Some(after) = rest.strip_prefix("//") {
        match after.find(['/', '?', '#']) {
            Some(end) => {
                authority = &after[..end];
                rest = &after[end..];
            }
            None => {
                authority = after;
                rest = "";
            }
        }
    }
    let path = rest.split(['?', '#']).next().unwrap_or_default();
    let decoded = percent_encoding::percent_decode_str(path).decode_utf8_lossy();
    let mut segments: Vec<&str> = Vec::new();
    for segment in decoded.split('/') {
        match segment {
            ".." => {
                segments.pop();
            }
            "." | "" => {}
            other => segments.push(other),
        }
    }
    let path = if segments.is_empty() {
        String::new()
    } else {
        format!("/{}", segments.join("/"))
    };
    Some(CustomScheme {
        scheme,
        authority: authority.to_lowercase(),
        path,
    })
}

fn is_safe_relative(value: &str) -> bool {
    if value.starts_with("//") || value.contains('\\') || value.chars().any(|c| c.is_control()) {
        return false;
    }
    let path = value
        .split(['?', '#'])
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    if path.contains("%2f") || path.contains("%5c") {
        return false;
    }
    let base = "https://better-auth.invalid";
    url::Url::parse(base)
        .and_then(|origin| origin.join(value))
        .is_ok_and(|joined| origin_of(&joined) == base)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn origin_patterns_match_like_better_auth() {
        assert!(matches_origin_pattern(
            "http://localhost:4100/x",
            "http://localhost:4100",
            false
        ));
        assert!(!matches_origin_pattern(
            "https://evil.example",
            "http://localhost:4100",
            false
        ));
        assert!(matches_origin_pattern("solace://", "solace://", false));
        assert!(matches_origin_pattern(
            "solace-mail://api/auth",
            "solace-mail://api/auth",
            false
        ));
        assert!(matches_origin_pattern(
            "solace://api/auth/callback",
            "solace://api/auth",
            false
        ));
        assert!(!matches_origin_pattern("evil://", "solace://", false));
        assert!(matches_origin_pattern(
            "/reset-password?x=1",
            "http://localhost:4100",
            true
        ));
        assert!(!matches_origin_pattern(
            "//evil.example/x",
            "http://localhost:4100",
            true
        ));
        assert!(!matches_origin_pattern(
            "/a%2f..%2fb",
            "http://localhost:4100",
            true
        ));
        assert!(!matches_origin_pattern(
            "/reset",
            "http://localhost:4100",
            false
        ));
    }
}
