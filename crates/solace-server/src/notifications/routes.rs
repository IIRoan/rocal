//! `/api/notifications/event/{eventId}`: an event's reminder settings, rate-limited per user and URL.

use std::time::Duration;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::Uri;
use serde_json::Value;
use solace_api_types::notifications::{
    EventNotifications, NotificationDeleteResult, NotificationUpdateResult,
    UpdateEventNotificationsRequest,
};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::auth::guard::{Auth, RouteUser};
use crate::error::AppError;
use crate::http::extract::ValidJson;
use crate::http::rate_limit::{self, Limit};
use crate::http::zod;
use crate::request_schema;
use crate::state::AppState;

const READ_LIMIT: Limit = Limit {
    requests: 100,
    window: Duration::from_secs(60),
};
const WRITE_LIMIT: Limit = Limit {
    requests: 20,
    window: Duration::from_secs(60),
};

request_schema!(UpdateEventNotificationsRequest => {
    let title = regex_lite::Regex::new(r"^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{23,}$")
        .map_or_else(|_| zod::string().max(1200), |pattern| zod::string().max(1200).regex(&pattern));
    zod::object([
        (
            "notifications",
            zod::array(
                zod::object([
                    ("notificationType", zod::enumeration(&["browser", "email"])),
                    ("minutesBefore", zod::number().int().gte(0.0).lte(43_200.0)),
                    ("isEnabled", zod::boolean()),
                ])
                .strict(),
            )
            .max(20),
        ),
        ("encryptedDisplayTitle", title.nullable().optional()),
        // Shipped binaries still send it; it is accepted and dropped, never stored or logged.
        ("displayTitle", zod::string().max(255).nullish().transform(|_| Value::Null)),
    ])
    .strict()
});

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().routes(routes!(get, set, delete))
}

fn enforce(user: &RouteUser, uri: &Uri, limit: Limit) -> Result<(), AppError> {
    rate_limit::enforce("notifications", &format!("{}:{uri}", user.id), limit)
}

#[utoipa::path(get, path = "/api/notifications/event/{eventId}", operation_id = "getEventNotifications", tag = "Notifications", params(("eventId" = String, Path)), responses((status = 200, body = EventNotifications)))]
#[tracing::instrument(skip_all)]
pub async fn get(
    State(state): State<AppState>,
    Path(event_id): Path<String>,
    uri: Uri,
    auth: Auth,
) -> Result<Json<EventNotifications>, AppError> {
    let user = auth.require()?;
    enforce(&user, &uri, READ_LIMIT)?;
    Ok(Json(service::get(&state, &user, &event_id).await?))
}

/// Replaces the event's reminders; the earliest enabled email reminder becomes the event's `reminder`.
#[utoipa::path(put, path = "/api/notifications/event/{eventId}", operation_id = "setEventNotifications", tag = "Notifications", params(("eventId" = String, Path)), request_body = UpdateEventNotificationsRequest, responses((status = 200, body = NotificationUpdateResult)))]
#[tracing::instrument(skip_all)]
pub async fn set(
    State(state): State<AppState>,
    Path(event_id): Path<String>,
    uri: Uri,
    auth: Auth,
    ValidJson(body): ValidJson<UpdateEventNotificationsRequest>,
) -> Result<Json<NotificationUpdateResult>, AppError> {
    let user = auth.require()?;
    enforce(&user, &uri, WRITE_LIMIT)?;
    Ok(Json(
        service::set(
            &state,
            &user,
            &event_id,
            body.notifications,
            body.encrypted_display_title,
        )
        .await?,
    ))
}

#[utoipa::path(delete, path = "/api/notifications/event/{eventId}", operation_id = "deleteEventNotifications", tag = "Notifications", params(("eventId" = String, Path)), responses((status = 200, body = NotificationDeleteResult)))]
#[tracing::instrument(skip_all)]
pub async fn delete(
    State(state): State<AppState>,
    Path(event_id): Path<String>,
    uri: Uri,
    auth: Auth,
) -> Result<Json<NotificationDeleteResult>, AppError> {
    let user = auth.require()?;
    enforce(&user, &uri, WRITE_LIMIT)?;
    Ok(Json(service::delete(&state, &user, &event_id).await?))
}
