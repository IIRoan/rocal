//! The avatar columns of `user`: the owner lookup by email, the row lock every avatar change takes, and its writes.

use sea_orm::sea_query::Query;
use sea_orm::{
    ColumnTrait, Condition, ConnectionTrait, EntityTrait, PaginatorTrait, QueryFilter, QuerySelect,
};

use crate::db::entities::{mail_directory_entry, user};
use crate::instant;

#[derive(Debug, sea_orm::FromQueryResult)]
pub struct AvatarOwner {
    pub avatar_id: String,
}

/// A user whose own address or mailbox alias is `email` and who has an uploaded picture.
pub async fn avatar_owner<C: ConnectionTrait>(
    db: &C,
    email: &str,
) -> Result<Option<AvatarOwner>, sea_orm::DbErr> {
    let alias_owner = Query::select()
        .column(mail_directory_entry::Column::UserId)
        .from(mail_directory_entry::Entity)
        .and_where(mail_directory_entry::Column::Email.eq(email))
        .to_owned();
    user::Entity::find()
        .select_only()
        .column(user::Column::AvatarId)
        .filter(
            Condition::any()
                .add(user::Column::Email.eq(email))
                .add(user::Column::Id.in_subquery(alias_owner)),
        )
        .filter(user::Column::AvatarId.is_not_null())
        .into_model::<AvatarOwner>()
        .one(db)
        .await
}

/// Only ids still attached to an account resolve, so replaced pictures stop serving even if an object lingers.
pub async fn avatar_attached<C: ConnectionTrait>(
    db: &C,
    avatar_id: &str,
) -> Result<bool, sea_orm::DbErr> {
    Ok(user::Entity::find()
        .filter(user::Column::AvatarId.eq(avatar_id))
        .count(db)
        .await?
        > 0)
}

/// `lockAvatarUser`: every avatar change, including its bucket writes and cleanup, holds this row lock.
pub async fn lock<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<user::Model, sea_orm::DbErr> {
    user::Entity::update_many()
        .col_expr(user::Column::UpdatedAt, instant::now().into())
        .filter(user::Column::Id.eq(user_id))
        .exec_with_returning(db)
        .await?
        .into_iter()
        .next()
        .ok_or_else(|| sea_orm::DbErr::RecordNotFound("user".into()))
}

pub async fn set_pending<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    pending: Option<&str>,
) -> Result<(), sea_orm::DbErr> {
    user::Entity::update_many()
        .col_expr(
            user::Column::PendingAvatarId,
            pending.map(str::to_owned).into(),
        )
        .col_expr(user::Column::UpdatedAt, instant::now().into())
        .filter(user::Column::Id.eq(user_id))
        .exec(db)
        .await
        .map(|_| ())
}

/// Switches to the stored upload and remembers the previous id for cleanup.
pub async fn attach_upload<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    avatar_id: &str,
    image: &str,
    retired: Option<String>,
) -> Result<(), sea_orm::DbErr> {
    user::Entity::update_many()
        .col_expr(user::Column::AvatarId, Some(avatar_id.to_owned()).into())
        .col_expr(user::Column::Image, Some(image.to_owned()).into())
        .col_expr(user::Column::PendingAvatarId, retired.into())
        .col_expr(user::Column::UpdatedAt, instant::now().into())
        .filter(user::Column::Id.eq(user_id))
        .exec(db)
        .await
        .map(|_| ())
}

/// The profile update itself; with `retired`, the uploaded picture is detached and queued for deletion.
pub async fn update_profile<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    name: Option<String>,
    image: Option<String>,
    retired: Option<Option<String>>,
) -> Result<(), sea_orm::DbErr> {
    let mut update = user::Entity::update_many()
        .col_expr(user::Column::Image, image.into())
        .col_expr(user::Column::UpdatedAt, instant::now().into())
        .filter(user::Column::Id.eq(user_id));
    if let Some(name) = name {
        update = update.col_expr(user::Column::Name, name.into());
    }
    if let Some(retired) = retired {
        update = update
            .col_expr(user::Column::AvatarId, Option::<String>::None.into())
            .col_expr(user::Column::PendingAvatarId, retired.into());
    }
    update.exec(db).await.map(|_| ())
}
