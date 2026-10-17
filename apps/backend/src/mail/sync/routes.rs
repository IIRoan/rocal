//! `GET /api/mail/sync`.

use axum::Json;
use axum::extract::State;
use solace_api_types::mail::{MailSyncQuery, MailSyncResult};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::auth::guard::RouteUser;
use crate::error::AppError;
use crate::http::extract::ValidQuery;
use crate::http::zod;
use crate::request_schema;
use crate::state::AppState;

request_schema!(MailSyncQuery => zod::object([("accountId", zod::string().min(1).max(128))]).strict());

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().routes(routes!(sync))
}

/// JMAP Email, Mailbox and Thread changes for the caller's own mailbox, read with server-side credentials.
#[utoipa::path(get, path = "/api/mail/sync", operation_id = "syncMail", tag = "Mail", params(("accountId" = String, Query)), responses((status = 200, body = MailSyncResult)))]
#[tracing::instrument(skip_all)]
pub async fn sync(
    State(state): State<AppState>,
    user: RouteUser,
    ValidQuery(query): ValidQuery<MailSyncQuery>,
) -> Result<Json<MailSyncResult>, AppError> {
    Ok(Json(
        super::sync_for_user(&state, &user.id, &query.account_id.0).await?,
    ))
}
