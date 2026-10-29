//! `POST /api/auth/sign-up/email` (invite-gated) and `POST /api/auth/sign-in/email`, in Better Auth's wire format.

use std::sync::LazyLock;

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use sea_orm::TransactionTrait;
use serde::Deserialize;
use serde_json::Value;
use solace_api_types::auth::{SignInResponse, SignUpResponse};

use super::api::{ApiError, codes, json, validate};
use super::hooks::{self, Reply};
use super::password::{self, Presented, Verdict};
use super::pipeline::{AuthBody, form_csrf};
use super::{session, store};
use crate::addresses;
use crate::http::zod::{self, Schema};
use crate::invites;
use crate::state::AppState;

const INVITE_REQUIRED: &str = "An invite is required to create an account.";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SignUpBody {
    name: String,
    email: String,
    password: String,
    remember_me: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SignInBody {
    email: String,
    password: String,
    #[serde(rename = "callbackURL")]
    callback_url: Option<String>,
    remember_me: Option<bool>,
}

/// Better Auth's sign-up schema: extra fields are allowed and ignored.
static SIGN_UP: LazyLock<Schema> = LazyLock::new(|| {
    zod::object([
        ("name", zod::string()),
        ("email", zod::string().email()),
        ("password", zod::string().min(1)),
        ("callbackURL", zod::string().optional()),
        ("rememberMe", zod::boolean().optional()),
    ])
});

static SIGN_IN: LazyLock<Schema> = LazyLock::new(|| {
    zod::object([
        ("email", zod::string()),
        ("password", zod::string()),
        ("callbackURL", zod::string().optional()),
        ("rememberMe", zod::boolean().optional()),
    ])
});

pub async fn sign_up(
    State(state): State<AppState>,
    headers: HeaderMap,
    AuthBody(body): AuthBody,
) -> Response {
    // The invite gate runs before Better Auth looks at the body; refusing it skips the after-hooks too.
    let email = body
        .as_ref()
        .and_then(|b| b.get("email"))
        .and_then(Value::as_str)
        .map(|email| email.trim().to_lowercase())
        .filter(|email| !email.is_empty());
    let Some(email) = email else {
        return ApiError::message(StatusCode::FORBIDDEN, INVITE_REQUIRED).into_response();
    };
    match invites::service::signup_refusal(&state, &email).await {
        Ok(None) => {}
        Ok(Some(reason)) => {
            return ApiError::message(StatusCode::FORBIDDEN, reason).into_response();
        }
        Err(error) => return ApiError::from(error).into_response(),
    }
    let outcome = create_account(&state, &headers, body.as_ref()).await;
    if let Ok((_, user)) = &outcome
        && let Err(error) = invites::service::mark_accepted(&state, &user.id, &user.email).await
    {
        tracing::error!(error = %crate::telemetry::redact_pii(&error.to_string()), "Could not mark the invite accepted");
    }
    hooks::after_sign_in_or_out(
        &state,
        &headers,
        hooks::with_cookies(outcome.map(|(reply, _)| reply), Vec::new()),
    )
}

async fn create_account(
    state: &AppState,
    headers: &HeaderMap,
    body: Option<&Value>,
) -> Result<(Reply, crate::db::entities::user::Model), ApiError> {
    let body: SignUpBody = validate(&SIGN_UP, body, "body")?;
    form_csrf(state, headers)?;
    if !addresses::is_zod_email(&body.email) {
        return Err(codes::invalid_email());
    }
    check_new_password(&body.password)?;
    let email = body.email.to_lowercase();
    if store::find_user_by_email(&state.db, &email)
        .await?
        .is_some()
    {
        return Err(codes::user_already_exists());
    }
    let hash = password::hash(&body.password, &email)
        .await
        .map_err(|_| ApiError::internal())?;
    let transaction = state.db.begin().await?;
    let user = store::create_user(&transaction, &email, &body.name).await?;
    store::link_credential(&transaction, &user.id, &hash).await?;
    transaction.commit().await?;
    let dont_remember = body.remember_me == Some(false);
    let new_session = store::create_session(&state.db, &user.id, dont_remember).await?;
    let cookies = hooks::session_cookies(state, &new_session.token, dont_remember);
    let reply = Reply::new(
        json(&SignUpResponse {
            token: new_session.token,
            user: session::user_dto(&user),
        }),
        cookies,
    );
    Ok((reply, user))
}

pub async fn sign_in(
    State(state): State<AppState>,
    headers: HeaderMap,
    AuthBody(body): AuthBody,
) -> Response {
    let outcome = password_sign_in(&state, &headers, body.as_ref()).await;
    hooks::after_sign_in_or_out(&state, &headers, hooks::with_cookies(outcome, Vec::new()))
}

async fn password_sign_in(
    state: &AppState,
    headers: &HeaderMap,
    body: Option<&Value>,
) -> Result<Reply, ApiError> {
    let body: SignInBody = validate(&SIGN_IN, body, "body")?;
    form_csrf(state, headers)?;
    if !addresses::is_zod_email(&body.email) {
        return Err(codes::invalid_email());
    }
    if crate::http::zod::js_length(&body.password) > password::MAX_LENGTH {
        return Err(codes::password_too_long());
    }
    let email = body.email.to_lowercase();
    let user = store::find_user_by_email(&state.db, &email).await?;
    let account = match &user {
        Some(user) => store::credential_account(&state.db, &user.id).await?,
        None => None,
    };
    let (Some(user), Some((account, stored))) = (
        user,
        account.and_then(|a| a.password.clone().map(|p| (a, p))),
    ) else {
        // Hash anyway so an unknown address takes as long as a wrong password.
        let _ = password::hash(&body.password, &email).await;
        return Err(codes::invalid_email_or_password());
    };
    match password::verify(&stored, &body.password, &user.email)
        .await
        .map_err(|_| ApiError::internal())?
    {
        Verdict::Match { rehash: None } => {}
        Verdict::Match {
            rehash: Some(rehash),
        } => store::set_password(&state.db, account, rehash).await?,
        Verdict::Mismatch => return Err(codes::invalid_email_or_password()),
        Verdict::UpgradeRequired => return Err(codes::password_upgrade_required()),
    }
    let dont_remember = body.remember_me == Some(false);
    let new_session = store::create_session(&state.db, &user.id, dont_remember).await?;
    let cookies = hooks::session_cookies(state, &new_session.token, dont_remember);
    let mut response = json(&SignInResponse {
        redirect: body.callback_url.is_some(),
        token: new_session.token,
        user: session::user_dto(&user),
    });
    if let Some(callback) = body
        .callback_url
        .as_deref()
        .and_then(|c| axum::http::HeaderValue::from_str(c).ok())
    {
        response.headers_mut().insert(header::LOCATION, callback);
    }
    Ok(Reply::new(response, cookies))
}

/// Only raw passwords from shipped binaries reach the length rules; current clients check them before deriving the key.
pub fn check_new_password(presented: &str) -> Result<(), ApiError> {
    match Presented::of(presented) {
        Presented::Raw(raw) => check_length(raw),
        Presented::AuthKey(_) => Ok(()),
    }
}

/// A derived key is salted with the email it was typed with, so that must be this account's or no sign-in would match it.
pub fn check_auth_key_email(
    presented: &str,
    email: Option<&str>,
    account_email: &str,
) -> Result<(), ApiError> {
    let named = email.is_some_and(|email| email.trim().to_lowercase() == account_email);
    match Presented::of(presented) {
        Presented::AuthKey(_) if !named => Err(codes::auth_key_email_mismatch()),
        _ => Ok(()),
    }
}

/// `assertPasswordNotTooShort` / `assertPasswordNotTooLong`, counting characters as JavaScript does.
fn check_length(password: &str) -> Result<(), ApiError> {
    let length = crate::http::zod::js_length(password);
    if length < password::MIN_LENGTH {
        return Err(codes::password_too_short());
    }
    if length > password::MAX_LENGTH {
        return Err(codes::password_too_long());
    }
    Ok(())
}
