//! Category rows, scoped to their owner, with the usage counts the list shows.

use std::collections::HashMap;

use sea_orm::sea_query::{Expr, Func};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, EntityTrait, FromQueryResult, ModelTrait,
    QueryFilter, QueryOrder, QuerySelect,
};

use crate::db::entities::{calendar_event, event_category};
use crate::instant;

pub async fn active<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Vec<event_category::Model>, sea_orm::DbErr> {
    event_category::Entity::find()
        .filter(event_category::Column::UserId.eq(user_id))
        .filter(event_category::Column::IsActive.eq(true))
        .order_by_asc(event_category::Column::Name)
        .all(db)
        .await
}

#[derive(FromQueryResult)]
struct Usage {
    category_id: String,
    count: i64,
}

/// How many events reference each category.
pub async fn usage_counts<C: ConnectionTrait>(
    db: &C,
    category_ids: Vec<String>,
) -> Result<HashMap<String, i64>, sea_orm::DbErr> {
    if category_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let rows = calendar_event::Entity::find()
        .select_only()
        .column(calendar_event::Column::CategoryId)
        .column_as(
            Expr::expr(Func::count(Expr::col(calendar_event::Column::Id))),
            "count",
        )
        .filter(calendar_event::Column::CategoryId.is_in(category_ids))
        .group_by(calendar_event::Column::CategoryId)
        .into_model::<Usage>()
        .all(db)
        .await?;
    Ok(rows
        .into_iter()
        .map(|row| (row.category_id, row.count))
        .collect())
}

pub async fn find<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    id: &str,
) -> Result<Option<event_category::Model>, sea_orm::DbErr> {
    event_category::Entity::find()
        .filter(event_category::Column::Id.eq(id))
        .filter(event_category::Column::UserId.eq(user_id))
        .one(db)
        .await
}

pub async fn insert<C: ConnectionTrait>(
    db: &C,
    row: event_category::ActiveModel,
) -> Result<event_category::Model, sea_orm::DbErr> {
    row.insert(db).await
}

pub async fn update<C: ConnectionTrait>(
    db: &C,
    row: event_category::ActiveModel,
) -> Result<event_category::Model, sea_orm::DbErr> {
    row.update(db).await
}

/// Removes the category from the owner's events, then deletes it.
pub async fn delete<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    row: event_category::Model,
) -> Result<(), sea_orm::DbErr> {
    calendar_event::Entity::update_many()
        .col_expr(
            calendar_event::Column::CategoryId,
            Expr::value(Option::<String>::None),
        )
        .col_expr(
            calendar_event::Column::UpdatedAt,
            Expr::value(instant::now()),
        )
        .filter(calendar_event::Column::CategoryId.eq(row.id.as_str()))
        .filter(calendar_event::Column::UserId.eq(user_id))
        .exec(db)
        .await?;
    row.delete(db).await.map(|_| ())
}
