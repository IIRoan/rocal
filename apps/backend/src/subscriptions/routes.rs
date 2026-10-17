//! `/api/subscriptions`: the owner's ICS feeds and ICS file imports.

use axum::Json;
use axum::extract::{Path, State};
use solace_api_types::subscriptions::{
    CalendarSubscription, CreateSubscriptionRequest, DeleteSubscriptionQuery,
    DeleteSubscriptionResponse, ImportIcsRequest, ImportIcsResponse, SubscriptionSyncResult,
    UpdateSubscriptionRequest,
};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::auth::guard::RouteUser;
use crate::error::AppError;
use crate::http::extract::{ValidJson, ValidQuery};
use crate::http::schemas::{calendar_color_schema, encrypted_ics_import_body_schema};
use crate::http::zod;
use crate::request_schema;
use crate::state::AppState;

request_schema!(CreateSubscriptionRequest => zod::object([
    ("name", zod::string().min(1)),
    ("url", zod::string().url()),
    ("color", calendar_color_schema().optional()),
])
.strict());

request_schema!(UpdateSubscriptionRequest => zod::object([
    ("name", zod::string().optional()),
    ("color", calendar_color_schema().optional()),
    ("isActive", zod::boolean().optional()),
    ("syncIntervalMinutes", zod::number().int().min(5).max(1440).optional()),
])
.strict());

request_schema!(DeleteSubscriptionQuery => zod::object([
    ("deleteEvents", zod::optional_query_boolean()),
])
.strict());

request_schema!(ImportIcsRequest => zod::union(vec![
    encrypted_ics_import_body_schema(),
    zod::object([
        ("calendarId", zod::string().min(1)),
        ("icsContent", zod::string().min(1)),
        ("fileName", zod::string().optional()),
    ])
    .strict(),
]));

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(list, create))
        .routes(routes!(update, delete))
        .routes(routes!(sync))
        .routes(routes!(import_ics))
}

/// The caller's feeds, newest first, with their calendars and sync log counts.
#[utoipa::path(get, path = "/api/subscriptions", operation_id = "listSubscriptions", tag = "Calendar Subscriptions", responses((status = 200, body = Vec<CalendarSubscription>)))]
#[tracing::instrument(skip_all)]
pub async fn list(
    State(state): State<AppState>,
    user: RouteUser,
) -> Result<Json<Vec<CalendarSubscription>>, AppError> {
    Ok(Json(service::list(&state, &user).await?))
}

/// Subscribes to a feed that answers, in a new read-only calendar, and syncs it in the background.
#[utoipa::path(post, path = "/api/subscriptions", operation_id = "createSubscription", tag = "Calendar Subscriptions", request_body = CreateSubscriptionRequest, responses((status = 200, body = CalendarSubscription)))]
#[tracing::instrument(skip_all)]
pub async fn create(
    State(state): State<AppState>,
    user: RouteUser,
    ValidJson(body): ValidJson<CreateSubscriptionRequest>,
) -> Result<Json<CalendarSubscription>, AppError> {
    Ok(Json(service::create(&state, &user, body).await?))
}

/// Renames, recolors, pauses or re-times a feed; name and color also change its calendar.
#[utoipa::path(put, path = "/api/subscriptions/{id}", operation_id = "updateSubscription", tag = "Calendar Subscriptions", params(("id" = String, Path)), request_body = UpdateSubscriptionRequest, responses((status = 200, body = CalendarSubscription)))]
#[tracing::instrument(skip_all)]
pub async fn update(
    State(state): State<AppState>,
    user: RouteUser,
    Path(id): Path<String>,
    ValidJson(body): ValidJson<UpdateSubscriptionRequest>,
) -> Result<Json<CalendarSubscription>, AppError> {
    Ok(Json(service::update(&state, &user, &id, body).await?))
}

/// Deletes a feed; `deleteEvents=true` also deletes its events and calendar, otherwise both become the owner's.
#[utoipa::path(delete, path = "/api/subscriptions/{id}", operation_id = "deleteSubscription", tag = "Calendar Subscriptions", params(("id" = String, Path), ("deleteEvents" = Option<bool>, Query)), responses((status = 200, body = DeleteSubscriptionResponse)))]
#[tracing::instrument(skip_all)]
pub async fn delete(
    State(state): State<AppState>,
    user: RouteUser,
    Path(id): Path<String>,
    ValidQuery(query): ValidQuery<DeleteSubscriptionQuery>,
) -> Result<Json<DeleteSubscriptionResponse>, AppError> {
    let delete_events = query.delete_events.unwrap_or(false);
    Ok(Json(
        service::delete(&state, &user, &id, delete_events).await?,
    ))
}

/// Syncs a feed now, paused or not; a failed fetch is recorded and answered as an error.
#[utoipa::path(post, path = "/api/subscriptions/{id}/sync", operation_id = "syncSubscription", tag = "Calendar Subscriptions", params(("id" = String, Path)), responses((status = 200, body = SubscriptionSyncResult)))]
#[tracing::instrument(skip_all)]
pub async fn sync(
    State(state): State<AppState>,
    user: RouteUser,
    Path(id): Path<String>,
) -> Result<Json<SubscriptionSyncResult>, AppError> {
    Ok(Json(service::sync(&state, &user, &id).await?))
}

/// Imports client-encrypted events into an owned calendar; the legacy raw ICS body stays for shipped clients.
#[utoipa::path(post, path = "/api/subscriptions/import-ics", operation_id = "importSubscriptionIcs", tag = "Calendar Subscriptions", request_body = ImportIcsRequest, responses((status = 200, body = ImportIcsResponse)))]
#[tracing::instrument(skip_all)]
pub async fn import_ics(
    State(state): State<AppState>,
    user: RouteUser,
    ValidJson(body): ValidJson<ImportIcsRequest>,
) -> Result<Json<ImportIcsResponse>, AppError> {
    Ok(Json(service::import_ics(&state, &user, body).await?))
}
