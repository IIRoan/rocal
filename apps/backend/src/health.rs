//! Health and root routes: liveness, mail server reachability, the connectivity test and the root redirect.

use axum::Json;
use axum::extract::{RawQuery, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use solace_api_types::health::{ConnectionTest, HealthStatus, MailHealthFailure};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::http::client_ip::client_ip;
use crate::http::rate_limit::{self, Limit};
use crate::instant;
use crate::integrations::stalwart::reachability;
use crate::mail::maintenance::monitor;
use crate::state::AppState;

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(health))
        .routes(routes!(mail_jmap))
        .routes(routes!(mail_policy))
        .routes(routes!(mail_key_expiry))
        .routes(routes!(connection_test))
}

/// Liveness probe for uptime checks and deploys.
#[utoipa::path(get, path = "/api/health", operation_id = "getHealth", tag = "Health", responses((status = 200, body = HealthStatus)))]
#[tracing::instrument(skip_all)]
pub async fn health() -> Json<HealthStatus> {
    Json(HealthStatus {
        status: "ok".into(),
    })
}

/// One unauthenticated request to Stalwart's JMAP discovery; 503 when the API cannot reach the mail server.
#[utoipa::path(
    get,
    path = "/api/health/mail-jmap",
    operation_id = "getMailJmapHealth",
    tag = "Health",
    responses((status = 200, body = HealthStatus), (status = 503, body = MailHealthFailure))
)]
#[tracing::instrument(skip_all)]
pub async fn mail_jmap(State(state): State<AppState>) -> Response {
    match reachability::probe(
        &state.http_no_redirect,
        &state.config.stalwart_base_url,
        &state.stalwart_gate,
    )
    .await
    {
        Ok(()) => Json(HealthStatus {
            status: "ok".into(),
        })
        .into_response(),
        Err(upstream_status) => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(MailHealthFailure {
                status: "error".into(),
                upstream_status,
            }),
        )
            .into_response(),
    }
}

/// Fresh complete metadata cycles without encryption-policy drift; never gates mail delivery.
#[utoipa::path(get, path = "/api/health/mail-policy", operation_id = "getMailPolicyHealth", tag = "Health", responses((status = 200, body = HealthStatus), (status = 503, body = HealthStatus), (status = 429, body = HealthStatus)))]
#[tracing::instrument(skip_all)]
pub async fn mail_policy(State(state): State<AppState>, headers: HeaderMap) -> Response {
    metadata_health(&state, &headers, false).await
}

/// Fresh complete user-directory cycles without keys expired or expiring within fourteen days.
#[utoipa::path(get, path = "/api/health/mail-key-expiry", operation_id = "getMailKeyExpiryHealth", tag = "Health", responses((status = 200, body = HealthStatus), (status = 503, body = HealthStatus), (status = 429, body = HealthStatus)))]
#[tracing::instrument(skip_all)]
pub async fn mail_key_expiry(State(state): State<AppState>, headers: HeaderMap) -> Response {
    metadata_health(&state, &headers, true).await
}

async fn metadata_health(state: &AppState, headers: &HeaderMap, expiry: bool) -> Response {
    let store = if expiry {
        "mail-key-expiry-health"
    } else {
        "mail-policy-health"
    };
    let status = if rate_limit::enforce(store, &client_ip(headers), Limit::per_minute(30)).is_err()
    {
        StatusCode::TOO_MANY_REQUESTS
    } else {
        match monitor::health(state).await {
            Ok(health) if if expiry { health.expiry } else { health.policy } => StatusCode::OK,
            _ => StatusCode::SERVICE_UNAVAILABLE,
        }
    };
    let mut response = (
        status,
        Json(HealthStatus {
            status: if status.is_success() { "ok" } else { "error" }.into(),
        }),
    )
        .into_response();
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

/// Confirms request routing and shows the server time.
#[utoipa::path(get, path = "/api/test", operation_id = "testConnection", tag = "Health", responses((status = 200, body = ConnectionTest)))]
#[tracing::instrument(skip_all)]
pub async fn connection_test() -> Json<ConnectionTest> {
    Json(ConnectionTest {
        message: "Backend connection working".into(),
        timestamp: instant::iso(instant::now()),
    })
}

/// Better Auth sends OAuth errors to the API root, which forwards them to the app's login page as given.
pub async fn root_redirect(State(state): State<AppState>, RawQuery(query): RawQuery) -> Response {
    let error = url::form_urlencoded::parse(query.unwrap_or_default().as_bytes())
        .find(|(key, _)| key == "error")
        .map(|(_, value)| value.into_owned())
        .filter(|value| !value.is_empty());
    let frontend = &state.config.frontend_url;
    let location = match error {
        Some(error) => format!("{frontend}/login?error={error}"),
        None => frontend.clone(),
    };
    let mut response = StatusCode::FOUND.into_response();
    if let Ok(value) = HeaderValue::from_str(&location) {
        response.headers_mut().insert(header::LOCATION, value);
    }
    response
}
