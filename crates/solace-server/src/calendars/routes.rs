//! `/api/calendars`: the owner's calendars.

use axum::Json;
use axum::extract::{Path, State};
use solace_api_types::calendars::{
    Calendar, CalendarDeleteResult, CalendarList, CreateCalendarRequest, DeleteCalendarQuery,
    UpdateCalendarRequest,
};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::auth::guard::Auth;
use crate::error::AppError;
use crate::http::extract::{ValidJson, ValidQuery};
use crate::http::schemas::{
    calendar_color_schema, calendar_delete_action_schema, encryption_shadow_fields,
    refine_encrypted_name_body,
};
use crate::http::zod;
use crate::request_schema;
use crate::state::AppState;

request_schema!(CreateCalendarRequest => zod::object([
    ("name", zod::string().max(100).optional()),
    ("color", calendar_color_schema()),
    ("isDefault", zod::boolean().optional()),
])
.extend(encryption_shadow_fields())
.extend([("forceFullEncryption", zod::boolean().optional())])
.strict()
.super_refine(refine_encrypted_name_body("Calendar", true)));

request_schema!(UpdateCalendarRequest => zod::object([
    ("name", zod::string().max(100).optional()),
    ("color", calendar_color_schema().optional()),
    ("isVisible", zod::boolean().optional()),
    ("isDefault", zod::boolean().optional()),
])
.extend(encryption_shadow_fields())
.extend([("forceFullEncryption", zod::boolean().optional())])
.strict()
.super_refine(refine_encrypted_name_body("Calendar", false)));

request_schema!(DeleteCalendarQuery => zod::object([
    ("action", calendar_delete_action_schema().optional()),
    ("targetCalendarId", zod::string().optional()),
])
.strict());

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(list, create))
        .routes(routes!(update, delete))
}

/// The caller's calendars, default first, then by name; the first call creates the defaults.
#[utoipa::path(get, path = "/api/calendars", operation_id = "listCalendars", tag = "Calendars", responses((status = 200, body = CalendarList)))]
#[tracing::instrument(skip_all)]
pub async fn list(
    State(state): State<AppState>,
    auth: Auth,
) -> Result<Json<CalendarList>, AppError> {
    let user = auth.require()?;
    Ok(Json(service::list(&state, &user).await?))
}

#[utoipa::path(post, path = "/api/calendars", operation_id = "createCalendar", tag = "Calendars", request_body = CreateCalendarRequest, responses((status = 200, body = Calendar)))]
#[tracing::instrument(skip_all)]
pub async fn create(
    State(state): State<AppState>,
    auth: Auth,
    ValidJson(body): ValidJson<CreateCalendarRequest>,
) -> Result<Json<Calendar>, AppError> {
    let user = auth.require()?;
    Ok(Json(service::create(&state, &user, body).await?))
}

#[utoipa::path(put, path = "/api/calendars/{id}", operation_id = "updateCalendar", tag = "Calendars", params(("id" = String, Path)), request_body = UpdateCalendarRequest, responses((status = 200, body = Calendar)))]
#[tracing::instrument(skip_all)]
pub async fn update(
    State(state): State<AppState>,
    Path(id): Path<String>,
    auth: Auth,
    ValidJson(body): ValidJson<UpdateCalendarRequest>,
) -> Result<Json<Calendar>, AppError> {
    let user = auth.require()?;
    Ok(Json(service::update(&state, &user, &id, body).await?))
}

/// Deletes an owned calendar, deleting its events (default) or moving them to another calendar.
#[utoipa::path(delete, path = "/api/calendars/{id}", operation_id = "deleteCalendar", tag = "Calendars", params(("id" = String, Path), ("action" = Option<String>, Query), ("targetCalendarId" = Option<String>, Query)), responses((status = 200, body = CalendarDeleteResult)))]
#[tracing::instrument(skip_all)]
pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
    auth: Auth,
    ValidQuery(query): ValidQuery<DeleteCalendarQuery>,
) -> Result<Json<CalendarDeleteResult>, AppError> {
    let user = auth.require()?;
    Ok(Json(service::delete(&state, &user, &id, query).await?))
}
