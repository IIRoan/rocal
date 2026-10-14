//! `/api/e2ee` handlers.

use axum::Json;
use axum::extract::State;
use solace_api_types::e2ee::{
    E2eeBootstrap, EncryptionDevice, PasswordEnvelope, PasswordEnvelopeRequest,
    RegisterDeviceRequest, ResetSnapshot,
};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::auth::guard::Auth;
use crate::error::AppError;
use crate::http::extract::ValidJson;
use crate::http::zod;
use crate::request_schema;
use crate::state::AppState;

request_schema!(RegisterDeviceRequest => zod::object([
    ("deviceId", zod::string().min(1).max(128)),
    ("deviceLabel", zod::string().max(120).optional()),
    ("publicKey", zod::string().min(1).max(32768)),
    ("publicKeyAlgorithm", zod::string().max(64).optional()),
    ("wrappedAccountKey", zod::string().min(1).max(32768)),
    ("wrappedSearchKey", zod::string().min(1).max(32768)),
    ("wrapAlgorithm", zod::string().max(64).optional()),
    ("keyVersion", zod::number().int().min(1).max(1000).optional()),
]).strict());

request_schema!(PasswordEnvelopeRequest => zod::object([
    ("kdfAlgorithm", zod::string().max(64).optional()),
    ("kdfSalt", zod::string().min(1).max(512)),
    ("kdfIterations", zod::number().int().min(100_000).max(5_000_000).optional()),
    ("wrappedAccountKey", zod::string().min(1).max(32768)),
    ("wrappedSearchKey", zod::string().min(1).max(32768)),
    ("wrapAlgorithm", zod::string().max(64).optional()),
    ("keyVersion", zod::number().int().min(1).max(1000).optional()),
]).strict());

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(bootstrap))
        .routes(routes!(reset_snapshot))
        .routes(routes!(register_device))
        .routes(routes!(store_password_envelope))
}

/// The caller's devices, password envelope and calendars, for unlocking on a device.
#[utoipa::path(get, path = "/api/e2ee/bootstrap", tag = "E2EE", responses((status = 200, body = E2eeBootstrap)))]
#[tracing::instrument(skip_all)]
pub async fn bootstrap(
    State(state): State<AppState>,
    auth: Auth,
) -> Result<Json<E2eeBootstrap>, AppError> {
    let user = auth.require()?;
    Ok(Json(service::bootstrap(&state, &user).await?))
}

/// Raw owned calendars, active categories and unsynced events, so a client can re-wrap them on password reset.
#[utoipa::path(get, path = "/api/e2ee/reset-snapshot", tag = "E2EE", responses((status = 200, body = ResetSnapshot)))]
#[tracing::instrument(skip_all)]
pub async fn reset_snapshot(
    State(state): State<AppState>,
    auth: Auth,
) -> Result<Json<ResetSnapshot>, AppError> {
    let user = auth.require()?;
    Ok(Json(service::reset_snapshot(&state, &user).await?))
}

/// Registers or refreshes this device's wrapping public key and the account keys wrapped to it.
#[utoipa::path(put, path = "/api/e2ee/device", tag = "E2EE", request_body = RegisterDeviceRequest, responses((status = 200, body = EncryptionDevice)))]
#[tracing::instrument(skip_all)]
pub async fn register_device(
    State(state): State<AppState>,
    auth: Auth,
    ValidJson(body): ValidJson<RegisterDeviceRequest>,
) -> Result<Json<EncryptionDevice>, AppError> {
    let user = auth.require()?;
    Ok(Json(service::register_device(&state, &user, body).await?))
}

/// Stores or rotates the password-wrapped account keys used to unlock a new device.
#[utoipa::path(put, path = "/api/e2ee/password", tag = "E2EE", request_body = PasswordEnvelopeRequest, responses((status = 200, body = PasswordEnvelope)))]
#[tracing::instrument(skip_all)]
pub async fn store_password_envelope(
    State(state): State<AppState>,
    auth: Auth,
    ValidJson(body): ValidJson<PasswordEnvelopeRequest>,
) -> Result<Json<PasswordEnvelope>, AppError> {
    let user = auth.require()?;
    Ok(Json(
        service::store_password_envelope(&state, &user, body).await?,
    ))
}
