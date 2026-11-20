//! `/api/auth/recovery/{start,complete}`: the forgotten-password reset, proven with the recovery kit and keeping the account key.

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::response::Response;
use solace_api_types::auth::{
    RecoveryCompleteRequest, RecoveryEnvelope, RecoveryStartRequest, StatusFlag,
};
use solace_api_types::e2ee::PasswordEnvelopeRequest;

use super::api::{ApiError, codes, json, validate};
use super::hooks;
use super::password::{self, Presented};
use super::pipeline::AuthBody;
use crate::e2ee::recovery::{self, Completed, Reset};
use crate::e2ee::service;
use crate::http::extract::RequestSchema;
use crate::http::zod;
use crate::request_schema;
use crate::state::AppState;

request_schema!(RecoveryStartRequest => zod::object([
    ("email", zod::string().min(1).max(320)),
    ("recoveryAuthKey", zod::string().min(1).max(64)),
]).strict());

request_schema!(RecoveryCompleteRequest => zod::object([
    ("email", zod::string().min(1).max(320)),
    ("recoveryAuthKey", zod::string().min(1).max(64)),
    ("newPassword", zod::string().min(1).max(128)),
    ("passwordEnvelope", PasswordEnvelopeRequest::schema().clone()),
    ("removePasskeys", zod::boolean().optional()),
]).strict());

/// One answer for an unknown email, a missing kit and a wrong key, so the route says nothing about who has an account.
fn invalid_kit() -> ApiError {
    ApiError::new(
        StatusCode::UNAUTHORIZED,
        "INVALID_RECOVERY_KIT",
        "Email or recovery key is incorrect.",
    )
}

/// The account keys wrapped under the recovery key, for the key's holder to open on the device.
#[utoipa::path(post, path = "/api/auth/recovery/start", operation_id = "startAccountRecovery", tag = "Auth", request_body = RecoveryStartRequest, responses((status = 200, body = RecoveryEnvelope), (status = 401, body = solace_api_types::auth::AuthError)))]
#[tracing::instrument(skip_all)]
pub async fn start(State(state): State<AppState>, AuthBody(body): AuthBody) -> Response {
    let outcome = async {
        let body: RecoveryStartRequest =
            validate(RecoveryStartRequest::schema(), body.as_ref(), "body")?;
        let envelope = recovery::start(&state.db, &body.email, &body.recovery_auth_key)
            .await?
            .ok_or_else(invalid_kit)?;
        Ok(json(&envelope))
    }
    .await;
    hooks::with_cookies(outcome, Vec::new())
}

/// Sets the new password and its envelope, ends every session and consumes the kit; the client then signs in as usual.
#[utoipa::path(post, path = "/api/auth/recovery/complete", operation_id = "completeAccountRecovery", tag = "Auth", request_body = RecoveryCompleteRequest, responses((status = 200, body = StatusFlag), (status = 401, body = solace_api_types::auth::AuthError)))]
#[tracing::instrument(skip_all)]
pub async fn complete(
    State(state): State<AppState>,
    headers: HeaderMap,
    AuthBody(body): AuthBody,
) -> Response {
    let outcome = async {
        let body: RecoveryCompleteRequest =
            validate(RecoveryCompleteRequest::schema(), body.as_ref(), "body")?;
        // Only a derived key: a raw password here would reach a server that may already hold the kit.
        if !matches!(Presented::of(&body.new_password), Presented::AuthKey(_)) {
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "AUTH_KEY_REQUIRED",
                "Update Solace to reset your password",
            ));
        }
        let envelope = service::password_keys(body.password_envelope).map_err(|_| {
            ApiError::message(StatusCode::BAD_REQUEST, "Invalid encryption envelope")
        })?;
        // Checked before hashing, so a wrong key cannot spend one of the hashing slots sign-ins share.
        let Some(found) =
            recovery::verified_user(&state.db, &body.email, &body.recovery_auth_key).await?
        else {
            return Err(invalid_kit());
        };
        let password_hash = password::hash(&body.new_password, &found.email)
            .await
            .map_err(|_| ApiError::internal())?;
        let reset = Reset {
            password_hash,
            envelope,
            remove_passkeys: body.remove_passkeys == Some(true),
        };
        match recovery::complete(&state.db, &body.email, &body.recovery_auth_key, reset).await? {
            Completed::Done(user) => {
                recovery::notify_recovered(&state, &user).await;
                // Every session just ended, this browser's included.
                Ok(hooks::Reply::new(
                    json(&StatusFlag { status: true }),
                    hooks::expired_session_cookies(&state, &headers),
                ))
            }
            Completed::InvalidKit => Err(invalid_kit()),
            Completed::NoCredential => Err(codes::credential_account_not_found()),
        }
    }
    .await;
    hooks::after_sign_in_or_out(&state, &headers, hooks::with_cookies(outcome, Vec::new()))
}
