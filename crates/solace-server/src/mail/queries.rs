//! Mail's database access: linked mailboxes and the `new_mail` push outbox.

use sea_orm::sea_query::extension::postgres::PgExpr;
use sea_orm::sea_query::{Expr, ExprTrait};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, DbErr, EntityTrait, QueryFilter, QuerySelect,
    Set,
};
use serde_json::Value;

use crate::db::entities::{mail_directory_entry, notification_job, user_settings};
use crate::instant;

/// A directory entry owned by a Solace user.
pub struct LinkedMailbox {
    pub user_id: String,
    pub stalwart_account_id: String,
}

/// The linked entry whose unique `column` (Stalwart account id or address) equals `value`.
pub async fn linked_mailbox<C: ConnectionTrait>(
    db: &C,
    column: mail_directory_entry::Column,
    value: &str,
) -> Result<Option<LinkedMailbox>, DbErr> {
    let row: Option<(Option<String>, String)> = mail_directory_entry::Entity::find()
        .select_only()
        .column(mail_directory_entry::Column::UserId)
        .column(mail_directory_entry::Column::StalwartAccountId)
        .filter(column.eq(value))
        .into_tuple()
        .one(db)
        .await?;
    Ok(row.and_then(|(user_id, stalwart_account_id)| {
        Some(LinkedMailbox {
            user_id: user_id?,
            stalwart_account_id,
        })
    }))
}

/// The user's app-notification switch; `None` before their settings exist.
pub async fn push_notifications<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Option<bool>, DbErr> {
    user_settings::Entity::find()
        .select_only()
        .column(user_settings::Column::PushNotifications)
        .filter(user_settings::Column::UserId.eq(user_id))
        .into_tuple()
        .one(db)
        .await
}

/// Whether any `new_mail` push for this email was ever queued, whatever became of it.
pub async fn new_mail_job_exists<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    email_id: &str,
) -> Result<bool, DbErr> {
    let found: Option<String> = notification_job::Entity::find()
        .select_only()
        .column(notification_job::Column::Id)
        .filter(notification_job::Column::UserId.eq(user_id))
        .filter(notification_job::Column::Kind.eq("new_mail"))
        .filter(notification_job::Column::Channel.eq("push"))
        .filter(
            Expr::col(notification_job::Column::Payload)
                .cast_json_field("emailId")
                .eq(email_id),
        )
        .into_tuple()
        .one(db)
        .await?;
    Ok(found.is_some())
}

pub async fn insert_new_mail_job<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    payload: Value,
) -> Result<(), DbErr> {
    notification_job::ActiveModel {
        user_id: Set(user_id.to_owned()),
        kind: Set("new_mail".into()),
        channel: Set("push".into()),
        payload: Set(payload),
        status: Set("pending".into()),
        available_at: Set(instant::now()),
        ..Default::default()
    }
    .insert(db)
    .await
    .map(drop)
}
