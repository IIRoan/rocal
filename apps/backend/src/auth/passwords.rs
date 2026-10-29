//! Passwords and the profile through Better Auth: change, reset by mail, verify, `update-user`, and the disabled `delete-user`.

use std::sync::LazyLock;

use axum::extract::{Path, RawQuery, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use serde_json::{Value, json};
use solace_api_types::auth::{AuthUser, StatusFlag};

use super::api::{ApiError, codes, generate_id, json, validate};
use super::email_password::check_length;
use super::hooks::{self, Reply};
use super::pipeline::{AuthBody, is_trusted_target};
use super::session;
use super::sessions::require_session;
use super::{password, store};
use crate::db::entities::user;
use crate::email::{self, PasswordAction};
use crate::http::zod::{self, Schema};
use crate::instant;
use crate::state::AppState;

const RESET_TOKEN_SECONDS: i64 = 60 * 60;
const RESET_REQUESTED: &str =
    "If this email exists in our system, check your email for the reset link";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChangePasswordBody {
    new_password: String,
    current_password: String,
    revoke_other_sessions: Option<bool>,
}

static CHANGE_PASSWORD: LazyLock<Schema> = LazyLock::new(|| {
    zod::object([
        ("newPassword", zod::string()),
        ("currentPassword", zod::string()),
        ("revokeOtherSessions", zod::boolean().optional()),
    ])
});

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResetRequestBody {
    email: String,
    redirect_to: Option<String>,
}

static RESET_REQUEST: LazyLock<Schema> = LazyLock::new(|| {
    zod::object([
        ("email", zod::string().email()),
        ("redirectTo", zod::string().optional()),
    ])
});

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResetBody {
    new_password: String,
    token: Option<String>,
}

static RESET: LazyLock<Schema> = LazyLock::new(|| {
    zod::object([
        ("newPassword", zod::string()),
        ("token", zod::string().optional()),
    ])
});

#[derive(Deserialize)]
struct PasswordBody {
    password: String,
}

static VERIFY: LazyLock<Schema> = LazyLock::new(|| zod::object([("password", zod::string())]));

#[derive(Deserialize)]
struct CallbackQuery {
    #[serde(rename = "callbackURL")]
    callback_url: String,
}

static CALLBACK_QUERY: LazyLock<Schema> =
    LazyLock::new(|| zod::object([("callbackURL", zod::string())]));

#[derive(Deserialize)]
struct ResetTokenQuery {
    token: Option<String>,
}

static RESET_QUERY: LazyLock<Schema> =
    LazyLock::new(|| zod::object([("token", zod::string().optional())]).optional());

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

async fn notify_password_updated(state: &AppState, user: &user::Model, action: PasswordAction) {
    let message = email::password_updated(&greeting(user), action, &sign_in_url(state));
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
        check_length(&body.new_password)?;
        if crate::http::zod::js_length(&body.current_password) > password::MAX_LENGTH {
            return Err(codes::password_too_long());
        }
        let credential = store::credential_account(&state.db, &active.user.id).await?;
        let Some((credential, stored)) =
            credential.and_then(|a| a.password.clone().map(|p| (a, p)))
        else {
            return Err(codes::credential_account_not_found());
        };
        let new_hash = password::hash(&body.new_password)
            .await
            .map_err(|_| ApiError::internal())?;
        if !password::verify(&stored, &body.current_password)
            .await
            .map_err(|_| ApiError::internal())?
        {
            return Err(codes::invalid_password());
        }
        store::set_password(&state.db, credential, new_hash).await?;
        let mut token = None;
        if body.revoke_other_sessions == Some(true) {
            store::delete_user_sessions(&state.db, &active.user.id).await?;
            let fresh = store::create_session(&state.db, &active.user.id, false).await?;
            cookies.extend(hooks::session_cookies(&state, &fresh.token, false));
            token = Some(fresh.token);
        }
        notify_password_updated(&state, &active.user, PasswordAction::Changed).await;
        let user: AuthUser = session::user_dto(&active.user);
        Ok(json(&json!({"token": token, "user": user})))
    }
    .await;
    hooks::after_sign_in_or_out(&state, &headers, hooks::with_cookies(outcome, cookies))
}

pub async fn request_password_reset(
    State(state): State<AppState>,
    AuthBody(body): AuthBody,
) -> Response {
    let outcome: Result<Response, ApiError> = async {
        let body: ResetRequestBody = validate(&RESET_REQUEST, body.as_ref(), "body")?;
        let answer = json(&json!({"status": true, "message": RESET_REQUESTED}));
        let Some(found) = store::find_user_by_email(&state.db, &body.email.to_lowercase()).await?
        else {
            return Ok(answer);
        };
        let token = generate_id()[..24].to_owned();
        store::create_verification(
            &state.db,
            &format!("reset-password:{token}"),
            found.id.clone(),
            RESET_TOKEN_SECONDS,
        )
        .await?;
        let callback = body
            .redirect_to
            .as_deref()
            .map(super::cookies::encode_uri_component)
            .unwrap_or_default();
        let url = format!(
            "{}/api/auth/reset-password/{token}?callbackURL={callback}",
            state.config.backend_url.trim_end_matches('/')
        );
        let message = email::password_reset(&greeting(&found), &url);
        email::send(
            &state,
            "password reset",
            &found.email,
            &message,
            email::Mode::Required,
        )
        .await
        .map_err(|_| ApiError::internal())?;
        Ok(answer)
    }
    .await;
    outcome.unwrap_or_else(IntoResponse::into_response)
}

/// The link in the reset mail: back to the app with the token, or with `error=INVALID_TOKEN`.
pub async fn reset_password_callback(
    State(state): State<AppState>,
    Path(token): Path<String>,
    RawQuery(query): RawQuery,
) -> Response {
    let outcome: Result<Response, ApiError> = async {
        let query = Value::Object(crate::http::extract::form_object(
            query.unwrap_or_default().as_bytes(),
        ));
        let query: CallbackQuery = validate(&CALLBACK_QUERY, Some(&query), "query")?;
        if !query.callback_url.is_empty() && !is_trusted_target(&state, &query.callback_url) {
            return Err(ApiError::new(
                StatusCode::FORBIDDEN,
                "INVALID_CALLBACK_URL",
                "Invalid callbackURL",
            ));
        }
        let base = format!(
            "{}/api/auth",
            state.config.backend_url.trim_end_matches('/')
        );
        let found = store::find_verification(&state.db, &format!("reset-password:{token}")).await?;
        let valid = found.is_some_and(|row| row.expires_at >= instant::now());
        let (key, value) = if valid {
            ("token", token.as_str())
        } else {
            ("error", "INVALID_TOKEN")
        };
        Ok(redirect(&with_param(
            &base,
            &query.callback_url,
            key,
            value,
        )))
    }
    .await;
    outcome.unwrap_or_else(IntoResponse::into_response)
}

/// `new URL(callbackURL, baseURL)` with one search parameter set.
fn with_param(base: &str, target: &str, key: &str, value: &str) -> String {
    let joined = url::Url::parse(&format!("{base}/")).and_then(|base| base.join(target));
    match joined {
        Ok(mut url) => {
            let kept: Vec<(String, String)> = url
                .query_pairs()
                .filter(|(k, _)| k != key)
                .map(|(k, v)| (k.into_owned(), v.into_owned()))
                .collect();
            url.query_pairs_mut()
                .clear()
                .extend_pairs(kept)
                .append_pair(key, value);
            url.to_string()
        }
        Err(_) => format!("{base}/error?{key}={value}"),
    }
}

fn redirect(location: &str) -> Response {
    let mut response = StatusCode::FOUND.into_response();
    if let Ok(value) = HeaderValue::from_str(location) {
        response.headers_mut().insert(header::LOCATION, value);
    }
    response
}

pub async fn reset_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    RawQuery(query): RawQuery,
    AuthBody(body): AuthBody,
) -> Response {
    let outcome = async {
        let query = query.map(|q| Value::Object(crate::http::extract::form_object(q.as_bytes())));
        let query: Option<ResetTokenQuery> = validate(&RESET_QUERY, query.as_ref(), "query")?;
        let body: ResetBody = validate(&RESET, body.as_ref(), "body")?;
        let token = body
            .token
            .clone()
            .filter(|t| !t.is_empty())
            .or_else(|| query.and_then(|q| q.token).filter(|t| !t.is_empty()))
            .ok_or_else(codes::invalid_token)?;
        check_length(&body.new_password)?;
        let row = store::consume_verification(&state.db, &format!("reset-password:{token}"))
            .await?
            .ok_or_else(codes::invalid_token)?;
        let found = store::find_user(&state.db, &row.value)
            .await?
            .ok_or_else(|| {
                ApiError::new(StatusCode::BAD_REQUEST, "USER_NOT_FOUND", "User not found")
            })?;
        let hash = password::hash(&body.new_password)
            .await
            .map_err(|_| ApiError::internal())?;
        match store::credential_account(&state.db, &found.id).await? {
            Some(credential) => store::set_password(&state.db, credential, hash).await?,
            None => {
                store::link_credential(&state.db, &found.id, &hash).await?;
            }
        }
        notify_password_updated(&state, &found, PasswordAction::Reset).await;
        Ok(json(&StatusFlag { status: true }))
    }
    .await;
    hooks::after_sign_in_or_out(&state, &headers, hooks::with_cookies(outcome, Vec::new()))
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
        let matches = match stored {
            Some(stored) => password::verify(&stored, &body.password)
                .await
                .map_err(|_| ApiError::internal())?,
            None => false,
        };
        if !matches {
            return Err(codes::invalid_password());
        }
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
