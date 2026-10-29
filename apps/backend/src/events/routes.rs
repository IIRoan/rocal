//! `/api/events`: the owner's events, search, ICS export, sealing and bulk actions.

use axum::Json;
use axum::extract::{Path, State};
use axum::http::{HeaderValue, header};
use axum::response::{IntoResponse, Response};
use solace_api_types::events::{
    BulkEventRequest, BulkEventResult, CreateEventRequest, Event, EventDeleted, EventList,
    EventListQuery, EventSearchCorpus, EventSearchCorpusQuery, EventSearchQuery,
    EventSearchResults, InvitationByExternalIdQuery, InvitationLookup, RsvpRequest, RsvpResult,
    SealEncryptionRequest, UpdateEventRequest,
};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::{listing, rsvp, service};
use crate::auth::guard::RouteUser;
use crate::error::AppError;
use crate::http::extract::{ValidJson, ValidQuery};
use crate::http::schemas::{
    bulk_event_action_schema, calendar_color_schema, event_content_encryption_fields,
    event_invitation_content_schema, event_participant_input_schema,
    refine_invitation_content_body, reminder_field_schema, rsvp_status_schema, timezone_schema,
};
use crate::http::zod::{self, optional_query_boolean, optional_query_int};
use crate::request_schema;
use crate::state::AppState;

request_schema!(EventListQuery => zod::object([("start", zod::string()), ("end", zod::string())]).strict());

request_schema!(EventSearchQuery => zod::object([
    ("q", zod::string().min(2)),
    ("limit", optional_query_int(Some(1), Some(50))),
    ("blindIndexTokens", zod::string().optional()),
    ("offset", optional_query_int(Some(0), Some(zod::MAX_SAFE_INTEGER))),
    ("startDate", zod::string().optional()),
    ("endDate", zod::string().optional()),
])
.strict());

request_schema!(EventSearchCorpusQuery => zod::object([
    ("limit", optional_query_int(Some(1), Some(200))),
    ("offset", optional_query_int(Some(0), Some(zod::MAX_SAFE_INTEGER))),
    ("updatedAfter", zod::string().optional()),
    ("readableInvitations", optional_query_boolean()),
])
.strict());

request_schema!(InvitationByExternalIdQuery => zod::object([
    ("externalId", zod::string().min(1).max(512)),
    ("syncRemote", optional_query_boolean()),
])
.strict());

request_schema!(CreateEventRequest => zod::object([
    ("start", zod::string()),
    ("end", zod::string()),
    ("allDay", zod::boolean().optional()),
    ("color", calendar_color_schema().optional()),
    ("calendarId", zod::string()),
    ("categoryId", zod::string().optional()),
    ("timezone", timezone_schema().optional()),
    ("reminder", reminder_field_schema().optional()),
    ("recurrence", zod::string().optional()),
])
.extend(event_content_encryption_fields())
.extend([
    ("encryptedContent", zod::string()),
    ("participants", zod::array(event_participant_input_schema()).optional()),
    ("invitationContent", event_invitation_content_schema().optional()),
])
.strict()
.super_refine(refine_invitation_content_body));

request_schema!(UpdateEventRequest => zod::object([
    ("start", zod::string().optional()),
    ("end", zod::string().optional()),
    ("timezone", timezone_schema().optional()),
    ("allDay", zod::boolean().optional()),
    ("color", calendar_color_schema().optional()),
    ("calendarId", zod::string().optional()),
    ("categoryId", zod::string().optional()),
    ("reminder", reminder_field_schema().optional()),
    ("recurrence", zod::union(vec![zod::string(), zod::null()]).optional()),
])
.extend(event_content_encryption_fields())
.extend([
    ("participants", zod::array(event_participant_input_schema()).optional()),
    ("invitationContent", event_invitation_content_schema().optional()),
])
.strict()
.super_refine(refine_invitation_content_body));

request_schema!(RsvpRequest => zod::object([("status", rsvp_status_schema())]).strict());

request_schema!(SealEncryptionRequest => zod::object([
    ("encryptedContent", zod::string().min(1)),
    ("blindIndexTokens", zod::array(zod::string().min(1)).optional()),
    ("encryptionKeyVersion", zod::number().int().gte(1.0).max(zod::I32_MAX).optional()),
])
.strict());

request_schema!(BulkEventRequest => zod::object([
    ("action", bulk_event_action_schema()),
    ("eventIds", zod::array(zod::string()).min(1)),
    ("targetCalendarId", zod::string().optional()),
])
.strict());

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(search))
        .routes(routes!(search_corpus))
        .routes(routes!(list, create))
        .routes(routes!(invitation_by_external_id))
        .routes(routes!(rsvp))
        .routes(routes!(seal))
        .routes(routes!(get, update, delete))
        .routes(routes!(bulk))
}

/// Plaintext full-text search, with blind-index tokens for encrypted events.
#[utoipa::path(get, path = "/api/events/search", operation_id = "searchEvents", tag = "Events", params(("q" = String, Query), ("limit" = Option<i64>, Query), ("blindIndexTokens" = Option<String>, Query), ("offset" = Option<i64>, Query), ("startDate" = Option<String>, Query), ("endDate" = Option<String>, Query)), responses((status = 200, body = EventSearchResults)))]
#[tracing::instrument(skip_all)]
pub async fn search(
    State(state): State<AppState>,
    user: RouteUser,
    ValidQuery(query): ValidQuery<EventSearchQuery>,
) -> Result<Json<EventSearchResults>, AppError> {
    Ok(Json(listing::search(&state, &user, query).await?))
}

/// Pages of the caller's events with their ciphertext, for device-local search indexing.
#[utoipa::path(get, path = "/api/events/search-corpus", operation_id = "getEventSearchCorpus", tag = "Events", params(("limit" = Option<i64>, Query), ("offset" = Option<i64>, Query), ("updatedAfter" = Option<String>, Query), ("readableInvitations" = Option<bool>, Query)), responses((status = 200, body = EventSearchCorpus)))]
#[tracing::instrument(skip_all)]
pub async fn search_corpus(
    State(state): State<AppState>,
    user: RouteUser,
    ValidQuery(query): ValidQuery<EventSearchCorpusQuery>,
) -> Result<Json<EventSearchCorpus>, AppError> {
    Ok(Json(listing::search_corpus(&state, &user, query).await?))
}

/// The caller's events in a range, with recurring instances, categories and calendars.
#[utoipa::path(get, path = "/api/events", operation_id = "listEvents", tag = "Events", params(("start" = String, Query), ("end" = String, Query)), responses((status = 200, body = EventList)))]
#[tracing::instrument(skip_all)]
pub async fn list(
    State(state): State<AppState>,
    user: RouteUser,
    ValidQuery(query): ValidQuery<EventListQuery>,
) -> Result<Json<EventList>, AppError> {
    Ok(Json(
        listing::list(&state, &user, &query.start, &query.end).await?,
    ))
}

#[utoipa::path(post, path = "/api/events", operation_id = "createEvent", tag = "Events", request_body = CreateEventRequest, responses((status = 200, body = Event)))]
#[tracing::instrument(skip_all)]
pub async fn create(
    State(state): State<AppState>,
    user: RouteUser,
    ValidJson(body): ValidJson<CreateEventRequest>,
) -> Result<Json<Event>, AppError> {
    Ok(Json(service::create(&state, &user, body).await?))
}

/// An `.ics` body served `attachment` or `inline` under `filename`.
pub fn ics_response(
    ics: String,
    disposition: &str,
    filename: &str,
    cache_control: &'static str,
) -> Response {
    let mut response = ics.into_response();
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("text/calendar; charset=utf-8"),
    );
    if let Ok(value) = HeaderValue::from_str(&format!("{disposition}; filename=\"{filename}\"")) {
        headers.insert(header::CONTENT_DISPOSITION, value);
    }
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static(cache_control),
    );
    response
}

/// The local copy of a mailed invitation by its UID, or `null`.
#[utoipa::path(get, path = "/api/events/invitations/by-external-id", operation_id = "getInvitationByExternalId", tag = "Events", params(("externalId" = String, Query), ("syncRemote" = Option<bool>, Query)), responses((status = 200, body = InvitationLookup)))]
#[tracing::instrument(skip_all)]
pub async fn invitation_by_external_id(
    State(state): State<AppState>,
    user: RouteUser,
    ValidQuery(query): ValidQuery<InvitationByExternalIdQuery>,
) -> Result<Json<InvitationLookup>, AppError> {
    Ok(Json(
        service::invitation_by_external_id(&state, &user, &query.external_id).await?,
    ))
}

/// Answers a mailed invitation; a decline hides the copy and answers `{ deleted: true }`.
#[utoipa::path(post, path = "/api/events/{id}/rsvp", operation_id = "respondToInvitation", tag = "Events", params(("id" = String, Path)), request_body = RsvpRequest, responses((status = 200, body = RsvpResult)))]
#[tracing::instrument(skip_all)]
pub async fn rsvp(
    State(state): State<AppState>,
    user: RouteUser,
    Path(id): Path<String>,
    ValidJson(body): ValidJson<RsvpRequest>,
) -> Result<Json<RsvpResult>, AppError> {
    Ok(Json(rsvp::answer(&state, &user, &id, &body).await?))
}

/// Stores ciphertext for an imported invitation without changing its schedule.
#[utoipa::path(post, path = "/api/events/{id}/seal-encryption", operation_id = "sealEventEncryption", tag = "Events", params(("id" = String, Path)), request_body = SealEncryptionRequest, responses((status = 200, body = Event)))]
#[tracing::instrument(skip_all)]
pub async fn seal(
    State(state): State<AppState>,
    user: RouteUser,
    Path(id): Path<String>,
    ValidJson(body): ValidJson<SealEncryptionRequest>,
) -> Result<Json<Event>, AppError> {
    Ok(Json(service::seal(&state, &user, &id, body).await?))
}

#[utoipa::path(get, path = "/api/events/{id}", operation_id = "getEvent", tag = "Events", params(("id" = String, Path)), responses((status = 200, body = Event)))]
#[tracing::instrument(skip_all)]
pub async fn get(
    State(state): State<AppState>,
    user: RouteUser,
    Path(id): Path<String>,
) -> Result<Json<Event>, AppError> {
    Ok(Json(service::get(&state, &user, &id).await?))
}

/// Updates the event; an instance id edits its series, and a stale `updatedAt` is refused.
#[utoipa::path(put, path = "/api/events/{id}", operation_id = "updateEvent", tag = "Events", params(("id" = String, Path)), request_body = UpdateEventRequest, responses((status = 200, body = Event)))]
#[tracing::instrument(skip_all)]
pub async fn update(
    State(state): State<AppState>,
    user: RouteUser,
    Path(id): Path<String>,
    ValidJson(body): ValidJson<UpdateEventRequest>,
) -> Result<Json<Event>, AppError> {
    Ok(Json(service::update(&state, &user, &id, body).await?))
}

#[utoipa::path(delete, path = "/api/events/{id}", operation_id = "deleteEvent", tag = "Events", params(("id" = String, Path)), responses((status = 200, body = EventDeleted)))]
#[tracing::instrument(skip_all)]
pub async fn delete(
    State(state): State<AppState>,
    user: RouteUser,
    Path(id): Path<String>,
) -> Result<Json<EventDeleted>, AppError> {
    Ok(Json(service::delete(&state, &user, &id).await?))
}

/// Moves, deletes or duplicates several events at once.
#[utoipa::path(post, path = "/api/events/bulk", operation_id = "bulkEvents", tag = "Events", request_body = BulkEventRequest, responses((status = 200, body = BulkEventResult)))]
#[tracing::instrument(skip_all)]
pub async fn bulk(
    State(state): State<AppState>,
    user: RouteUser,
    ValidJson(body): ValidJson<BulkEventRequest>,
) -> Result<Json<BulkEventResult>, AppError> {
    Ok(Json(service::bulk(&state, &user, body).await?))
}
