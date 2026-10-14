//! `/api/recent-contacts`: one opaque encrypted blob per user, stored byte for byte; `null` before the first upload.

use axum::Json;
use axum::extract::State;
use sea_orm::sea_query::OnConflict;
use sea_orm::{ColumnTrait, ConnectionTrait, EntityTrait, QueryFilter, Set};
use solace_api_types::recent_contacts::{PutRecentContactsRequest, RecentContacts};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::auth::guard::{Auth, RouteUser};
use crate::db::cuid;
use crate::db::entities::user_recent_contacts;
use crate::error::AppError;
use crate::http::extract::ValidJson;
use crate::http::zod;
use crate::instant;
use crate::request_schema;
use crate::state::AppState;

const DEFAULT_ENCRYPTION_KEY_VERSION: i32 = 1;

request_schema!(PutRecentContactsRequest => zod::object([
    ("encryptedContent", zod::string().min(1).max(65_536)),
    ("encryptionKeyVersion", zod::number().int().min(1).max(1000).optional()),
]).strict());

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().routes(routes!(get, put))
}

/// The caller's encrypted recent contacts, or `null` before the first upload.
#[utoipa::path(get, path = "/api/recent-contacts", tag = "Recent contacts", operation_id = "getRecentContacts", responses((status = 200, body = Option<RecentContacts>)))]
#[tracing::instrument(skip_all)]
pub async fn get(
    State(state): State<AppState>,
    auth: Auth,
) -> Result<Json<Option<RecentContacts>>, AppError> {
    let user = auth.require()?;
    Ok(Json(service::get(&state, &user).await?))
}

/// Stores or replaces the caller's blob; an omitted key version keeps the stored one.
#[utoipa::path(put, path = "/api/recent-contacts", tag = "Recent contacts", operation_id = "putRecentContacts", request_body = PutRecentContactsRequest, responses((status = 200, body = RecentContacts)))]
#[tracing::instrument(skip_all)]
pub async fn put(
    State(state): State<AppState>,
    auth: Auth,
    ValidJson(body): ValidJson<PutRecentContactsRequest>,
) -> Result<Json<RecentContacts>, AppError> {
    let user = auth.require()?;
    Ok(Json(service::upsert(&state, &user, body).await?))
}

mod service {
    use super::*;

    pub async fn get(
        state: &AppState,
        user: &RouteUser,
    ) -> Result<Option<RecentContacts>, AppError> {
        Ok(queries::find(&state.db, &user.id).await?.map(record))
    }

    pub async fn upsert(
        state: &AppState,
        user: &RouteUser,
        request: PutRecentContactsRequest,
    ) -> Result<RecentContacts, AppError> {
        Ok(record(queries::upsert(&state.db, &user.id, request).await?))
    }

    fn record(model: user_recent_contacts::Model) -> RecentContacts {
        RecentContacts {
            encrypted_content: model.encrypted_content,
            encryption_key_version: model.encryption_key_version,
            updated_at: instant::iso(model.updated_at),
        }
    }
}

mod queries {
    use super::*;

    pub async fn find<C: ConnectionTrait>(
        db: &C,
        user_id: &str,
    ) -> Result<Option<user_recent_contacts::Model>, sea_orm::DbErr> {
        user_recent_contacts::Entity::find()
            .filter(user_recent_contacts::Column::UserId.eq(user_id))
            .one(db)
            .await
    }

    pub async fn upsert<C: ConnectionTrait>(
        db: &C,
        user_id: &str,
        request: PutRecentContactsRequest,
    ) -> Result<user_recent_contacts::Model, sea_orm::DbErr> {
        use user_recent_contacts::Column;
        let now = instant::now();
        let mut columns = vec![Column::EncryptedContent, Column::UpdatedAt];
        if request.encryption_key_version.is_some() {
            columns.push(Column::EncryptionKeyVersion);
        }
        let row = user_recent_contacts::ActiveModel {
            id: Set(cuid()),
            user_id: Set(user_id.to_owned()),
            encrypted_content: Set(request.encrypted_content),
            encryption_key_version: Set(request
                .encryption_key_version
                .unwrap_or(DEFAULT_ENCRYPTION_KEY_VERSION)),
            created_at: Set(now),
            updated_at: Set(now),
        };
        user_recent_contacts::Entity::insert(row)
            .on_conflict(
                OnConflict::column(Column::UserId)
                    .update_columns(columns)
                    .to_owned(),
            )
            .exec_with_returning(db)
            .await
    }
}
