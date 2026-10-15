//! `/api/recurring`: rule validation and preview, common patterns, and scoped series edits and deletes.

use axum::Json;
use axum::extract::{Path, State};
use serde_json::Value;
use solace_api_types::events::Event;
use solace_api_types::recurring::{
    DeleteRecurringQuery, EditRecurringRequest, PreviewRecurrenceRequest, RecurrencePatterns,
    RecurrencePreview, RecurrenceValidation, RecurringDeleted, ValidateRecurrenceRequest,
};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::auth::guard::Auth;
use crate::error::AppError;
use crate::http::extract::{ValidJson, ValidQuery};
use crate::http::schemas::{
    calendar_color_schema, event_content_encryption_fields, event_invitation_content_schema,
    event_participant_input_schema, recurrence_rule_schema, recurrence_scope_schema,
    refine_encrypted_event_content_body, timezone_schema,
};
use crate::http::zod;
use crate::request_schema;
use crate::state::AppState;

request_schema!(ValidateRecurrenceRequest => zod::object([("rule", recurrence_rule_schema())]).strict());

request_schema!(PreviewRecurrenceRequest => zod::object([
    ("eventStart", zod::string()),
    ("eventEnd", zod::string()),
    ("recurrenceRule", recurrence_rule_schema()),
    ("previewDays", zod::number().int().gte(7.0).lte(365.0).optional()),
])
.strict());

request_schema!(EditRecurringRequest => zod::object([
    ("editScope", recurrence_scope_schema()),
    ("occurrenceDate", zod::string().optional()),
    ("updates", zod::object([
        ("title", zod::string().optional()),
        ("description", zod::string().optional()),
        ("start", zod::string().optional()),
        ("end", zod::string().optional()),
        ("allDay", zod::boolean().optional()),
        ("location", zod::string().optional()),
        ("color", calendar_color_schema().optional()),
        ("reminder", zod::number().optional()),
        ("recurrence", zod::string().optional()),
        ("calendarId", zod::string().optional()),
        ("categoryId", zod::string().optional()),
        ("timezone", timezone_schema().optional()),
        ("participants", zod::array(event_participant_input_schema()).optional()),
        ("invitationContent", event_invitation_content_schema().optional()),
    ])
    .extend(event_content_encryption_fields())
    .strict()
    .super_refine(refine_encrypted_event_content_body(false))),
])
.strict());

request_schema!(DeleteRecurringQuery => zod::object([
    ("deleteScope", recurrence_scope_schema()),
    ("occurrenceDate", zod::string().optional()),
])
.strict());

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(validate))
        .routes(routes!(preview))
        .routes(routes!(edit, delete))
        .routes(routes!(patterns))
}

/// Validates a rule object or rule text and describes it; the parsed rule echoes whatever rule text held, so it is JSON.
#[utoipa::path(post, path = "/api/recurring/validate", operation_id = "validateRecurrenceRule", tag = "Recurring", request_body = ValidateRecurrenceRequest, responses((status = 200, body = RecurrenceValidation)))]
#[tracing::instrument(skip_all)]
pub async fn validate(
    auth: Auth,
    ValidJson(body): ValidJson<ValidateRecurrenceRequest>,
) -> Result<Json<Value>, AppError> {
    auth.require()?;
    Ok(Json(service::validate(&body.rule)))
}

/// The occurrences of a rule from the start through `previewDays` (90 by default) later.
#[utoipa::path(post, path = "/api/recurring/preview", operation_id = "previewRecurrence", tag = "Recurring", request_body = PreviewRecurrenceRequest, responses((status = 200, body = RecurrencePreview)))]
#[tracing::instrument(skip_all)]
pub async fn preview(
    auth: Auth,
    ValidJson(body): ValidJson<PreviewRecurrenceRequest>,
) -> Result<Json<RecurrencePreview>, AppError> {
    auth.require()?;
    Ok(Json(service::preview(&body)?))
}

/// Edits one occurrence (detached), this and future occurrences (a split), or the whole series.
#[utoipa::path(put, path = "/api/recurring/event/{id}", operation_id = "editRecurringEvent", tag = "Recurring", params(("id" = String, Path)), request_body = EditRecurringRequest, responses((status = 200, body = Event)))]
#[tracing::instrument(skip_all)]
pub async fn edit(
    State(state): State<AppState>,
    Path(id): Path<String>,
    auth: Auth,
    ValidJson(body): ValidJson<EditRecurringRequest>,
) -> Result<Json<Event>, AppError> {
    let user = auth.require()?;
    Ok(Json(service::edit(&state, &user, &id, &body).await?))
}

/// Deletes one occurrence (an exception), this and future occurrences (ends the rule), or the series with its children.
#[utoipa::path(delete, path = "/api/recurring/event/{id}", operation_id = "deleteRecurringEvent", tag = "Recurring", params(("id" = String, Path), ("deleteScope" = String, Query), ("occurrenceDate" = Option<String>, Query)), responses((status = 200, body = RecurringDeleted)))]
#[tracing::instrument(skip_all)]
pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
    auth: Auth,
    ValidQuery(query): ValidQuery<DeleteRecurringQuery>,
) -> Result<Json<RecurringDeleted>, AppError> {
    let user = auth.require()?;
    Ok(Json(service::delete(&state, &user, &id, &query).await?))
}

/// The six fixed patterns the editors offer.
#[utoipa::path(get, path = "/api/recurring/patterns", operation_id = "listRecurrencePatterns", tag = "Recurring", responses((status = 200, body = RecurrencePatterns)))]
#[tracing::instrument(skip_all)]
pub async fn patterns(auth: Auth) -> Result<Json<RecurrencePatterns>, AppError> {
    auth.require()?;
    Ok(Json(service::patterns()))
}
