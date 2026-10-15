//! Invite and address lookups over the `invite`, `user` and `mail_directory_entry` tables.

use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseConnection, EntityTrait, QueryFilter,
    QueryOrder, Set, TransactionTrait,
};

use crate::db::entities::{invite, mail_directory_entry, user};
use crate::instant;

pub async fn directory_entry_exists<C: ConnectionTrait>(
    db: &C,
    email: &str,
) -> Result<bool, sea_orm::DbErr> {
    Ok(mail_directory_entry::Entity::find()
        .filter(mail_directory_entry::Column::Email.eq(email))
        .one(db)
        .await?
        .is_some())
}

/// A pending or claimed invite from this sender to this address.
pub async fn active_invite<C: ConnectionTrait>(
    db: &C,
    invited_by: &str,
    email: &str,
) -> Result<Option<invite::Model>, sea_orm::DbErr> {
    invite::Entity::find()
        .filter(invite::Column::InvitedById.eq(invited_by))
        .filter(invite::Column::Email.eq(email))
        .filter(invite::Column::Status.is_in(["pending", "claimed"]))
        .one(db)
        .await
}

pub async fn insert<C: ConnectionTrait>(
    db: &C,
    invited_by: &str,
    email: String,
    token: String,
    expires_at: sea_orm::prelude::TimeDateTime,
) -> Result<invite::Model, sea_orm::DbErr> {
    invite::ActiveModel {
        invited_by_id: Set(invited_by.to_owned()),
        email: Set(email),
        expires_at: Set(expires_at),
        status: Set("pending".into()),
        token: Set(token),
        ..Default::default()
    }
    .insert(db)
    .await
}

pub async fn sent_by<C: ConnectionTrait>(
    db: &C,
    invited_by: &str,
) -> Result<Vec<invite::Model>, sea_orm::DbErr> {
    invite::Entity::find()
        .filter(invite::Column::InvitedById.eq(invited_by))
        .order_by_desc(invite::Column::CreatedAt)
        .all(db)
        .await
}

pub async fn by_id<C: ConnectionTrait>(
    db: &C,
    id: &str,
) -> Result<Option<invite::Model>, sea_orm::DbErr> {
    invite::Entity::find_by_id(id).one(db).await
}

pub async fn set_status<C: ConnectionTrait>(
    db: &C,
    found: invite::Model,
    status: &str,
) -> Result<invite::Model, sea_orm::DbErr> {
    let mut active: invite::ActiveModel = found.into();
    active.status = Set(status.to_owned());
    active.update(db).await
}

pub async fn by_token<C: ConnectionTrait>(
    db: &C,
    token: &str,
) -> Result<Option<invite::Model>, sea_orm::DbErr> {
    invite::Entity::find()
        .filter(invite::Column::Token.eq(token))
        .one(db)
        .await
}

pub async fn by_token_with_inviter<C: ConnectionTrait>(
    db: &C,
    token: &str,
) -> Result<Option<(invite::Model, Option<user::Model>)>, sea_orm::DbErr> {
    invite::Entity::find()
        .filter(invite::Column::Token.eq(token))
        .find_also_related(user::Entity)
        .one(db)
        .await
}

/// Claims a still-pending invite for `email`; `false` when another claim got there first.
pub async fn claim_pending<C: ConnectionTrait>(
    db: &C,
    id: &str,
    email: &str,
) -> Result<bool, sea_orm::DbErr> {
    let now = instant::now();
    let updated = invite::Entity::update_many()
        .col_expr(invite::Column::Status, "claimed".into())
        .col_expr(invite::Column::ClaimedForEmail, email.into())
        .col_expr(invite::Column::ClaimedAt, now.into())
        .col_expr(invite::Column::UpdatedAt, now.into())
        .filter(invite::Column::Id.eq(id))
        .filter(invite::Column::Status.eq("pending"))
        .exec(db)
        .await?;
    Ok(updated.rows_affected > 0)
}

/// An invite claimed for this address since `since`.
pub async fn claimed_since<C: ConnectionTrait>(
    db: &C,
    email: &str,
    since: sea_orm::prelude::TimeDateTime,
) -> Result<Option<invite::Model>, sea_orm::DbErr> {
    invite::Entity::find()
        .filter(invite::Column::ClaimedForEmail.eq(email))
        .filter(invite::Column::Status.eq("claimed"))
        .filter(invite::Column::ClaimedAt.gte(since))
        .one(db)
        .await
}

/// Accepts the invite and approves the account's mailbox in one transaction.
pub async fn accept(
    db: &DatabaseConnection,
    found: invite::Model,
    user_id: &str,
    email: &str,
) -> Result<(), sea_orm::DbErr> {
    let transaction = db.begin().await?;
    set_status(&transaction, found, "accepted").await?;
    user::Entity::update_many()
        .col_expr(user::Column::MailboxApprovedAt, instant::now().into())
        .filter(user::Column::Id.eq(user_id))
        .filter(user::Column::Email.eq(email))
        .filter(user::Column::MailboxApprovedAt.is_null())
        .exec(&transaction)
        .await?;
    transaction.commit().await
}
