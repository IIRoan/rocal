//! `/api/notifications/event/{eventId}`: an event's reminder settings, rate-limited per user and URL.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::Uri;
use serde_json::Value;
use solace_api_types::notifications::{
    EventNotifications, NotificationDeleteResult, NotificationUpdateResult,
    SealEventRemindersRequest, SealedReminders, UpdateEventNotificationsRequest,
};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::auth::guard::RouteUser;
use crate::error::AppError;
use crate::http::extract::ValidJson;
use crate::http::rate_limit::{self, Limit};
use crate::http::zod;
use crate::request_schema;
use crate::state::AppState;

const READ_LIMIT: Limit = Limit::per_minute(100);
const WRITE_LIMIT: Limit = Limit::per_minute(20);

/// `v1.<iv>.<ciphertext>` under the notification key, as a reminder's title and lead are sealed.
fn sealed_value() -> zod::Schema {
    regex_lite::Regex::new(r"^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{23,}$").map_or_else(
        |_| zod::string().max(1200),
        |pattern| zod::string().max(1200).regex(&pattern),
    )
}

fn minutes_before() -> zod::Schema {
    zod::number().int().gte(0.0).lte(43_200.0)
}

request_schema!(UpdateEventNotificationsRequest => {
    let title = sealed_value();
    zod::object([
        (
            "notifications",
            zod::array(
                zod::object([
                    ("notificationType", zod::enumeration(&["browser", "email"])),
                    ("minutesBefore", minutes_before()),
                    ("isEnabled", zod::boolean()),
                    ("encryptedLead", title.clone().nullish()),
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

request_schema!(SealEventRemindersRequest => zod::object([
    ("encryptedDisplayTitle", sealed_value().optional()),
    (
        "leads",
        zod::array(
            zod::object([
                ("minutesBefore", minutes_before()),
                ("encryptedLead", sealed_value()),
            ])
            .strict(),
        )
        .max(20),
    ),
])
.strict());

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(get, set, delete))
        .routes(routes!(seal))
}

fn enforce(user: &RouteUser, uri: &Uri, limit: Limit) -> Result<(), AppError> {
    rate_limit::enforce(
        "notifications",
        &format!("{}:{}", user.id, uri.path()),
        limit,
    )
}

#[utoipa::path(get, path = "/api/notifications/event/{eventId}", operation_id = "getEventNotifications", tag = "Notifications", params(("eventId" = String, Path)), responses((status = 200, body = EventNotifications)))]
#[tracing::instrument(skip_all)]
pub async fn get(
    State(state): State<AppState>,
    user: RouteUser,
    Path(event_id): Path<String>,
    uri: Uri,
) -> Result<Json<EventNotifications>, AppError> {
    enforce(&user, &uri, READ_LIMIT)?;
    Ok(Json(service::get(&state, &user, &event_id).await?))
}

/// Replaces the event's reminders; the earliest enabled email reminder becomes the event's `reminder`.
#[utoipa::path(put, path = "/api/notifications/event/{eventId}", operation_id = "setEventNotifications", tag = "Notifications", params(("eventId" = String, Path)), request_body = UpdateEventNotificationsRequest, responses((status = 200, body = NotificationUpdateResult)))]
#[tracing::instrument(skip_all)]
pub async fn set(
    State(state): State<AppState>,
    user: RouteUser,
    Path(event_id): Path<String>,
    uri: Uri,
    ValidJson(body): ValidJson<UpdateEventNotificationsRequest>,
) -> Result<Json<NotificationUpdateResult>, AppError> {
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
    user: RouteUser,
    Path(event_id): Path<String>,
    uri: Uri,
) -> Result<Json<NotificationDeleteResult>, AppError> {
    enforce(&user, &uri, WRITE_LIMIT)?;
    Ok(Json(service::delete(&state, &user, &event_id).await?))
}

/// Seals what the event's pending reminders lack, without rescheduling them, as a client upgrading stored encryption does.
#[utoipa::path(put, path = "/api/notifications/event/{eventId}/sealed", operation_id = "sealEventReminders", tag = "Notifications", params(("eventId" = String, Path)), request_body = SealEventRemindersRequest, responses((status = 200, body = SealedReminders)))]
#[tracing::instrument(skip_all)]
pub async fn seal(
    State(state): State<AppState>,
    user: RouteUser,
    Path(event_id): Path<String>,
    uri: Uri,
    ValidJson(body): ValidJson<SealEventRemindersRequest>,
) -> Result<Json<SealedReminders>, AppError> {
    enforce(&user, &uri, WRITE_LIMIT)?;
    Ok(Json(service::seal(&state, &user, &event_id, body).await?))
}
