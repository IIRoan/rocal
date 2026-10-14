//! `/api/invites`: the sender's routes.

use axum::Json;
use axum::extract::{Path, State};
use solace_api_types::account::{CreateInviteRequest, Invite, InviteList};
use solace_api_types::auth::SuccessFlag;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::addresses;
use crate::auth::guard::Auth;
use crate::error::AppError;
use crate::http::extract::ValidJson;
use crate::http::zod;
use crate::request_schema;
use crate::state::AppState;

request_schema!(CreateInviteRequest => zod::object([(
    "email",
    zod::string().min(1).max(320).refine(
        |value| !value.as_str().is_some_and(|email| addresses::is_reserved_system_email(email, None)),
        "Cannot send an invite to a reserved system email address.",
        &[],
    ),
)]).strict());

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(create, list))
        .routes(routes!(revoke))
}

/// Invites someone outside Solace and mails them the link; a failed mail is a warning, not an error.
#[utoipa::path(post, path = "/api/invites", tag = "Invites", request_body = CreateInviteRequest, responses((status = 200, body = Invite)))]
#[tracing::instrument(skip_all)]
pub async fn create(
    State(state): State<AppState>,
    auth: Auth,
    ValidJson(body): ValidJson<CreateInviteRequest>,
) -> Result<Json<Invite>, AppError> {
    let user = auth.require()?;
    Ok(Json(service::create(&state, &user, body).await?))
}

/// The caller's invites, newest first.
#[utoipa::path(get, path = "/api/invites", tag = "Invites", responses((status = 200, body = InviteList)))]
#[tracing::instrument(skip_all)]
pub async fn list(State(state): State<AppState>, auth: Auth) -> Result<Json<InviteList>, AppError> {
    let user = auth.require()?;
    Ok(Json(service::list(&state, &user).await?))
}

/// Revokes one of the caller's invites unless it was already accepted.
#[utoipa::path(delete, path = "/api/invites/{id}", tag = "Invites", params(("id" = String, Path)), responses((status = 200, body = SuccessFlag)))]
#[tracing::instrument(skip_all)]
pub async fn revoke(
    State(state): State<AppState>,
    Path(id): Path<String>,
    auth: Auth,
) -> Result<Json<SuccessFlag>, AppError> {
    let user = auth.require()?;
    Ok(Json(service::revoke(&state, &user, &id).await?))
}
