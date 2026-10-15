//! `/api/events/invitations/import-ics` and `decline-ics`: decrypted mailed invitations the client hands over.

use axum::Json;
use axum::extract::State;
use solace_api_types::events::{
    DeclineInvitationRequest, ImportInvitationRequest, InvitationDeclined, InvitationImportSummary,
};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::auth::guard::Auth;
use crate::error::AppError;
use crate::http::extract::ValidJson;
use crate::http::schemas::invitation_import_status_schema;
use crate::http::zod;
use crate::request_schema;
use crate::state::AppState;

const MAX_ICS_LENGTH: usize = 1_048_576;

request_schema!(ImportInvitationRequest => zod::object([
    ("icsContent", zod::string().min(1).max(MAX_ICS_LENGTH)),
    ("status", invitation_import_status_schema().optional()),
    ("calendarId", zod::string().min(1).max(64).optional()),
    ("encryption", zod::array(zod::object([
        ("externalId", zod::string().min(1).max(512)),
        ("encryptedContent", zod::string().min(1)),
        ("blindIndexTokens", zod::array(zod::string().min(1)).optional()),
        ("encryptionKeyVersion", zod::number().int().gte(1.0).optional()),
    ]).strict()).optional()),
])
.strict());

request_schema!(DeclineInvitationRequest => zod::object([
    ("icsContent", zod::string().min(1).max(MAX_ICS_LENGTH)),
])
.strict());

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(import_ics))
        .routes(routes!(decline_ics))
}

/// Imports a decrypted mailed invitation: staged in the hidden Invitations calendar, or accepted onto a writable one.
#[utoipa::path(post, path = "/api/events/invitations/import-ics", operation_id = "importInvitationIcs", tag = "Events", request_body = ImportInvitationRequest, responses((status = 200, body = InvitationImportSummary)))]
#[tracing::instrument(skip_all)]
pub async fn import_ics(
    State(state): State<AppState>,
    auth: Auth,
    ValidJson(body): ValidJson<ImportInvitationRequest>,
) -> Result<Json<InvitationImportSummary>, AppError> {
    let user = auth.require()?;
    Ok(Json(service::import_ics(&state, &user.id, body).await?))
}

/// Declines a mailed invitation without importing it: replies to the organizer and keeps a hidden declined copy.
#[utoipa::path(post, path = "/api/events/invitations/decline-ics", operation_id = "declineInvitationIcs", tag = "Events", request_body = DeclineInvitationRequest, responses((status = 200, body = InvitationDeclined)))]
#[tracing::instrument(skip_all)]
pub async fn decline_ics(
    State(state): State<AppState>,
    auth: Auth,
    ValidJson(body): ValidJson<DeclineInvitationRequest>,
) -> Result<Json<InvitationDeclined>, AppError> {
    let user = auth.require()?;
    Ok(Json(
        service::decline_ics(&state, &user.id, &body.ics_content).await?,
    ))
}
