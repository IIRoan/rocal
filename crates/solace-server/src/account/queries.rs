//! Account deletion: the rows that do not cascade from `user`.

use sea_orm::{ColumnTrait, Condition, ConnectionTrait, EntityTrait, QueryFilter};

use crate::db::entities::{calendar_sharing, invite, mail_directory_entry, notification_log, user};

pub async fn user<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Option<user::Model>, sea_orm::DbErr> {
    user::Entity::find_by_id(user_id).one(db).await
}

pub async fn mailbox<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Option<mail_directory_entry::Model>, sea_orm::DbErr> {
    mail_directory_entry::Entity::find()
        .filter(mail_directory_entry::Column::UserId.eq(user_id))
        .one(db)
        .await
}

pub async fn delete_mailbox<C: ConnectionTrait>(db: &C, id: &str) -> Result<(), sea_orm::DbErr> {
    mail_directory_entry::Entity::delete_by_id(id)
        .exec(db)
        .await
        .map(|_| ())
}

/// Shares both ways, reminder logs, invites addressed to or claimed for `emails`, then the user, whose rows cascade.
pub async fn delete_user<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    emails: &[String],
) -> Result<(), sea_orm::DbErr> {
    calendar_sharing::Entity::delete_many()
        .filter(
            Condition::any()
                .add(calendar_sharing::Column::SharedWith.eq(user_id))
                .add(calendar_sharing::Column::SharedBy.eq(user_id)),
        )
        .exec(db)
        .await?;
    notification_log::Entity::delete_many()
        .filter(notification_log::Column::UserId.eq(user_id))
        .exec(db)
        .await?;
    if !emails.is_empty() {
        invite::Entity::delete_many()
            .filter(
                Condition::any()
                    .add(invite::Column::Email.is_in(emails))
                    .add(invite::Column::ClaimedForEmail.is_in(emails)),
            )
            .exec(db)
            .await?;
    }
    user::Entity::delete_by_id(user_id)
        .exec(db)
        .await
        .map(|_| ())
}
