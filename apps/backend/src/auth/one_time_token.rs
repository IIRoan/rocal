//! Better Auth's one-time-token plugin (`expiresIn: 3` minutes, `storeToken: "hashed"`): hands a session to the native apps once.

use std::sync::LazyLock;

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use solace_api_types::auth::OneTimeToken;

use super::api::{ApiError, URL_SAFE, json, random_string, validate};
use super::hooks;
use super::pipeline::AuthBody;
use super::session::{self, ActiveSession};
use super::sessions::require_session;
use super::store;
use crate::http::zod::{self, Schema};
use crate::instant;
use crate::state::AppState;

const LIFETIME_SECONDS: i64 = 3 * 60;

static VERIFY: LazyLock<Schema> = LazyLock::new(|| zod::object([("token", zod::string())]));

#[derive(Deserialize)]
struct VerifyBody {
    token: String,
}

/// Only the SHA-256 of the token is stored, so a leaked verification row cannot be replayed.
fn identifier(token: &str) -> String {
    format!(
        "one-time-token:{}",
        URL_SAFE_NO_PAD.encode(Sha256::digest(token.as_bytes()))
    )
}

fn bad_request(message: &str) -> ApiError {
    ApiError::message(StatusCode::BAD_REQUEST, message)
}

pub async fn generate(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let mut cookies = Vec::new();
    let outcome = async {
        let active = require_session(&state, &headers, &mut cookies).await?;
        let token = random_string(32, URL_SAFE);
        store::create_verification(
            &state.db,
            &identifier(&token),
            active.session.token,
            LIFETIME_SECONDS,
        )
        .await?;
        Ok(json(&OneTimeToken { token }))
    }
    .await;
    hooks::with_cookies(outcome, cookies)
}

pub async fn verify(
    State(state): State<AppState>,
    headers: HeaderMap,
    AuthBody(body): AuthBody,
) -> Response {
    let mut cookies = Vec::new();
    let outcome = async {
        let body: VerifyBody = validate(&VERIFY, body.as_ref(), "body")?;
        let row = store::consume_verification(&state.db, &identifier(&body.token))
            .await?
            .ok_or_else(|| bad_request("Invalid token"))?;
        let found = store::find_session_with_user(&state.db, &row.value).await?;
        let Some((session, Some(user))) = found else {
            return Err(bad_request("Session not found"));
        };
        // Better Auth sets the cookie before it checks the expiry, and the error reply keeps it.
        cookies.extend(hooks::session_cookies(
            &state,
            &session.token,
            hooks::dont_remember(&state, &headers),
        ));
        if session.expires_at < instant::now() {
            return Err(bad_request("Session expired"));
        }
        Ok(json(&session::session_dto(&ActiveSession {
            session,
            user,
        })))
    }
    .await;
    hooks::with_cookies(outcome, cookies)
}
