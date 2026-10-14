//! Authentication on the existing Better Auth tables and cookies: sessions, the guard, and the `/api/auth` endpoints.

pub mod cookies;
mod error_page;
pub mod guard;
pub mod session;

use axum::Json;
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use solace_api_types::auth::{AuthUser, MeResponse, SessionWithUser};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::error::AppError;
use crate::state::AppState;
use guard::MaybeSession;

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(get_session))
        .routes(routes!(me))
        .routes(routes!(user))
        .route("/api/auth/error", get(error_page::error_page))
}

/// The session and user behind the cookie, or null; renews sessions older than a day.
#[utoipa::path(get, path = "/api/auth/get-session", tag = "Auth", responses((status = 200, body = Option<SessionWithUser>)))]
#[tracing::instrument(skip_all)]
pub async fn get_session(MaybeSession(active): MaybeSession) -> Result<Response, AppError> {
    let body = active?.as_ref().map(session::session_dto);
    Ok(no_store(Json(body).into_response()))
}

/// The session user, or `{ user: null }` without a session.
#[utoipa::path(get, path = "/api/me", tag = "Auth", responses((status = 200, body = MeResponse)))]
#[tracing::instrument(skip_all)]
pub async fn me(MaybeSession(active): MaybeSession) -> Json<MeResponse> {
    Json(MeResponse {
        user: active
            .ok()
            .flatten()
            .map(|active| session::user_dto(&active.user)),
    })
}

/// The session user; 401 without a session.
#[utoipa::path(
    get,
    path = "/api/user",
    tag = "Auth",
    responses((status = 200, body = AuthUser), (status = 401, body = solace_api_types::ErrorResponse))
)]
#[tracing::instrument(skip_all)]
pub async fn user(MaybeSession(active): MaybeSession) -> Result<Json<AuthUser>, AppError> {
    let active = active?.ok_or(AppError::Unauthenticated)?;
    Ok(Json(session::user_dto(&active.user)))
}

/// Better Auth's router answers paths it does not know with an empty 404.
pub fn unknown_auth_path() -> Response {
    StatusCode::NOT_FOUND.into_response()
}

fn no_store(mut response: Response) -> Response {
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}
