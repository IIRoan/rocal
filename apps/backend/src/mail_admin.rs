//! Authorizes the Stalwart UI's outer gate without granting a Stalwart credential.

use axum::extract::{Request, State};
use axum::http::{StatusCode, header};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use utoipa_axum::{router::OpenApiRouter, routes};

use crate::auth::guard::RouteUser;
use crate::error::AppError;
use crate::http::rate_limit::{self, Limit};
use crate::state::AppState;

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().routes(routes!(authorize))
}

pub async fn guard(State(state): State<AppState>, request: Request, next: Next) -> Response {
    if request.uri().path() != "/api/internal/stalwart/admin-access" {
        return next.run(request).await;
    }
    let mut response = match gateway_access(&state, request.headers()) {
        Ok(()) => next.run(request).await,
        Err(error) => error.into_response(),
    };
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        axum::http::HeaderValue::from_static("no-store"),
    );
    response
}

fn gateway_access(state: &AppState, headers: &axum::http::HeaderMap) -> Result<(), AppError> {
    let denied = || AppError::NotFound("Not Found".into());
    let expected = state
        .config
        .stalwart_admin_gate_key
        .as_deref()
        .filter(|key| key.len() >= 32)
        .ok_or_else(denied)?;
    let mut provided = headers.get_all("x-solace-admin-gate").iter();
    let actual = provided.next().ok_or_else(denied)?;
    if provided.next().is_some()
        || !bool::from(
            Sha256::digest(expected.as_bytes()).ct_eq(&Sha256::digest(actual.as_bytes())),
        )
    {
        return Err(denied());
    }
    let ip = headers
        .get("x-real-ip")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<std::net::IpAddr>().ok())
        .ok_or_else(denied)?;
    rate_limit::enforce(
        "stalwart-admin-access",
        &ip.to_string(),
        Limit::per_minute(240),
    )
}

#[utoipa::path(
    get,
    path = "/api/internal/stalwart/admin-access",
    operation_id = "authorizeStalwartAdminAccess",
    tag = "Mail",
    responses(
        (status = 204),
        (status = 401, body = solace_api_types::ErrorResponse),
        (status = 403, body = solace_api_types::ErrorResponse),
        (status = 404, body = solace_api_types::ErrorResponse),
        (status = 429, body = solace_api_types::ErrorResponse)
    )
)]
#[tracing::instrument(skip_all)]
async fn authorize(user: RouteUser, State(state): State<AppState>) -> Response {
    if state.config.stalwart_admin_user_ids.contains(&user.id) {
        StatusCode::NO_CONTENT.into_response()
    } else {
        AppError::NotFound("Not Found".into()).into_response()
    }
}
