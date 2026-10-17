//! `/api/calendars/{id}/share-link`: the owner's controls for a calendar's public ICS feed.

use axum::Json;
use axum::extract::{Path, State};
use axum::response::Response;
use serde_json::{Value, json};
use solace_api_types::calendars::{
    CalendarShareLink, CreateShareLinkRequest, DisableShareLinkResponse,
};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::auth::guard::RouteUser;
use crate::error::AppError;
use crate::events::routes::ics_response;
use crate::http::extract::ValidJson;
use crate::http::zod;
use crate::integrations::ics::export::safe_filename;
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
    OpenApiRouter::new()
        .routes(routes!(feed))
        .routes(routes!(get, create, disable))
}

/// The token-protected, read-only ICS feed that outside calendar apps subscribe to; no session needed.
#[utoipa::path(get, path = "/api/calendars/shared/{token}", operation_id = "getSharedCalendarFeed", tag = "ICS Sharing", params(("token" = String, Path)), responses((status = 200, content_type = "text/calendar", body = String)))]
#[tracing::instrument(skip_all)]
pub async fn feed(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Result<Response, AppError> {
    let (name, ics) = service::feed(&state, &token).await?;
    Ok(ics_response(
        ics,
        "inline",
        &safe_filename(&name),
        "no-store, max-age=0",
    ))
}

#[utoipa::path(get, path = "/api/calendars/{id}/share-link", operation_id = "getCalendarShareLink", tag = "ICS Sharing", params(("id" = String, Path)), responses((status = 200, body = CalendarShareLink)))]
#[tracing::instrument(skip_all)]
pub async fn get(
    State(state): State<AppState>,
    user: RouteUser,
    Path(id): Path<String>,
) -> Result<Json<CalendarShareLink>, AppError> {
    Ok(Json(service::get(&state, &user, &id).await?))
}

/// Enables the public ICS link, or rotates its token with `regenerate`.
#[utoipa::path(post, path = "/api/calendars/{id}/share-link", operation_id = "createCalendarShareLink", tag = "ICS Sharing", params(("id" = String, Path)), request_body = CreateShareLinkRequest, responses((status = 200, body = CalendarShareLink)))]
#[tracing::instrument(skip_all)]
pub async fn create(
    State(state): State<AppState>,
    user: RouteUser,
    Path(id): Path<String>,
    ValidJson(body): ValidJson<CreateShareLinkRequest>,
) -> Result<Json<CalendarShareLink>, AppError> {
    let regenerate = body.regenerate.unwrap_or(false);
    Ok(Json(service::create(&state, &user, &id, regenerate).await?))
}

#[utoipa::path(delete, path = "/api/calendars/{id}/share-link", operation_id = "disableCalendarShareLink", tag = "ICS Sharing", params(("id" = String, Path)), responses((status = 200, body = DisableShareLinkResponse)))]
#[tracing::instrument(skip_all)]
pub async fn disable(
    State(state): State<AppState>,
    user: RouteUser,
    Path(id): Path<String>,
) -> Result<Json<DisableShareLinkResponse>, AppError> {
    Ok(Json(service::disable(&state, &user, &id).await?))
}
