//! Passwords and the profile through Better Auth: change, verify, `update-user`, and the disabled `delete-user`; support handles forgotten passwords.

use std::sync::LazyLock;

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use sea_orm::TransactionTrait;
use serde::Deserialize;
use serde_json::{Value, json};
use solace_api_types::auth::{AuthUser, StatusFlag};
use solace_api_types::e2ee::PasswordEnvelopeRequest;

use super::api::{ApiError, codes, json, validate};
use super::email_password::{check_auth_key_email, check_new_password};
use super::hooks::{self, Reply};
use super::password::{self, Verdict};
use super::pipeline::AuthBody;
use super::session;
use super::sessions::require_session;
use super::store;
use crate::db::entities::user;
use crate::e2ee;
use crate::email;
use crate::http::extract::RequestSchema;
use crate::http::zod::{self, Schema};
use crate::state::AppState;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChangePasswordBody {
    new_password: String,
    current_password: String,
    revoke_other_sessions: Option<bool>,
    email: Option<String>,
    password_envelope: Option<PasswordEnvelopeRequest>,
}

static CHANGE_PASSWORD: LazyLock<Schema> = LazyLock::new(|| {
    zod::object([
        ("newPassword", zod::string()),
        ("currentPassword", zod::string()),
        ("revokeOtherSessions", zod::boolean().optional()),
        ("email", zod::string().optional()),
        (
            "passwordEnvelope",
            PasswordEnvelopeRequest::schema().clone().optional(),
        ),
    ])
});

#[derive(Deserialize)]
struct PasswordBody {
    password: String,
}

static VERIFY: LazyLock<Schema> = LazyLock::new(|| zod::object([("password", zod::string())]));

/// The sign-in page the "password updated" mail links to.
fn sign_in_url(state: &AppState) -> String {
    format!("{}/login", state.config.frontend_url.trim_end_matches('/'))
}

fn greeting(user: &user::Model) -> String {
    let name = user.name.trim();
    if name.is_empty() {
        "there".into()
    } else {
        name.to_owned()
    }
}

/// The current password must match; a legacy hash can only be checked once the client resends it raw.
fn require_match(verdict: Verdict) -> Result<(), ApiError> {
    match verdict {
        Verdict::Match { .. } => Ok(()),
        Verdict::Mismatch => Err(codes::invalid_password()),
        Verdict::UpgradeRequired => Err(codes::password_upgrade_required()),
    }
}

async fn notify_password_updated(state: &AppState, user: &user::Model) {
    let message = email::password_updated(&greeting(user), &sign_in_url(state));
    let _ = email::send(
        state,
        "password update notification",
        &user.email,
        &message,
        email::Mode::BestEffort,
    )
    .await;
}

pub async fn change_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    AuthBody(body): AuthBody,
) -> Response {
    let mut cookies = Vec::new();
    let outcome = async {
        let body: ChangePasswordBody = validate(&CHANGE_PASSWORD, body.as_ref(), "body")?;
        let active = require_session(&state, &headers, &mut cookies).await?;
        check_new_password(&body.new_password)?;
        check_auth_key_email(
            &body.new_password,
            body.email.as_deref(),
            &active.user.email,
        )?;
        if crate::http::zod::js_length(&body.current_password) > password::MAX_LENGTH {
            return Err(codes::password_too_long());
        }
        // The envelope is wrapped with the new password; storing them together keeps every sign-in able to open it.
        let envelope = body
            .password_envelope
            .map(e2ee::service::password_keys)
            .transpose()
            .map_err(|_| {
                ApiError::message(StatusCode::BAD_REQUEST, "Invalid encryption envelope")
            })?;
        let credential = store::credential_account(&state.db, &active.user.id).await?;
        let Some((credential, stored)) =
            credential.and_then(|a| a.password.clone().map(|p| (a, p)))
        else {
            return Err(codes::credential_account_not_found());
        };
        let new_hash = password::hash(&body.new_password, &active.user.email)
            .await
            .map_err(|_| ApiError::internal())?;
        require_match(
            password::verify(&stored, &body.current_password, &active.user.email)
                .await
                .map_err(|_| ApiError::internal())?,
        )?;
        let transaction = state.db.begin().await?;
        store::set_password(&transaction, credential, new_hash).await?;
        if let Some(keys) = envelope {
            e2ee::queries::upsert_password_envelope(&transaction, &active.user.id, keys).await?;
        }
        transaction.commit().await?;
        let mut token = None;
        if body.revoke_other_sessions == Some(true) {
            store::delete_user_sessions(&state.db, &active.user.id).await?;
            let fresh = store::create_session(&state.db, &active.user.id, false).await?;
            cookies.extend(hooks::session_cookies(&state, &fresh.token, false));
            token = Some(fresh.token);
        }
        notify_password_updated(&state, &active.user).await;
        let user: AuthUser = session::user_dto(&active.user);
        Ok(json(&json!({"token": token, "user": user})))
    }
    .await;
    hooks::after_sign_in_or_out(&state, &headers, hooks::with_cookies(outcome, cookies))
}

pub async fn verify_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    AuthBody(body): AuthBody,
) -> Response {
    let mut cookies = Vec::new();
    let outcome = async {
        let body: PasswordBody = validate(&VERIFY, body.as_ref(), "body")?;
        let active = require_session(&state, &headers, &mut cookies).await?;
        // `validatePassword`: refused before any hashing, as on sign-in.
        if crate::http::zod::js_length(&body.password) > super::password::MAX_LENGTH {
            return Err(codes::password_too_long());
        }
        let stored = store::credential_account(&state.db, &active.user.id)
            .await?
            .and_then(|a| a.password);
        require_match(match stored {
            Some(stored) => password::verify(&stored, &body.password, &active.user.email)
                .await
                .map_err(|_| ApiError::internal())?,
            None => Verdict::Mismatch,
        })?;
        Ok(json(&StatusFlag { status: true }))
    }
    .await;
    hooks::with_cookies(outcome, cookies)
}

static UPDATE_USER: LazyLock<Schema> = LazyLock::new(zod::record);

/// Renames the user and re-issues the session cookie; pictures change only through `/api/profiles/me/avatar`.
pub async fn update_user(
    State(state): State<AppState>,
    headers: HeaderMap,
    AuthBody(body): AuthBody,
) -> Response {
    let mut cookies = Vec::new();
    let outcome = async {
        let body: serde_json::Map<String, Value> = validate(&UPDATE_USER, body.as_ref(), "body")?;
        let active = require_session(&state, &headers, &mut cookies).await?;
        if body.get("email").is_some_and(|email| {
            !matches!(email, Value::Null | Value::Bool(false)) && email != &json!("")
        }) {
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "EMAIL_CAN_NOT_BE_UPDATED",
                "Email can not be updated",
            ));
        }
        if body.contains_key("image") {
            return Err(ApiError::message(
                StatusCode::BAD_REQUEST,
                "Profile pictures are changed through /api/profiles/me/avatar",
            ));
        }
        let Some(name) = body.get("name") else {
            return Err(ApiError::message(
                StatusCode::BAD_REQUEST,
                "No fields to update",
            ));
        };
        let name = name
            .as_str()
            .map(str::to_owned)
            .ok_or_else(ApiError::internal)?;
        store::update_user(&state.db, active.user, Some(name)).await?;
        let dont_remember = hooks::dont_remember(&state, &headers);
        Ok(Reply::new(
            json(&StatusFlag { status: true }),
            hooks::session_cookies(&state, &active.session.token, dont_remember),
        ))
    }
    .await;
    hooks::with_cookies(outcome, cookies)
}

/// Account deletion goes through `DELETE /api/account`; Better Auth's endpoint is disabled and answers an empty 404.
pub async fn delete_user(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let mut cookies = Vec::new();
    let outcome = require_session(&state, &headers, &mut cookies)
        .await
        .map(|_| StatusCode::NOT_FOUND);
    hooks::with_cookies(outcome, cookies)
}
