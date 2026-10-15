//! Share-link state on the calendar row, and the checks around it.

use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, EntityTrait, IntoActiveModel, PaginatorTrait,
    QueryFilter, Set,
};

use sea_orm::QueryOrder;

use crate::db::entities::{calendar, calendar_event};

pub async fn find<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    id: &str,
) -> Result<Option<calendar::Model>, sea_orm::DbErr> {
    calendar::Entity::find()
        .filter(calendar::Column::Id.eq(id))
        .filter(calendar::Column::UserId.eq(user_id))
        .one(db)
        .await
}

pub async fn count_encrypted_events<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    calendar_id: &str,
) -> Result<u64, sea_orm::DbErr> {
    calendar_event::Entity::find()
        .filter(calendar_event::Column::CalendarId.eq(calendar_id))
        .filter(calendar_event::Column::UserId.eq(user_id))
        .filter(calendar_event::Column::EncryptionState.eq("encrypted"))
        .count(db)
        .await
}

/// Share tokens are unique across every calendar: the token is the feed's only credential.
pub async fn token_taken<C: ConnectionTrait>(db: &C, token: &str) -> Result<bool, sea_orm::DbErr> {
    Ok(calendar::Entity::find()
        .filter(calendar::Column::IcsShareToken.eq(token))
        .one(db)
        .await?
        .is_some())
}

pub async fn set_share<C: ConnectionTrait>(
    db: &C,
    row: calendar::Model,
    enabled: bool,
    token: Option<String>,
) -> Result<calendar::Model, sea_orm::DbErr> {
    let mut active = row.into_active_model();
    active.ics_share_enabled = Set(enabled);
    active.ics_share_token = Set(token);
    active.update(db).await
}

/// The calendar an enabled share token unlocks.
pub async fn shared<C: ConnectionTrait>(
    db: &C,
    token: &str,
) -> Result<Option<calendar::Model>, sea_orm::DbErr> {
    calendar::Entity::find()
        .filter(calendar::Column::IcsShareToken.eq(token))
        .filter(calendar::Column::IcsShareEnabled.eq(true))
        .one(db)
        .await
}

/// The calendar's events without detached occurrences, by start.
pub async fn top_level_events<C: ConnectionTrait>(
    db: &C,
    calendar_id: &str,
) -> Result<Vec<calendar_event::Model>, sea_orm::DbErr> {
    calendar_event::Entity::find()
        .filter(calendar_event::Column::CalendarId.eq(calendar_id))
        .filter(calendar_event::Column::ParentEventId.is_null())
        .order_by_asc(calendar_event::Column::Start)
        .all(db)
        .await
}
