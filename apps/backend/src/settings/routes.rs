//! `/api/settings`: read, update and reset the caller's settings.

use axum::Json;
use axum::extract::State;
use solace_api_types::SuccessMessage;
use solace_api_types::settings::{UpdateSettingsRequest, UserSettings};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::auth::guard::RouteUser;
use crate::error::AppError;
use crate::http::extract::ValidJson;
use crate::http::schemas::{
    default_view_schema, theme_schema, time_format_schema, timezone_schema,
};
use crate::http::zod;
use crate::request_schema;
use crate::state::AppState;

request_schema!(UpdateSettingsRequest => zod::object([
    ("theme", theme_schema().optional()),
    ("defaultView", default_view_schema().optional()),
    ("weekStartDay", zod::number().int().min(0).max(6).optional()),
    ("timezone", timezone_schema().optional()),
    ("timeFormat", time_format_schema().optional()),
    ("workingHoursStart", zod::number().int().min(0).max(1440).optional()),
    ("workingHoursEnd", zod::number().int().min(0).max(1440).optional()),
    ("workingDays", zod::string().optional()),
    ("emailNotifications", zod::boolean().optional()),
    ("pushNotifications", zod::boolean().optional()),
    ("browserNotifications", zod::boolean().optional()),
    ("reminderSound", zod::boolean().optional()),
    ("defaultEventDuration", zod::number().int().min(1).max(zod::I32_MAX).optional()),
    ("defaultCalendarId", zod::union(vec![zod::string(), zod::null()]).optional()),
    ("compactView", zod::boolean().optional()),
    ("showWeekNumbers", zod::boolean().optional()),
    ("showDeclinedEvents", zod::boolean().optional()),
    ("encryptedPreferences", zod::string().min(1).max(65_536).optional()),
    ("expectedEncryptedPreferences", zod::string().max(65_536).nullable().optional()),
]).strict());

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().routes(routes!(get, update, reset))
}

/// The caller's settings, created with the defaults if none exist.
#[utoipa::path(get, path = "/api/settings", tag = "Settings", operation_id = "getSettings", responses((status = 200, body = UserSettings)))]
#[tracing::instrument(skip_all)]
pub async fn get(
    State(state): State<AppState>,
    user: RouteUser,
) -> Result<Json<UserSettings>, AppError> {
    Ok(Json(service::get(&state, &user).await?))
}

/// Updates the given settings; choosing an encryption mode turns off calendar share links.
#[utoipa::path(put, path = "/api/settings", tag = "Settings", operation_id = "updateSettings", request_body = UpdateSettingsRequest, responses((status = 200, body = UserSettings)))]
#[tracing::instrument(skip_all)]
pub async fn update(
    State(state): State<AppState>,
    user: RouteUser,
    ValidJson(body): ValidJson<UpdateSettingsRequest>,
) -> Result<Json<UserSettings>, AppError> {
    Ok(Json(service::update(&state, &user, body).await?))
}

/// Deletes the caller's settings, so the next read starts from the defaults.
#[utoipa::path(delete, path = "/api/settings", tag = "Settings", operation_id = "resetSettings", responses((status = 200, body = SuccessMessage)))]
#[tracing::instrument(skip_all)]
pub async fn reset(
    State(state): State<AppState>,
    user: RouteUser,
) -> Result<Json<SuccessMessage>, AppError> {
    Ok(Json(service::reset(&state, &user).await?))
}
