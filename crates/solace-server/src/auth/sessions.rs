//! Sign-out and session management: `sign-out`, `list-sessions`, `revoke-session`, `revoke-sessions`, `revoke-other-sessions`.

use std::sync::LazyLock;

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use serde::Deserialize;
use serde_json::{Value, json};
use solace_api_types::auth::{AuthSession, StatusFlag};

use super::api::{ApiError, json, validate};
use super::hooks::{self, Reply};
use super::pipeline::AuthBody;
use super::session::{self, ActiveSession};
use super::{cookies, store};
use crate::http::zod::{self, Schema};
use crate::instant;
use crate::state::AppState;

/// Better Auth's `freshAge`: listing sessions needs a session younger than a day.
const FRESH_AGE_SECONDS: i64 = 24 * 60 * 60;

static SIGN_OUT: LazyLock<Schema> = LazyLock::new(|| {
    zod::object([
        ("callbackURL", zod::string().optional()),
        ("disableRedirect", zod::boolean().optional()),
        ("state", zod::string().optional()),
    ])
    .optional()
});

#[derive(Deserialize)]
struct TokenBody {
    token: String,
}

static TOKEN: LazyLock<Schema> = LazyLock::new(|| zod::object([("token", zod::string())]));

pub async fn sign_out(
    State(state): State<AppState>,
    headers: HeaderMap,
    AuthBody(body): AuthBody,
) -> Response {
    let outcome: Result<Reply, ApiError> = async {
        validate::<Value>(&SIGN_OUT, body.as_ref(), "body")?;
        let request_cookies = cookies::parse_cookies(&headers);
        let token = cookies::cookie(&request_cookies, &state.cookies.session_token())
            .and_then(|signed| state.cookies.verify_signed(signed));
        if let Some(token) = token
            && store::delete_session(&state.db, &token).await.is_err()
        {
            tracing::error!("Failed to delete session from database");
        }
        let cookies = hooks::expired_session_cookies(&state, &headers);
        Ok(Reply::new(json(&json!({"success": true})), cookies))
    }
    .await;
    hooks::after_sign_in_or_out(&state, &headers, hooks::with_cookies(outcome, Vec::new()))
}

/// Better Auth's `sessionMiddleware`: the stored session, or 401 `UNAUTHORIZED`; renewal cookies go out with any reply.
pub(super) async fn require_session(
    state: &AppState,
    headers: &HeaderMap,
    cookies: &mut Vec<String>,
) -> Result<ActiveSession, ApiError> {
    let lookup = session::lookup_without_step_up(state, headers).await?;
    cookies.extend(lookup.cookies);
    lookup.session.ok_or_else(ApiError::unauthorized)
}

/// `freshSessionMiddleware`: a session created within the last day, else 403 `SESSION_NOT_FRESH`.
pub(super) async fn require_fresh_session(
    state: &AppState,
    headers: &HeaderMap,
    cookies: &mut Vec<String>,
) -> Result<ActiveSession, ApiError> {
    let active = require_session(state, headers, cookies).await?;
    if instant::now() - active.session.created_at >= instant::seconds(FRESH_AGE_SECONDS) {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "SESSION_NOT_FRESH",
            "Session is not fresh",
        ));
    }
    Ok(active)
}

pub async fn list_sessions(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let mut cookies = Vec::new();
    let outcome = async {
        let active = require_fresh_session(&state, &headers, &mut cookies).await?;
        let sessions: Vec<AuthSession> = store::active_sessions(&state.db, &active.user.id)
            .await?
            .into_iter()
            .map(|session| session_dto(&session))
            .collect();
        Ok(json(&sessions))
    }
    .await;
    hooks::with_cookies(outcome, cookies)
}

pub async fn revoke_session(
    State(state): State<AppState>,
    headers: HeaderMap,
    AuthBody(body): AuthBody,
) -> Response {
    let mut cookies = Vec::new();
    let outcome = async {
        let body: TokenBody = validate(&TOKEN, body.as_ref(), "body")?;
        let active = require_session(&state, &headers, &mut cookies).await?;
        // Another user's token is answered with success and left alone.
        if store::find_session(&state.db, &body.token)
            .await?
            .is_some_and(|s| s.user_id == active.user.id)
        {
            store::delete_session(&state.db, &body.token).await?;
        }
        Ok(json(&StatusFlag { status: true }))
    }
    .await;
    hooks::with_cookies(outcome, cookies)
}

pub async fn revoke_sessions(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let mut cookies = Vec::new();
    let outcome = async {
        let active = require_session(&state, &headers, &mut cookies).await?;
        store::delete_user_sessions(&state.db, &active.user.id).await?;
        Ok(json(&StatusFlag { status: true }))
    }
    .await;
    hooks::with_cookies(outcome, cookies)
}

pub async fn revoke_other_sessions(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let mut cookies = Vec::new();
    let outcome = async {
        let active = require_session(&state, &headers, &mut cookies).await?;
        for other in store::active_sessions(&state.db, &active.user.id).await? {
            if other.token != active.session.token {
                store::delete_session(&state.db, &other.token).await?;
            }
        }
        Ok(json(&StatusFlag { status: true }))
    }
    .await;
    hooks::with_cookies(outcome, cookies)
}

fn session_dto(session: &crate::db::entities::session::Model) -> AuthSession {
    AuthSession {
        id: session.id.clone().into(),
        token: session.token.clone(),
        user_id: session.user_id.clone().into(),
        expires_at: instant::iso(session.expires_at),
        created_at: instant::iso(session.created_at),
        updated_at: instant::iso(session.updated_at),
        ip_address: None,
        user_agent: None,
    }
}
