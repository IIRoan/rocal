//! Authorizes the Stalwart UI's outer gate without granting a Stalwart credential.

use axum::extract::{Request, State};
use axum::http::{StatusCode, header};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use utoipa_axum::{router::OpenApiRouter, routes};

use crate::auth::guard::RouteUser;
use crate::error::AppError;
use crate::state::AppState;

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(authorize))
        .layer(middleware::from_fn(no_store))
}

async fn no_store(request: Request, next: Next) -> Response {
    let mut response = next.run(request).await;
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        axum::http::HeaderValue::from_static("no-store"),
    );
    response
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
        (status = 404, body = solace_api_types::ErrorResponse)
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
