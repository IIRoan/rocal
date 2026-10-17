//! Series rows and their recurrence exceptions, scoped to the owner.

use sea_orm::{ActiveModelTrait, ColumnTrait, ConnectionTrait, EntityTrait, QueryFilter, Set};

use crate::db::entities::{calendar_event, recurrence_exception};

/// The owner's event with a recurrence rule.
pub async fn series<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    id: &str,
) -> Result<Option<calendar_event::Model>, sea_orm::DbErr> {
    calendar_event::Entity::find()
        .filter(calendar_event::Column::Id.eq(id))
        .filter(calendar_event::Column::UserId.eq(user_id))
        .filter(calendar_event::Column::Recurrence.is_not_null())
        .one(db)
        .await
}

pub async fn exception<C: ConnectionTrait>(
    db: &C,
    parent_event_id: &str,
    date: time::PrimitiveDateTime,
) -> Result<Option<recurrence_exception::Model>, sea_orm::DbErr> {
    recurrence_exception::Entity::find()
        .filter(recurrence_exception::Column::ParentEventId.eq(parent_event_id))
        .filter(recurrence_exception::Column::ExceptionDate.eq(date))
        .one(db)
        .await
}

pub async fn insert_exception<C: ConnectionTrait>(
    db: &C,
    parent_event_id: &str,
    date: time::PrimitiveDateTime,
    kind: &str,
    modified_event_id: Option<String>,
) -> Result<(), sea_orm::DbErr> {
    recurrence_exception::ActiveModel {
        parent_event_id: Set(parent_event_id.to_owned()),
        exception_date: Set(date),
        r#type: Set(kind.to_owned()),
        modified_event_id: Set(modified_event_id),
        ..Default::default()
    }
    .insert(db)
    .await
    .map(|_| ())
}

pub async fn mark_exception_deleted<C: ConnectionTrait>(
    db: &C,
    row: recurrence_exception::Model,
) -> Result<(), sea_orm::DbErr> {
    let mut row: recurrence_exception::ActiveModel = row.into();
    row.r#type = Set("deleted".into());
    row.update(db).await.map(|_| ())
}

/// The series row, its exceptions and its direct children (detached occurrences and split halves).
pub async fn delete_series<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    id: &str,
) -> Result<(), sea_orm::DbErr> {
    recurrence_exception::Entity::delete_many()
        .filter(recurrence_exception::Column::ParentEventId.eq(id))
        .exec(db)
        .await?;
    calendar_event::Entity::delete_many()
        .filter(calendar_event::Column::ParentEventId.eq(id))
        .filter(calendar_event::Column::UserId.eq(user_id))
        .exec(db)
        .await?;
    calendar_event::Entity::delete_many()
        .filter(calendar_event::Column::Id.eq(id))
        .filter(calendar_event::Column::UserId.eq(user_id))
        .exec(db)
        .await
        .map(|_| ())
}
