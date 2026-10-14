//! `requireAuth`: the session user, or a 401, or a 403 when the account has a passkey that this session has not used.

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use sea_orm::{ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter};

use super::cookies::{self, STEP_UP_COOKIE};
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
    pub session_id: String,
    pub email: String,
}

/// Resolved before validation runs but required after it, because Elysia validated the request before the guard answered.
pub struct Auth(Result<RouteUser, AppError>);

impl Auth {
    pub fn require(self) -> Result<RouteUser, AppError> {
        self.0
    }
}

impl FromRequestParts<AppState> for Auth {
    type Rejection = std::convert::Infallible;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let Some(active) = resolve(parts, state).await else {
            return Ok(Self(Err(AppError::Unauthenticated)));
        };
        Ok(Self(step_up(parts, state, &active).await.map(|()| {
            RouteUser {
                id: active.user.id.clone(),
                session_id: active.session.id.clone(),
                email: active.user.email.clone(),
            }
        })))
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
    let response_cookies = parts
        .extensions
        .get::<ResponseCookies>()
        .cloned()
        .unwrap_or_default();
    let lookup = session::lookup(state, &parts.headers).await?;
    response_cookies.extend(lookup.cookies);
    Ok(lookup.session)
}

/// The guard treats a failed lookup as no session, as `resolveAuthenticatedSession` does.
async fn resolve(parts: &mut Parts, state: &AppState) -> Option<ActiveSession> {
    lookup(parts, state).await.unwrap_or_else(|error| {
        tracing::debug!(error = %crate::telemetry::redact_pii(&error.to_string()), "Session resolution failed");
        None
    })
}

async fn step_up(parts: &Parts, state: &AppState, active: &ActiveSession) -> Result<(), AppError> {
    let request_cookies = cookies::parse_cookies(&parts.headers);
    let verified = cookies::cookie(&request_cookies, STEP_UP_COOKIE)
        .and_then(|raw| {
            state.cookies.verified_step_up(
                raw,
                &active.user.id,
                &active.session.id,
                instant::unix_seconds(instant::now()),
            )
        })
        .is_some();
    if verified {
        return Ok(());
    }
    let passkeys = passkey::Entity::find()
        .filter(passkey::Column::UserId.eq(active.user.id.as_str()))
        .count(&state.db)
        .await?;
    if passkeys > 0 {
        Err(AppError::StepUpRequired)
    } else {
        Ok(())
    }
}
