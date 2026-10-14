//! `/api/account`: the public sign-up helpers (config, address availability, invite validate/claim) and the session's auth status.

use std::sync::LazyLock;
use std::time::Duration;

use axum::Json;
use axum::extract::State;
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use regex_lite::Regex;
use serde::Deserialize;
use solace_api_types::account::{
    AuthStatus, ClaimInviteRequest, EmailAvailability, EmailAvailabilityCode,
    EmailAvailabilityQuery, InviteClaimRefused, InviteClaimResult, InviteInvalid, InviteValidation,
    SignupConfig,
};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::addresses;
use crate::auth::guard::{MaybeSession, has_passkeys, step_up_verified};
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

static LOCAL_PART: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$")
        .unwrap_or_else(|error| panic!("local part pattern: {error}"))
});

request_schema!(EmailAvailabilityQuery => zod::object([("email", zod::string().min(1).max(320))]).strict());

#[derive(Debug, Deserialize)]
pub struct InviteTokenQuery {
    pub token: String,
}

request_schema!(InviteTokenQuery => zod::object([("token", zod::string().min(1).max(500))]).strict());

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(signup_config))
        .routes(routes!(email_availability))
        .routes(routes!(auth_status))
        .routes(routes!(validate_invite))
        .routes(routes!(claim_invite))
}

/// The Solace domain new accounts choose their address in.
#[utoipa::path(get, path = "/api/account/signup-config", tag = "Account", responses((status = 200, body = SignupConfig)))]
#[tracing::instrument(skip_all)]
pub async fn signup_config(State(state): State<AppState>) -> Json<SignupConfig> {
    Json(SignupConfig {
        default_email_domain: state.config.stalwart_default_domain.clone(),
    })
}

/// Normalizes the chosen handle or address to the Solace domain and says whether it can be used.
#[utoipa::path(get, path = "/api/account/email-availability", tag = "Account", params(("email" = String, Query)), responses((status = 200, body = EmailAvailability)))]
#[tracing::instrument(skip_all)]
pub async fn email_availability(
    State(state): State<AppState>,
    ValidQuery(query): ValidQuery<EmailAvailabilityQuery>,
) -> Result<Json<EmailAvailability>, AppError> {
    let domain = addresses::normalize(&state.config.stalwart_default_domain);
    let answer = |local_part: Option<String>, normalized_email: String, code, message: &str| {
        EmailAvailability {
            email: query.email.clone(),
            local_part,
            domain: domain.clone(),
            normalized_email,
            available: code == EmailAvailabilityCode::Available,
            code,
            message: message.to_owned(),
        }
    };
    let desired = match desired_address(&query.email, &domain) {
        Ok(desired) => desired,
        Err(invalid) => {
            let code = if invalid.message.contains("reserved") {
                EmailAvailabilityCode::Reserved
            } else {
                EmailAvailabilityCode::InvalidEmail
            };
            return Ok(Json(answer(
                invalid.local_part,
                invalid.normalized_email,
                code,
                &invalid.message,
            )));
        }
    };
    if invites::address_taken(&state, &desired.normalized_email).await? {
        return Ok(Json(answer(
            Some(desired.local_part),
            desired.normalized_email,
            EmailAvailabilityCode::AlreadyInUse,
            "That email address is already in use.",
        )));
    }
    Ok(Json(answer(
        Some(desired.local_part),
        desired.normalized_email,
        EmailAvailabilityCode::Available,
        "That email address is available.",
    )))
}

/// Whether the caller is signed in and still owes a passkey step-up; never cached.
#[utoipa::path(get, path = "/api/account/auth-status", tag = "Account", responses((status = 200, body = AuthStatus)))]
#[tracing::instrument(skip_all)]
pub async fn auth_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    MaybeSession(active): MaybeSession,
) -> Result<Response, AppError> {
    let status = match active? {
        None => AuthStatus {
            authenticated: false,
            has_passkeys: false,
            requires_passkey_step_up: false,
        },
        Some(active) => {
            let has_passkeys = has_passkeys(&state, &active.user.id).await?;
            let verified = step_up_verified(&state, &headers, &active);
            AuthStatus {
                authenticated: true,
                has_passkeys,
                requires_passkey_step_up: has_passkeys && !verified,
            }
        }
    };
    let mut response = Json(status).into_response();
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("no-store, max-age=0"),
    );
    Ok(response)
}

/// Checks an invite token before sign-up; 30 requests a minute per client.
#[utoipa::path(get, path = "/api/account/invite/validate", tag = "Account", params(("token" = String, Query)), responses((status = 200, body = InviteValidation)))]
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
    Ok(Json(invites::validate(&state, &query.token).await?).into_response())
}

/// Links an invite to the chosen Solace address; sign-up must follow within 15 minutes.
#[utoipa::path(post, path = "/api/account/invite/claim", tag = "Account", request_body = ClaimInviteRequest, responses((status = 200, body = InviteClaimResult)))]
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
    Ok(Json(invites::claim(&state, &body).await?).into_response())
}

struct Desired {
    local_part: String,
    normalized_email: String,
}

struct Invalid {
    local_part: Option<String>,
    normalized_email: String,
    message: String,
}

/// `normalizeDesiredSolaceEmailInput`: a handle or a full address on the Solace domain, valid and not reserved.
fn desired_address(value: &str, domain: &str) -> Result<Desired, Invalid> {
    let normalized = addresses::normalize(value);
    let invalid = |local_part: Option<&str>, normalized_email: &str, message: String| Invalid {
        local_part: local_part.map(str::to_owned),
        normalized_email: normalized_email.to_owned(),
        message,
    };
    const CHARACTERS: &str =
        "Use only lowercase letters, numbers, dots, underscores, and hyphens in your Solace email.";
    if normalized.is_empty() {
        return Err(invalid(
            None,
            &normalized,
            format!("Choose your @{domain} email address."),
        ));
    }
    let reserved = |email: &str, local: &str| {
        addresses::is_reserved_system_email(email, Some(domain))
            || addresses::RESERVED_SYSTEM_LOCAL_PARTS.contains(&local)
    };
    if !normalized.contains('@') {
        let address = format!("{normalized}@{domain}");
        if reserved(&address, &normalized) {
            return Err(invalid(
                Some(&normalized),
                &address,
                "That email address is reserved.".into(),
            ));
        }
        if !LOCAL_PART.is_match(&normalized) {
            return Err(invalid(Some(&normalized), &normalized, CHARACTERS.into()));
        }
        return Ok(Desired {
            local_part: normalized,
            normalized_email: address,
        });
    }
    if !addresses::is_zod_email(&normalized) {
        return Err(invalid(
            None,
            &normalized,
            format!("Enter a valid @{domain} email address."),
        ));
    }
    let (local, input_domain) = normalized.rsplit_once('@').unwrap_or_default();
    if input_domain != domain {
        return Err(invalid(
            Some(local),
            &normalized,
            format!("Use your @{domain} email address for Solace sign-up."),
        ));
    }
    if !LOCAL_PART.is_match(local) {
        return Err(invalid(Some(local), &normalized, CHARACTERS.into()));
    }
    if reserved(&normalized, local) {
        return Err(invalid(
            Some(local),
            &normalized,
            "That email address is reserved.".into(),
        ));
    }
    Ok(Desired {
        local_part: local.to_owned(),
        normalized_email: normalized.clone(),
    })
}
