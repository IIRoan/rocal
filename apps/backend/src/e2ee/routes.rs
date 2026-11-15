//! `/api/e2ee` handlers.

use axum::Json;
use axum::extract::{Path, State};
use solace_api_types::SuccessMessage;
use solace_api_types::e2ee::{
    E2eeBootstrap, EncryptionDevice, EncryptionUpgrades, PasswordEnvelope, PasswordEnvelopeRequest,
    RecoveryKitRequest, RecoveryKitStatus, RegisterDeviceRequest, ResetSnapshot,
};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::{recovery, service, upgrades};
use crate::auth::guard::RouteUser;
use crate::error::AppError;
use crate::http::extract::ValidJson;
use crate::http::rate_limit::{self, Limit};
use crate::http::zod;
use crate::request_schema;
use crate::state::AppState;

const DELETE_DEVICE_LIMIT: Limit = Limit::per_minute(30);
/// Each store checks the password, so it shares the hashing slots every sign-in needs.
const RECOVERY_KIT_LIMIT: Limit = Limit::per_minute(5);

request_schema!(RegisterDeviceRequest => zod::object([
    ("deviceId", zod::string().min(1).max(128)),
    ("deviceLabel", zod::string().max(120).optional()),
    ("publicKey", zod::string().min(1).max(32768)),
    ("publicKeyAlgorithm", zod::string().max(64).optional()),
    ("wrappedAccountKey", zod::string().min(1).max(32768).optional()),
    ("wrappedSearchKey", zod::string().min(1).max(32768).optional()),
    ("wrapAlgorithm", zod::string().max(64).optional()),
    ("keyVersion", zod::number().int().min(1).max(1000).optional()),
]).strict());

request_schema!(PasswordEnvelopeRequest => zod::object([
    ("kdfAlgorithm", zod::string().max(64).optional()),
    ("kdfSalt", zod::string().min(1).max(512)),
    ("kdfIterations", zod::number().int().min(1).max(5_000_000).optional()),
    ("kdfMemoryKiB", zod::number().int().min(65_536).max(131_072).optional()),
    ("kdfParallelism", zod::number().int().min(1).max(4).optional()),
    ("wrappedAccountKey", zod::string().min(1).max(32768)),
    ("wrappedSearchKey", zod::string().min(1).max(32768)),
    ("wrapAlgorithm", zod::string().max(64).optional()),
    ("keyVersion", zod::number().int().min(1).max(1000).optional()),
]).strict());

request_schema!(RecoveryKitRequest => zod::object([
    ("currentPassword", zod::string().min(1).max(128)),
    ("recoveryAuthKey", zod::string().min(1).max(64)),
    ("wrappedAccountKey", zod::string().min(1).max(32768)),
    ("wrappedSearchKey", zod::string().min(1).max(32768)),
    ("keyVersion", zod::number().int().min(1).max(1000).optional()),
]).strict());

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(bootstrap))
        .routes(routes!(reset_snapshot))
        .routes(routes!(encryption_upgrades))
        .routes(routes!(register_device))
        .routes(routes!(delete_device))
        .routes(routes!(store_password_envelope))
        .routes(routes!(
            recovery_kit,
            store_recovery_kit,
            delete_recovery_kit
        ))
}

/// The caller's devices, password envelope and calendars, for unlocking on a device.
#[utoipa::path(get, path = "/api/e2ee/bootstrap", operation_id = "getE2eeBootstrap", tag = "E2EE", responses((status = 200, body = E2eeBootstrap)))]
#[tracing::instrument(skip_all)]
pub async fn bootstrap(
    State(state): State<AppState>,
    user: RouteUser,
) -> Result<Json<E2eeBootstrap>, AppError> {
    Ok(Json(service::bootstrap(&state, &user).await?))
}

/// Opaque ids of what the caller still stores in an older form, which the client re-seals in the background after unlock.
#[utoipa::path(get, path = "/api/e2ee/upgrades", operation_id = "getEncryptionUpgrades", tag = "E2EE", responses((status = 200, body = EncryptionUpgrades)))]
#[tracing::instrument(skip_all)]
pub async fn encryption_upgrades(
    State(state): State<AppState>,
    user: RouteUser,
) -> Result<Json<EncryptionUpgrades>, AppError> {
    Ok(Json(upgrades::report(&state, &user).await?))
}

/// Raw owned calendars, active categories and unsynced events, so a client can re-wrap them on password reset.
#[utoipa::path(get, path = "/api/e2ee/reset-snapshot", operation_id = "getE2eeResetSnapshot", tag = "E2EE", responses((status = 200, body = ResetSnapshot)))]
#[tracing::instrument(skip_all)]
pub async fn reset_snapshot(
    State(state): State<AppState>,
    user: RouteUser,
) -> Result<Json<ResetSnapshot>, AppError> {
    Ok(Json(service::reset_snapshot(&state, &user).await?))
}

/// Registers or refreshes this device's wrapping public key and the account keys wrapped to it.
#[utoipa::path(put, path = "/api/e2ee/device", operation_id = "putE2eeDevice", tag = "E2EE", request_body = RegisterDeviceRequest, responses((status = 200, body = EncryptionDevice)))]
#[tracing::instrument(skip_all)]
pub async fn register_device(
    State(state): State<AppState>,
    user: RouteUser,
    ValidJson(body): ValidJson<RegisterDeviceRequest>,
) -> Result<Json<EncryptionDevice>, AppError> {
    Ok(Json(service::register_device(&state, &user, body).await?))
}

/// Removes one of the caller's devices by its client-chosen id, as signing out on it does; another user's id is not found.
#[utoipa::path(delete, path = "/api/e2ee/devices/{deviceId}", operation_id = "deleteE2eeDevice", tag = "E2EE", params(("deviceId" = String, Path)), responses((status = 200, body = SuccessMessage), (status = 404, description = "No such device for the caller")))]
#[tracing::instrument(skip_all)]
pub async fn delete_device(
    State(state): State<AppState>,
    user: RouteUser,
    Path(device_id): Path<String>,
) -> Result<Json<SuccessMessage>, AppError> {
    rate_limit::enforce("e2ee-devices", &user.id, DELETE_DEVICE_LIMIT)?;
    Ok(Json(
        service::delete_device(&state, &user, &device_id).await?,
    ))
}

/// Stores or rotates the password-wrapped account keys used to unlock a new device.
#[utoipa::path(put, path = "/api/e2ee/password", operation_id = "putE2eePassword", tag = "E2EE", request_body = PasswordEnvelopeRequest, responses((status = 200, body = PasswordEnvelope)))]
#[tracing::instrument(skip_all)]
pub async fn store_password_envelope(
    State(state): State<AppState>,
    user: RouteUser,
    ValidJson(body): ValidJson<PasswordEnvelopeRequest>,
) -> Result<Json<PasswordEnvelope>, AppError> {
    Ok(Json(
        service::store_password_envelope(&state, &user, body).await?,
    ))
}

/// Whether the caller has a recovery kit.
#[utoipa::path(get, path = "/api/e2ee/recovery-kit", operation_id = "getRecoveryKit", tag = "E2EE", responses((status = 200, body = RecoveryKitStatus)))]
#[tracing::instrument(skip_all)]
pub async fn recovery_kit(
    State(state): State<AppState>,
    user: RouteUser,
) -> Result<Json<RecoveryKitStatus>, AppError> {
    Ok(Json(recovery::status(&state, &user).await?))
}

/// Stores a new recovery kit after checking the current password, replacing any earlier one.
#[utoipa::path(put, path = "/api/e2ee/recovery-kit", operation_id = "putRecoveryKit", tag = "E2EE", request_body = RecoveryKitRequest, responses((status = 200, body = RecoveryKitStatus)))]
#[tracing::instrument(skip_all)]
pub async fn store_recovery_kit(
    State(state): State<AppState>,
    user: RouteUser,
    ValidJson(body): ValidJson<RecoveryKitRequest>,
) -> Result<Json<RecoveryKitStatus>, AppError> {
    rate_limit::enforce("recovery-kit", &user.id, RECOVERY_KIT_LIMIT)?;
    Ok(Json(recovery::store(&state, &user, body).await?))
}

/// Removes the caller's recovery kit, so it can no longer reset the password.
#[utoipa::path(delete, path = "/api/e2ee/recovery-kit", operation_id = "deleteRecoveryKit", tag = "E2EE", responses((status = 200, body = SuccessMessage), (status = 404, description = "The caller has no recovery kit")))]
#[tracing::instrument(skip_all)]
pub async fn delete_recovery_kit(
    State(state): State<AppState>,
    user: RouteUser,
) -> Result<Json<SuccessMessage>, AppError> {
    Ok(Json(recovery::remove(&state, &user).await?))
}
