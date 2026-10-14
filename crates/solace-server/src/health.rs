//! Health and root routes: liveness, mail server reachability, the connectivity test and the root redirect.

use axum::Json;
use axum::extract::{RawQuery, State};
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use solace_api_types::health::{ConnectionTest, HealthStatus, MailHealthFailure};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::instant;
use crate::integrations::stalwart::reachability;
use crate::state::AppState;

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(health))
        .routes(routes!(mail_jmap))
        .routes(routes!(connection_test))
}

/// Liveness probe for uptime checks and deploys.
#[utoipa::path(get, path = "/api/health", tag = "Health", responses((status = 200, body = HealthStatus)))]
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

/// Confirms request routing and shows the server time.
#[utoipa::path(get, path = "/api/test", tag = "Health", responses((status = 200, body = ConnectionTest)))]
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
