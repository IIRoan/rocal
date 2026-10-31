use axum::{Json, extract::State};
use solace_api_types::riftbound::{
    ResolveRiftboundStoreRequest, RiftboundEventsRequest, RiftboundPublicEvent, RiftboundStore,
};
use utoipa_axum::{router::OpenApiRouter, routes};

use super::service;
use crate::{
    auth::guard::RouteUser,
    error::AppError,
    http::{extract::ValidJson, zod},
    request_schema,
    state::AppState,
};

request_schema!(ResolveRiftboundStoreRequest => zod::object([
    ("eventId", zod::string().min(1).max(30)),
]).strict());
request_schema!(RiftboundEventsRequest => zod::object([
    ("storeIds", zod::array(zod::string().min(1).max(64)).min(1).max(10)),
    ("includeRegistrations", zod::boolean()),
]).strict());

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(resolve_store))
        .routes(routes!(events))
}

#[utoipa::path(post, path = "/api/riftbound/stores/resolve", operation_id = "resolveRiftboundStore", tag = "Riftbound", request_body = ResolveRiftboundStoreRequest, responses((status = 200, body = RiftboundStore)))]
pub async fn resolve_store(
    user: RouteUser,
    State(state): State<AppState>,
    ValidJson(body): ValidJson<ResolveRiftboundStoreRequest>,
) -> Result<Json<RiftboundStore>, AppError> {
    Ok(Json(
        service::resolve_store(&state, &user, &body.event_id).await?,
    ))
}

#[utoipa::path(post, path = "/api/riftbound/events", operation_id = "listRiftboundEvents", tag = "Riftbound", request_body = RiftboundEventsRequest, responses((status = 200, body = Vec<RiftboundPublicEvent>)))]
pub async fn events(
    user: RouteUser,
    State(state): State<AppState>,
    ValidJson(body): ValidJson<RiftboundEventsRequest>,
) -> Result<Json<Vec<RiftboundPublicEvent>>, AppError> {
    Ok(Json(
        service::events(&state, &user, &body.store_ids, body.include_registrations).await?,
    ))
}
