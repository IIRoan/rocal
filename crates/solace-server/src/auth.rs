//! Authentication on the existing Better Auth tables and cookies: sessions, the guard, and the `/api/auth` endpoints.

pub mod api;
pub mod cookies;
mod email_password;
mod error_page;
pub mod guard;
mod hooks;
mod one_time_token;
mod passkeys;
pub mod password;
mod passwords;
pub mod pipeline;
mod rate_limit;
pub mod session;
mod sessions;
mod store;

use axum::Json;
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use solace_api_types::auth::{AuthUser, MeResponse, SessionWithUser};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::error::AppError;
use crate::state::AppState;
use guard::MaybeSession;

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(me))
        .routes(routes!(user))
        .routes(routes!(get_session))
        .route("/api/auth/error", get(error_page::error_page))
        .route("/api/auth/sign-up/email", post(email_password::sign_up))
        .route("/api/auth/sign-in/email", post(email_password::sign_in))
        .route("/api/auth/sign-out", post(sessions::sign_out))
        .route("/api/auth/list-sessions", get(sessions::list_sessions))
        .route("/api/auth/revoke-session", post(sessions::revoke_session))
        .route("/api/auth/revoke-sessions", post(sessions::revoke_sessions))
        .route(
            "/api/auth/revoke-other-sessions",
            post(sessions::revoke_other_sessions),
        )
        .route(
            "/api/auth/change-password",
            post(passwords::change_password),
        )
        .route(
            "/api/auth/request-password-reset",
            post(passwords::request_password_reset),
        )
        .route(
            "/api/auth/reset-password/{token}",
            get(passwords::reset_password_callback),
        )
        .route("/api/auth/reset-password", post(passwords::reset_password))
        .route(
            "/api/auth/verify-password",
            post(passwords::verify_password),
        )
        .route("/api/auth/update-user", post(passwords::update_user))
        .route("/api/auth/delete-user", post(passwords::delete_user))
        .route(
            "/api/auth/passkey/generate-register-options",
            get(passkeys::registration_options),
        )
        .route(
            "/api/auth/passkey/generate-authenticate-options",
            get(passkeys::authentication_options),
        )
        .route(
            "/api/auth/passkey/verify-registration",
            post(passkeys::verify_registration),
        )
        .route(
            "/api/auth/passkey/verify-authentication",
            post(passkeys::verify_authentication),
        )
        .route("/api/auth/passkey/list-user-passkeys", get(passkeys::list))
        .route("/api/auth/passkey/delete-passkey", post(passkeys::delete))
        .route("/api/auth/passkey/update-passkey", post(passkeys::update))
        .route(
            "/api/auth/passkey-bridge/freshen-session",
            post(passkeys::freshen_session),
        )
        .route(
            "/api/auth/passkey-bridge/complete-step-up",
            post(passkeys::complete_step_up),
        )
        .route(
            "/api/auth/one-time-token/generate",
            get(one_time_token::generate),
        )
        .route(
            "/api/auth/one-time-token/verify",
            post(one_time_token::verify),
        )
}

/// The session and user behind the cookie, or null; renews sessions older than a day.
#[utoipa::path(get, path = "/api/auth/get-session", operation_id = "getSession", tag = "Auth", responses((status = 200, body = Option<SessionWithUser>)))]
#[tracing::instrument(skip_all)]
pub async fn get_session(MaybeSession(active): MaybeSession) -> Result<Response, AppError> {
    let body = active?.as_ref().map(session::session_dto);
    Ok(no_store(Json(body).into_response()))
}

/// The session user, or `{ user: null }` without a session.
#[utoipa::path(get, path = "/api/me", operation_id = "getMe", tag = "Auth", responses((status = 200, body = MeResponse)))]
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
    operation_id = "getUser",
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
