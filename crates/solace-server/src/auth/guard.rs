//! `requireAuth`: the session user, or a 401, or a 403 when the account has a passkey that this session has not used.

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use sea_orm::{ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter};

use super::cookies;
use super::session::{self, ActiveSession};
use crate::db::entities::passkey;
use crate::error::AppError;
use crate::http::response_cookies::ResponseCookies;
use crate::instant;
use crate::state::AppState;

/// The authenticated caller; the owner id of every query comes from here, never from the client.
#[derive(Debug, Clone)]
pub struct RouteUser {
    pub id: String,
    pub email: String,
    pub name: String,
}

/// Handlers take it before their validated input, so the guard answers before validation does.
impl FromRequestParts<AppState> for RouteUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let active = resolve(parts, state)
            .await
            .ok_or(AppError::Unauthenticated)?;
        step_up(state, &parts.headers, &active).await?;
        Ok(Self {
            id: active.user.id,
            email: active.user.email,
            name: active.user.name,
        })
    }
}

/// The session for routes that answer anonymous callers too (`getRequestAuthSession`); a failed lookup stays an error.
pub struct MaybeSession(pub Result<Option<ActiveSession>, AppError>);

impl FromRequestParts<AppState> for MaybeSession {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        Ok(Self(lookup(parts, state).await))
    }
}

/// Looks the session up and forwards its Set-Cookie values; a failed lookup forwards nothing.
async fn lookup(parts: &mut Parts, state: &AppState) -> Result<Option<ActiveSession>, AppError> {
    optional_session(
        state,
        &parts.headers,
        parts.extensions.get::<ResponseCookies>(),
    )
    .await
}

/// `getRequestAuthSession` for a handler that needs the session only on some paths.
pub async fn optional_session(
    state: &AppState,
    headers: &axum::http::HeaderMap,
    response_cookies: Option<&ResponseCookies>,
) -> Result<Option<ActiveSession>, AppError> {
    let lookup = session::lookup(state, headers).await?;
    if let Some(response_cookies) = response_cookies {
        response_cookies.extend(lookup.cookies);
    }
    Ok(lookup.session)
}

/// The guard treats a failed lookup as no session, as `resolveAuthenticatedSession` does.
async fn resolve(parts: &mut Parts, state: &AppState) -> Option<ActiveSession> {
    lookup(parts, state).await.unwrap_or_else(|error| {
        tracing::debug!(error = %crate::telemetry::redact_pii(&error.to_string()), "Session resolution failed");
        None
    })
}

/// The guard's 403 for a session of an account with a passkey that has not used one.
pub async fn step_up(
    state: &AppState,
    headers: &axum::http::HeaderMap,
    active: &ActiveSession,
) -> Result<(), AppError> {
    if step_up_verified(state, headers, active) || !has_passkeys(state, &active.user.id).await? {
        Ok(())
    } else {
        Err(AppError::StepUpRequired)
    }
}

/// A genuine, unexpired step-up cookie bound to this user and session.
pub fn step_up_verified(
    state: &AppState,
    headers: &axum::http::HeaderMap,
    active: &ActiveSession,
) -> bool {
    let request_cookies = cookies::parse_cookies(headers);
    cookies::cookie(&request_cookies, state.cookies.step_up_name())
        .and_then(|raw| {
            state.cookies.verified_step_up(
                raw,
                &active.user.id,
                &active.session.id,
                instant::unix_seconds(instant::now()),
            )
        })
        .is_some()
}

pub async fn has_passkeys(state: &AppState, user_id: &str) -> Result<bool, AppError> {
    let count = passkey::Entity::find()
        .filter(passkey::Column::UserId.eq(user_id))
        .count(&state.db)
        .await?;
    Ok(count > 0)
}
