//! `/api/calendars/{id}/share-link`: the owner's controls for a calendar's public ICS feed.

use axum::Json;
use axum::extract::{Path, State};
use serde_json::{Value, json};
use solace_api_types::calendars::{
    CalendarShareLink, CreateShareLinkRequest, DisableShareLinkResponse,
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

request_schema!(CreateShareLinkRequest => zod::preprocess(
    |value| Some(match value {
        None | Some(Value::Null) => json!({}),
        Some(value) => value.clone(),
    }),
    zod::object([("regenerate", zod::boolean().optional())]).strict(),
));

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().routes(routes!(get, create, disable))
}

#[utoipa::path(get, path = "/api/calendars/{id}/share-link", operation_id = "getCalendarShareLink", tag = "ICS Sharing", params(("id" = String, Path)), responses((status = 200, body = CalendarShareLink)))]
#[tracing::instrument(skip_all)]
pub async fn get(
    State(state): State<AppState>,
    Path(id): Path<String>,
    auth: Auth,
) -> Result<Json<CalendarShareLink>, AppError> {
    let user = auth.require()?;
    Ok(Json(service::get(&state, &user, &id).await?))
}

/// Enables the public ICS link, or rotates its token with `regenerate`.
#[utoipa::path(post, path = "/api/calendars/{id}/share-link", operation_id = "createCalendarShareLink", tag = "ICS Sharing", params(("id" = String, Path)), request_body = CreateShareLinkRequest, responses((status = 200, body = CalendarShareLink)))]
#[tracing::instrument(skip_all)]
pub async fn create(
    State(state): State<AppState>,
    Path(id): Path<String>,
    auth: Auth,
    ValidJson(body): ValidJson<CreateShareLinkRequest>,
) -> Result<Json<CalendarShareLink>, AppError> {
    let user = auth.require()?;
    let regenerate = body.regenerate.unwrap_or(false);
    Ok(Json(service::create(&state, &user, &id, regenerate).await?))
}

#[utoipa::path(delete, path = "/api/calendars/{id}/share-link", operation_id = "disableCalendarShareLink", tag = "ICS Sharing", params(("id" = String, Path)), responses((status = 200, body = DisableShareLinkResponse)))]
#[tracing::instrument(skip_all)]
pub async fn disable(
    State(state): State<AppState>,
    Path(id): Path<String>,
    auth: Auth,
) -> Result<Json<DisableShareLinkResponse>, AppError> {
    let user = auth.require()?;
    Ok(Json(service::disable(&state, &user, &id).await?))
}
