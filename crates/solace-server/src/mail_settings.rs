//! `/api/mail-settings`: the recent-contacts blob contract for the mail settings, stored byte for byte; `null` before the first upload.

use axum::Json;
use axum::extract::State;
use sea_orm::sea_query::OnConflict;
use sea_orm::{ColumnTrait, ConnectionTrait, EntityTrait, QueryFilter, Set};
use solace_api_types::mail_settings::{MailSettings, PutMailSettingsRequest};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::auth::guard::{Auth, RouteUser};
use crate::db::cuid;
use crate::db::entities::user_mail_settings;
use crate::error::AppError;
use crate::http::extract::ValidJson;
use crate::instant;
use crate::recent_contacts::{DEFAULT_ENCRYPTION_KEY_VERSION, blob_upload_schema};
use crate::request_schema;
use crate::state::AppState;

request_schema!(PutMailSettingsRequest => blob_upload_schema());

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().routes(routes!(get, put))
}

/// The caller's encrypted mail settings, or `null` before the first upload.
#[utoipa::path(get, path = "/api/mail-settings", tag = "Mail settings", operation_id = "getMailSettings", responses((status = 200, body = Option<MailSettings>)))]
#[tracing::instrument(skip_all)]
pub async fn get(
    State(state): State<AppState>,
    auth: Auth,
) -> Result<Json<Option<MailSettings>>, AppError> {
    let user = auth.require()?;
    Ok(Json(service::get(&state, &user).await?))
}

/// Stores or replaces the caller's blob; an omitted key version keeps the stored one.
#[utoipa::path(put, path = "/api/mail-settings", tag = "Mail settings", operation_id = "putMailSettings", request_body = PutMailSettingsRequest, responses((status = 200, body = MailSettings)))]
#[tracing::instrument(skip_all)]
pub async fn put(
    State(state): State<AppState>,
    auth: Auth,
    ValidJson(body): ValidJson<PutMailSettingsRequest>,
) -> Result<Json<MailSettings>, AppError> {
    let user = auth.require()?;
    Ok(Json(service::upsert(&state, &user, body).await?))
}

mod service {
    use super::*;

    pub async fn get(state: &AppState, user: &RouteUser) -> Result<Option<MailSettings>, AppError> {
        Ok(queries::find(&state.db, &user.id).await?.map(record))
    }

    pub async fn upsert(
        state: &AppState,
        user: &RouteUser,
        request: PutMailSettingsRequest,
    ) -> Result<MailSettings, AppError> {
        Ok(record(queries::upsert(&state.db, &user.id, request).await?))
    }

    fn record(model: user_mail_settings::Model) -> MailSettings {
        MailSettings {
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
    ) -> Result<Option<user_mail_settings::Model>, sea_orm::DbErr> {
        user_mail_settings::Entity::find()
            .filter(user_mail_settings::Column::UserId.eq(user_id))
            .one(db)
            .await
    }

    pub async fn upsert<C: ConnectionTrait>(
        db: &C,
        user_id: &str,
        request: PutMailSettingsRequest,
    ) -> Result<user_mail_settings::Model, sea_orm::DbErr> {
        use user_mail_settings::Column;
        let now = instant::now();
        let mut columns = vec![Column::EncryptedContent, Column::UpdatedAt];
        if request.encryption_key_version.is_some() {
            columns.push(Column::EncryptionKeyVersion);
        }
        let row = user_mail_settings::ActiveModel {
            id: Set(cuid()),
            user_id: Set(user_id.to_owned()),
            encrypted_content: Set(request.encrypted_content),
            encryption_key_version: Set(request
                .encryption_key_version
                .unwrap_or(DEFAULT_ENCRYPTION_KEY_VERSION)),
            created_at: Set(now),
            updated_at: Set(now),
        };
        user_mail_settings::Entity::insert(row)
            .on_conflict(
                OnConflict::column(Column::UserId)
                    .update_columns(columns)
                    .to_owned(),
            )
            .exec_with_returning(db)
            .await
    }
}
