//! Security headers and CORS on every response, matching `security-headers.ts` and `@elysia/cors` as configured in `main.ts`.

use axum::extract::{Request, State};
use axum::http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode, header};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use crate::error::AppError;
use crate::state::AppState;

const JSON_API_CSP: &str = "default-src 'none'; frame-ancestors 'none'";
/// Better Auth's `/error` page is the only HTML the API serves, and it uses an inline `<style>`.
const AUTH_ERROR_PAGE_CSP: &str =
    "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'";
const AUTH_ERROR_PAGE_PATH: &str = "/api/auth/error";
/// Loaded as a no-cors `<img>`, which `same-site` would block on preview domains.
const AVATAR_PATH: &str = "/profiles/avatar";
const PERMISSIONS_POLICY: &str = "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()";
const HSTS: &str = "max-age=63072000; includeSubDomains; preload";
const ALLOW_METHODS: &str = "GET, POST, PUT, DELETE, PATCH, OPTIONS";
const ALLOW_HEADERS: &str = "Content-Type, Authorization, Cookie, X-Requested-With, Accept, Origin";
const EXPOSE_HEADERS: &str = "Set-Cookie, Server-Timing";
/// A short preflight cache re-sent OPTIONS on nearly every JMAP call; a day covers a mail session.
const PREFLIGHT_MAX_AGE: &str = "86400";

pub async fn security_headers(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    let path = request.uri().path().to_owned();
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    let csp = if path == AUTH_ERROR_PAGE_PATH {
        AUTH_ERROR_PAGE_CSP
    } else {
        JSON_API_CSP
    };
    let corp = if path.contains(AVATAR_PATH) {
        "cross-origin"
    } else {
        "same-site"
    };
    set(headers, header::X_CONTENT_TYPE_OPTIONS, "nosniff");
    set(headers, header::X_FRAME_OPTIONS, "DENY");
    set(headers, header::REFERRER_POLICY, "no-referrer");
    set(headers, header::CONTENT_SECURITY_POLICY, csp);
    set(
        headers,
        HeaderName::from_static("cross-origin-resource-policy"),
        corp,
    );
    set(
        headers,
        HeaderName::from_static("permissions-policy"),
        PERMISSIONS_POLICY,
    );
    if state.config.is_production {
        set(headers, header::STRICT_TRANSPORT_SECURITY, HSTS);
    }
    response
}

/// Every OPTIONS request is answered here with 204; only trusted origins get `Access-Control-Allow-Origin`.
pub async fn cors(State(state): State<AppState>, request: Request, next: Next) -> Response {
    let origin = request
        .headers()
        .get(header::ORIGIN)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned);
    let host = request_host(request.headers());
    let allowed = origin
        .as_deref()
        .filter(|origin| state.origins.is_allowed(origin, host.as_deref()));
    let allowed = allowed.and_then(|origin| HeaderValue::from_str(origin).ok());
    // Browsers name the page on every cross-site write, form posts and no-cors fetches included; native apps and servers send no Origin. Better Auth's routes check their own.
    let writes = !matches!(
        *request.method(),
        Method::GET | Method::HEAD | Method::OPTIONS
    );
    if writes
        && origin.is_some()
        && allowed.is_none()
        && !request.uri().path().starts_with("/api/auth/")
    {
        return AppError::Forbidden("Invalid origin".into()).into_response();
    }
    let is_options = request.method() == Method::OPTIONS;
    let is_preflight = is_options
        && request
            .headers()
            .contains_key(header::ACCESS_CONTROL_REQUEST_METHOD);
    let mut response = if is_options {
        StatusCode::NO_CONTENT.into_response()
    } else {
        next.run(request).await
    };
    let headers = response.headers_mut();
    set(
        headers,
        header::ACCESS_CONTROL_EXPOSE_HEADERS,
        EXPOSE_HEADERS,
    );
    set(headers, header::ACCESS_CONTROL_ALLOW_HEADERS, ALLOW_HEADERS);
    set(headers, header::ACCESS_CONTROL_ALLOW_CREDENTIALS, "true");
    set(headers, header::VARY, "Origin");
    if let Some(origin) = allowed {
        headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin);
    }
    if !is_options || is_preflight {
        set(headers, header::ACCESS_CONTROL_ALLOW_METHODS, ALLOW_METHODS);
    }
    if is_options {
        set(headers, header::ACCESS_CONTROL_MAX_AGE, PREFLIGHT_MAX_AGE);
    }
    response
}

/// The hostname the client addressed, for the development same-host rule.
pub fn request_host(headers: &HeaderMap) -> Option<String> {
    let host = headers.get(header::HOST)?.to_str().ok()?;
    let url = url::Url::parse(&format!("http://{host}")).ok()?;
    url.host_str().map(str::to_owned)
}

fn set(headers: &mut HeaderMap, name: HeaderName, value: &'static str) {
    headers.insert(name, HeaderValue::from_static(value));
}
