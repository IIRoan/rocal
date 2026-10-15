//! `/api/account`: the public sign-up helpers, the session's auth status, and deleting the account.

use std::time::Duration;

use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use solace_api_types::account::{
    AuthStatus, ClaimInviteRequest, DeleteAccountResponse, EmailAvailability,
    EmailAvailabilityQuery, InviteClaimRefused, InviteClaimResult, InviteInvalid, InviteTokenQuery,
    InviteValidation, SignupConfig,
};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::addresses;
use crate::auth::guard::{Auth, MaybeSession};
use crate::error::AppError;
use crate::http::client_ip::client_ip;
use crate::http::extract::{ValidJson, ValidQuery};
use crate::http::rate_limit::{self, Limit};
use crate::http::zod;
use crate::invites;
use crate::request_schema;
use crate::state::AppState;

const PUBLIC_INVITE_LIMIT: Limit = Limit {
    requests: 30,
    window: Duration::from_secs(60),
};

request_schema!(EmailAvailabilityQuery => zod::object([("email", zod::string().min(1).max(320))]).strict());

request_schema!(InviteTokenQuery => zod::object([("token", zod::string().min(1).max(500))]).strict());

request_schema!(ClaimInviteRequest => zod::object([
    ("token", zod::string().min(1).max(500)),
    (
        "chosenEmail",
        zod::string().min(1).max(320).refine(
            |value| !value.as_str().is_some_and(|email| addresses::is_reserved_system_email(email, None)),
            "Cannot claim a reserved system email address.",
            &[],
        ),
    ),
]).strict());

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(signup_config))
        .routes(routes!(email_availability))
        .routes(routes!(auth_status))
        .routes(routes!(validate_invite))
        .routes(routes!(claim_invite))
        .routes(routes!(delete_account))
}

/// The Solace domain new accounts choose their address in.
#[utoipa::path(get, path = "/api/account/signup-config", operation_id = "getSignupConfig", tag = "Account", responses((status = 200, body = SignupConfig)))]
#[tracing::instrument(skip_all)]
pub async fn signup_config(State(state): State<AppState>) -> Json<SignupConfig> {
    Json(SignupConfig {
        default_email_domain: state.config.stalwart_default_domain.clone(),
    })
}

/// Normalizes the chosen handle or address to the Solace domain and says whether it can be used.
#[utoipa::path(get, path = "/api/account/email-availability", operation_id = "getEmailAvailability", tag = "Account", params(("email" = String, Query)), responses((status = 200, body = EmailAvailability)))]
#[tracing::instrument(skip_all)]
pub async fn email_availability(
    State(state): State<AppState>,
    ValidQuery(query): ValidQuery<EmailAvailabilityQuery>,
) -> Result<Json<EmailAvailability>, AppError> {
    Ok(Json(service::availability(&state, &query.email).await?))
}

/// Whether the caller is signed in and still owes a passkey step-up; never cached.
#[utoipa::path(get, path = "/api/account/auth-status", operation_id = "getAuthStatus", tag = "Account", responses((status = 200, body = AuthStatus)))]
#[tracing::instrument(skip_all)]
pub async fn auth_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    MaybeSession(active): MaybeSession,
) -> Result<Response, AppError> {
    let mut response = Json(service::status(&state, &headers, active?).await?).into_response();
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("no-store, max-age=0"),
    );
    Ok(response)
}

/// Checks an invite token before sign-up; 30 requests a minute per client.
#[utoipa::path(get, path = "/api/account/invite/validate", operation_id = "validateInvite", tag = "Account", params(("token" = String, Query)), responses((status = 200, body = InviteValidation)))]
#[tracing::instrument(skip_all)]
pub async fn validate_invite(
    State(state): State<AppState>,
    headers: HeaderMap,
    ValidQuery(query): ValidQuery<InviteTokenQuery>,
) -> Result<Response, AppError> {
    if let Err(AppError::RateLimited { message, .. }) = rate_limit::enforce(
        "account-invite-public",
        &format!("validate:{}", client_ip(&headers)),
        PUBLIC_INVITE_LIMIT,
    ) {
        let body = InviteValidation::Invalid(InviteInvalid {
            valid: false,
            reason: message,
        });
        return Ok((StatusCode::TOO_MANY_REQUESTS, Json(body)).into_response());
    }
    Ok(Json(invites::service::validate(&state, &query.token).await?).into_response())
}

/// Links an invite to the chosen Solace address; sign-up must follow within 15 minutes.
#[utoipa::path(post, path = "/api/account/invite/claim", operation_id = "claimInvite", tag = "Account", request_body = ClaimInviteRequest, responses((status = 200, body = InviteClaimResult)))]
#[tracing::instrument(skip_all)]
pub async fn claim_invite(
    State(state): State<AppState>,
    headers: HeaderMap,
    ValidJson(body): ValidJson<ClaimInviteRequest>,
) -> Result<Response, AppError> {
    if let Err(AppError::RateLimited { message, .. }) = rate_limit::enforce(
        "account-invite-public",
        &format!("claim:{}", client_ip(&headers)),
        PUBLIC_INVITE_LIMIT,
    ) {
        let body = InviteClaimResult::Refused(InviteClaimRefused {
            success: false,
            reason: message,
        });
        return Ok((StatusCode::TOO_MANY_REQUESTS, Json(body)).into_response());
    }
    Ok(Json(invites::service::claim(&state, &body).await?).into_response())
}

/// Deletes the caller's account with its Stalwart mailbox and stored avatar; any body or query is ignored.
#[utoipa::path(delete, path = "/api/account", operation_id = "deleteAccount", tag = "Account", responses((status = 200, body = DeleteAccountResponse)))]
#[tracing::instrument(skip_all)]
pub async fn delete_account(
    State(state): State<AppState>,
    auth: Auth,
) -> Result<Json<DeleteAccountResponse>, AppError> {
    let user = auth.require()?;
    Ok(Json(service::delete(&state, &user).await?))
}
