//! `POST /api/internal/stalwart/webhook`: Stalwart's signed telemetry, answered with `{ error, message }` refusals instead of the envelope.

use axum::Json;
use axum::body::Body;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::response::{IntoResponse, Response};
use solace_api_types::mail::{StalwartWebhookError, StalwartWebhookResult};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super as webhook;
use crate::error::AppError;
use crate::state::AppState;

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().routes(routes!(stalwart_webhook))
}

/// Accepts signed Stalwart `message-ingest.ham` events and queues native pushes for linked Solace mailboxes.
#[utoipa::path(
    post,
    path = "/api/internal/stalwart/webhook",
    tag = "Internal",
    operation_id = "receiveStalwartWebhook",
    responses(
        (status = 200, body = StalwartWebhookResult),
        (status = 400, body = StalwartWebhookError),
        (status = 401, body = StalwartWebhookError),
        (status = 413, body = StalwartWebhookError),
        (status = 429, body = StalwartWebhookError),
        (status = 503, body = StalwartWebhookError),
    )
)]
#[tracing::instrument(skip_all)]
pub async fn stalwart_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Body,
) -> Result<Response, AppError> {
    let secret = state.config.stalwart_webhook_secret.as_deref();
    match webhook::receive(secret, &headers, body).await {
        Ok(payload) => Ok(Json(webhook::handle_payload(&state, payload).await?).into_response()),
        Err(refusal) => Ok(refusal.into_response()),
    }
}
