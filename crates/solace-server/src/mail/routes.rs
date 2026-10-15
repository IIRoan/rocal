//! `routes/mail-account.ts` and the account half of `routes/mail.ts`: mailbox status, bootstrap, vault backups, the public config, the key directory and mail tokens.

use std::time::Duration;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use solace_api_types::mail::{
    MailAccessToken, MailAccountStatus, MailBootstrapRequest, MailConfig, MailDirectoryKey,
    MailSignup, MailVaultBackup, MailVaultBackupRequest,
};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::auth::guard::{Auth, MaybeSession};
use crate::error::{AppError, plain_error};
use crate::http::client_ip::client_ip;
use crate::http::extract::ValidJson;
use crate::http::rate_limit::{self, Limit};
use crate::http::zod::{self, Schema};
use crate::request_schema;
use crate::state::AppState;
use crate::telemetry;

const DIRECTORY_KEY_LIMIT: Limit = Limit {
    requests: 60,
    window: Duration::from_secs(60),
};

fn kdf_params() -> Schema {
    zod::object([
        ("saltB64", zod::string().min(1).max(512)),
        ("memoryKiB", zod::number().int().min(8192).max(131_072)),
        ("iterations", zod::number().int().min(1).max(4)),
        ("parallelism", zod::number().int().min(1).max(4)),
    ])
    .strict()
}

request_schema!(MailBootstrapRequest => zod::object([
    ("publicKeyArmored", zod::string().min(1).max(131_072)),
    ("fingerprint", zod::string().min(16).max(128)),
    ("algorithm", zod::string().min(1).max(32)),
    ("createdAt", zod::string().min(1).max(64)),
    ("vaultVersion", zod::number().int().min(1).max(10)),
    ("encryptedVaultB64", zod::string().min(1).max(500_000)),
    ("kdf", zod::string().min(1).max(32)),
    ("kdfParams", kdf_params()),
    ("wrappedSecret", zod::string().min(1).max(8_000).nullish()),
    ("wrapAlgorithm", zod::string().min(1).max(64).nullish()),
]).strict());

request_schema!(MailVaultBackupRequest => zod::object([
    ("vaultVersion", zod::number().int().min(1).max(10)),
    ("encryptedVaultB64", zod::string().min(1).max(500_000)),
    ("kdf", zod::string().min(1).max(32)),
    ("kdfParams", kdf_params()),
    ("wrappedSecret", zod::string().min(1).max(8_000).nullish()),
    ("wrapAlgorithm", zod::string().min(1).max(64).nullish()),
]).strict());

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(account))
        .routes(routes!(bootstrap))
        .routes(routes!(vault_backup, put_vault_backup))
        .routes(routes!(config))
        .routes(routes!(directory_key))
        .routes(routes!(access_token))
}

/// Whether the caller's Solace account has a linked mailbox, and its address.
#[utoipa::path(get, path = "/api/mail/account", operation_id = "getMailAccount", tag = "Mail", responses((status = 200, body = MailAccountStatus)))]
#[tracing::instrument(skip_all)]
pub async fn account(
    State(state): State<AppState>,
    auth: Auth,
) -> Result<Json<MailAccountStatus>, AppError> {
    let user = auth.require()?;
    Ok(Json(service::status(&state, &user).await?))
}

/// Provisions the caller's mailbox with the client-made OpenPGP key, encryption at rest and the sealed vault backup.
#[utoipa::path(post, path = "/api/mail/account/bootstrap", operation_id = "bootstrapMailAccount", tag = "Mail", request_body = MailBootstrapRequest, responses((status = 200, body = MailSignup)))]
#[tracing::instrument(skip_all)]
pub async fn bootstrap(
    State(state): State<AppState>,
    auth: Auth,
    ValidJson(body): ValidJson<MailBootstrapRequest>,
) -> Result<Json<MailSignup>, AppError> {
    let user = auth.require()?;
    Ok(Json(service::bootstrap(&state, &user, body).await?))
}

/// The caller's encrypted private-key vault backup.
#[utoipa::path(get, path = "/api/mail/account/vault-backup", operation_id = "getMailVaultBackup", tag = "Mail", responses((status = 200, body = MailVaultBackup)))]
#[tracing::instrument(skip_all)]
pub async fn vault_backup(
    State(state): State<AppState>,
    auth: Auth,
) -> Result<Json<MailVaultBackup>, AppError> {
    let user = auth.require()?;
    Ok(Json(service::vault_backup(&state, &user).await?))
}

/// Replaces the caller's ciphertext-only vault backup.
#[utoipa::path(put, path = "/api/mail/account/vault-backup", operation_id = "putMailVaultBackup", tag = "Mail", request_body = MailVaultBackupRequest, responses((status = 200, body = MailVaultBackup)))]
#[tracing::instrument(skip_all)]
pub async fn put_vault_backup(
    State(state): State<AppState>,
    auth: Auth,
    ValidJson(body): ValidJson<MailVaultBackupRequest>,
) -> Result<Json<MailVaultBackup>, AppError> {
    let user = auth.require()?;
    Ok(Json(service::put_vault_backup(&state, &user, body).await?))
}

/// The public mail configuration: domain, JMAP discovery base, token endpoint and Stalwart's limits.
#[utoipa::path(get, path = "/api/mail/config", operation_id = "getMailConfig", tag = "Mail", responses((status = 200, body = MailConfig)))]
#[tracing::instrument(skip_all)]
pub async fn config(State(state): State<AppState>) -> Json<MailConfig> {
    Json(service::config(&state).await)
}

/// A mailbox's OpenPGP public key; signed-in callers also get keys only Stalwart still holds. 60 a minute per user or client.
#[utoipa::path(get, path = "/api/mail/keys/{email}", operation_id = "getMailDirectoryKey", tag = "Mail", params(("email" = String, Path)), responses((status = 200, body = MailDirectoryKey)))]
#[tracing::instrument(skip_all)]
pub async fn directory_key(
    State(state): State<AppState>,
    Path(email): Path<String>,
    headers: HeaderMap,
    MaybeSession(session): MaybeSession,
) -> Result<Response, AppError> {
    let signed_in = session
        .unwrap_or_else(|error| {
            tracing::debug!(error = %telemetry::redact_pii(&error.to_string()), "Mail key session lookup failed");
            None
        })
        .filter(|active| !active.user.email.trim().is_empty());
    let key = match &signed_in {
        Some(active) => format!("user:{}", active.user.id),
        None => format!("ip:{}", client_ip(&headers)),
    };
    if let Err(AppError::RateLimited { message, .. }) =
        rate_limit::enforce("mail-directory-keys", &key, DIRECTORY_KEY_LIMIT)
    {
        return Ok(plain_error(
            StatusCode::TOO_MANY_REQUESTS,
            "Too many requests",
            &message,
            None,
        ));
    }
    match service::directory_key(&state, &email, signed_in.is_some()).await {
        Ok(key) => Ok(Json(key).into_response()),
        Err(error) => {
            if !matches!(error, AppError::NotFound(_)) {
                tracing::error!(
                    recipient_ref = telemetry::log_ref(&email),
                    error = %telemetry::redact_pii(&error.to_string()),
                    "Failed to look up internal recipient key"
                );
            }
            Err(error)
        }
    }
}

/// A Stalwart bearer for the caller's own mailbox, minted server-side; refused while the session still needs passkey step-up.
#[utoipa::path(get, path = "/api/mail/oauth/access-token", operation_id = "getMailAccessToken", tag = "Mail", responses((status = 200, body = MailAccessToken)))]
#[tracing::instrument(skip_all)]
pub async fn access_token(State(state): State<AppState>, auth: Auth) -> Result<Response, AppError> {
    let user = auth.require()?;
    let email = user.email.trim();
    if email.is_empty() {
        return Ok(plain_error(
            StatusCode::UNAUTHORIZED,
            "Unauthorized",
            "A valid session is required to obtain a mail token.",
            None,
        ));
    }
    match service::access_token_for_user(&state, &user.id, email).await {
        Ok(token) => Ok(Json(token).into_response()),
        Err(error) => {
            tracing::error!(
                user_id = user.id,
                recipient_ref = telemetry::log_ref(email),
                error = %telemetry::redact_pii(&error.to_string()),
                "Failed to issue mail access token"
            );
            Ok(plain_error(
                StatusCode::BAD_REQUEST,
                "mail_token_error",
                &error.client_message(),
                None,
            ))
        }
    }
}
