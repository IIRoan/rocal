//! `/api/recurring`: rule validation and preview, common patterns, and scoped series edits and deletes.

use axum::Json;
use axum::extract::{Path, State};
use solace_api_types::events::Event;
use solace_api_types::recurring::{
    DeleteRecurringQuery, EditRecurringRequest, PreviewRecurrenceRequest, RecurrencePatterns,
    RecurrencePreview, RecurrenceValidation, RecurringDeleted, ValidateRecurrenceRequest,
};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::auth::guard::RouteUser;
use crate::error::AppError;
use crate::http::extract::{ValidJson, ValidQuery};
use crate::http::schemas::{
    calendar_color_schema, event_content_encryption_fields, event_invitation_content_schema,
    event_participant_input_schema, recurrence_rule_schema, recurrence_scope_schema,
    refine_invitation_content_body, timezone_schema,
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
        ("start", zod::string().optional()),
        ("end", zod::string().optional()),
        ("allDay", zod::boolean().optional()),
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
    .super_refine(refine_invitation_content_body)),
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

/// Validates a rule object or rule text and describes it.
#[utoipa::path(post, path = "/api/recurring/validate", operation_id = "validateRecurrenceRule", tag = "Recurring", request_body = ValidateRecurrenceRequest, responses((status = 200, body = RecurrenceValidation)))]
#[tracing::instrument(skip_all)]
pub async fn validate(
    _: RouteUser,
    ValidJson(body): ValidJson<ValidateRecurrenceRequest>,
) -> Result<Json<RecurrenceValidation>, AppError> {
    Ok(Json(service::validate(&body.rule)))
}

/// The occurrences of a rule from the start through `previewDays` (90 by default) later.
#[utoipa::path(post, path = "/api/recurring/preview", operation_id = "previewRecurrence", tag = "Recurring", request_body = PreviewRecurrenceRequest, responses((status = 200, body = RecurrencePreview)))]
#[tracing::instrument(skip_all)]
pub async fn preview(
    _: RouteUser,
    ValidJson(body): ValidJson<PreviewRecurrenceRequest>,
) -> Result<Json<RecurrencePreview>, AppError> {
    Ok(Json(service::preview(&body)?))
}

/// Edits one occurrence (detached), this and future occurrences (a split), or the whole series.
#[utoipa::path(put, path = "/api/recurring/event/{id}", operation_id = "editRecurringEvent", tag = "Recurring", params(("id" = String, Path)), request_body = EditRecurringRequest, responses((status = 200, body = Event)))]
#[tracing::instrument(skip_all)]
pub async fn edit(
    State(state): State<AppState>,
    user: RouteUser,
    Path(id): Path<String>,
    ValidJson(body): ValidJson<EditRecurringRequest>,
) -> Result<Json<Event>, AppError> {
    Ok(Json(service::edit(&state, &user, &id, &body).await?))
}

/// Deletes one occurrence (an exception), this and future occurrences (ends the rule), or the series with its children.
#[utoipa::path(delete, path = "/api/recurring/event/{id}", operation_id = "deleteRecurringEvent", tag = "Recurring", params(("id" = String, Path), ("deleteScope" = String, Query), ("occurrenceDate" = Option<String>, Query)), responses((status = 200, body = RecurringDeleted)))]
#[tracing::instrument(skip_all)]
pub async fn delete(
    State(state): State<AppState>,
    user: RouteUser,
    Path(id): Path<String>,
    ValidQuery(query): ValidQuery<DeleteRecurringQuery>,
) -> Result<Json<RecurringDeleted>, AppError> {
    Ok(Json(service::delete(&state, &user, &id, &query).await?))
}

/// The six fixed patterns the editors offer.
#[utoipa::path(get, path = "/api/recurring/patterns", operation_id = "listRecurrencePatterns", tag = "Recurring", responses((status = 200, body = RecurrencePatterns)))]
#[tracing::instrument(skip_all)]
pub async fn patterns(_: RouteUser) -> Result<Json<RecurrencePatterns>, AppError> {
    Ok(Json(service::patterns()))
}
