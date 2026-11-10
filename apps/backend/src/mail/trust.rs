//! Ciphertext-only correspondent history; owner-row locking also serializes the first write.

use axum::{Json, extract::State};
use sea_orm::{
    ConnectionTrait, DatabaseBackend, EntityTrait, QuerySelect, Statement, TransactionTrait,
};
use solace_api_types::mail::{MailTrust, PutMailTrustRequest};
use utoipa_axum::{router::OpenApiRouter, routes};

use crate::{
    auth::guard::RouteUser,
    db::entities::user,
    error::AppError,
    http::{extract::ValidJson, zod},
    request_schema,
    state::AppState,
};

request_schema!(PutMailTrustRequest => zod::object([
    ("encryptedTrust", zod::string().min(1).max(1_400_000)),
    ("expectedEncryptedTrust", zod::string().max(1_400_000).nullable()),
]).strict());

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new().routes(routes!(get, put))
}

#[utoipa::path(get, path = "/api/mail/trust", tag = "Mail", operation_id = "getMailTrust", responses((status = 200, body = MailTrust)))]
#[tracing::instrument(skip_all)]
pub async fn get(
    user: RouteUser,
    State(state): State<AppState>,
) -> Result<Json<MailTrust>, AppError> {
    Ok(Json(service::get(&state, &user).await?))
}

#[utoipa::path(put, path = "/api/mail/trust", tag = "Mail", operation_id = "putMailTrust", request_body = PutMailTrustRequest, responses((status = 200, body = MailTrust), (status = 409)))]
#[tracing::instrument(skip_all)]
pub async fn put(
    user: RouteUser,
    State(state): State<AppState>,
    ValidJson(body): ValidJson<PutMailTrustRequest>,
) -> Result<Json<MailTrust>, AppError> {
    Ok(Json(service::put(&state, &user, body).await?))
}

mod service {
    use super::*;
    pub async fn get(state: &AppState, owner: &RouteUser) -> Result<MailTrust, AppError> {
        let encrypted_trust = queries::find(&state.db, &owner.id).await?;
        Ok(MailTrust { encrypted_trust })
    }
    pub async fn put(
        state: &AppState,
        owner: &RouteUser,
        request: PutMailTrustRequest,
    ) -> Result<MailTrust, AppError> {
        let transaction = state.db.begin().await?;
        queries::lock_owner(&transaction, &owner.id).await?;
        let current = queries::find(&transaction, &owner.id).await?;
        if current != request.expected_encrypted_trust {
            return Err(AppError::Conflict(
                "Your saved encryption-key history changed on another device. Review it again."
                    .into(),
            ));
        }
        queries::write(&transaction, &owner.id, request.encrypted_trust.clone()).await?;
        transaction.commit().await?;
        Ok(MailTrust {
            encrypted_trust: Some(request.encrypted_trust),
        })
    }
}

mod queries {
    use super::*;
    pub async fn lock_owner<C: ConnectionTrait>(db: &C, owner_id: &str) -> Result<(), AppError> {
        user::Entity::find_by_id(owner_id.to_owned())
            .select_only()
            .column(user::Column::Id)
            .lock_exclusive()
            .into_tuple::<String>()
            .one(db)
            .await?
            .ok_or_else(|| AppError::NotFound("Account not found.".into()))?;
        Ok(())
    }
    pub async fn find<C: ConnectionTrait>(
        db: &C,
        owner_id: &str,
    ) -> Result<Option<String>, AppError> {
        let row = db
            .query_one_raw(Statement::from_sql_and_values(
                DatabaseBackend::Postgres,
                "SELECT encrypted_trust FROM user_mail_trust WHERE user_id=$1",
                [owner_id.into()],
            ))
            .await?;
        row.map(|row| row.try_get("", "encrypted_trust"))
            .transpose()
            .map_err(Into::into)
    }
    pub async fn write<C: ConnectionTrait>(
        db: &C,
        owner_id: &str,
        ciphertext: String,
    ) -> Result<(), AppError> {
        db.execute_raw(Statement::from_sql_and_values(DatabaseBackend::Postgres,
            "INSERT INTO user_mail_trust (user_id, encrypted_trust) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET encrypted_trust=EXCLUDED.encrypted_trust",
            [owner_id.into(), ciphertext.into()])).await?;
        Ok(())
    }
}
