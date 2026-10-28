//! Invitation copies, their participants and the calendars they land in, always scoped to the attendee.

use sea_orm::sea_query::{Condition, Expr, Func};
use sea_orm::{ColumnTrait, ConnectionTrait, EntityTrait, ExprTrait, QueryFilter, QueryOrder};

use crate::db::entities::{calendar, calendar_event, event_participant, mail_directory_entry};
use crate::entity_metadata::MAIL_INVITATION_STAGING_CALENDAR_NAME;

/// `writableOwnedCalendarWhere`: owned, writable, and not the hidden staging calendar.
fn writable_owned(user_id: &str) -> Condition {
    use calendar::Column;
    Condition::all()
        .add(Column::UserId.eq(user_id))
        .add(Column::Kind.eq("owned"))
        .add(Column::IsSyncOnly.eq(false))
        .add(
            Condition::all()
                .add(Column::Name.eq(MAIL_INVITATION_STAGING_CALENDAR_NAME))
                .add(Column::IsVisible.eq(false))
                .not(),
        )
}

pub async fn writable_calendar<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    id: &str,
) -> Result<Option<calendar::Model>, sea_orm::DbErr> {
    calendar::Entity::find()
        .filter(writable_owned(user_id))
        .filter(calendar::Column::Id.eq(id))
        .one(db)
        .await
}

/// The default writable calendar first, then the oldest.
pub async fn first_writable_calendar<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Option<calendar::Model>, sea_orm::DbErr> {
    calendar::Entity::find()
        .filter(writable_owned(user_id))
        .order_by_desc(calendar::Column::IsDefault)
        .order_by_asc(calendar::Column::CreatedAt)
        .one(db)
        .await
}

pub async fn staging_calendar<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Option<calendar::Model>, sea_orm::DbErr> {
    calendar::Entity::find()
        .filter(calendar::Column::UserId.eq(user_id))
        .filter(calendar::Column::Name.eq(MAIL_INVITATION_STAGING_CALENDAR_NAME))
        .filter(calendar::Column::Kind.eq("owned"))
        .filter(calendar::Column::IsSyncOnly.eq(false))
        .one(db)
        .await
}

pub async fn stalwart_account_id<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Option<String>, sea_orm::DbErr> {
    Ok(mail_directory_entry::Entity::find()
        .filter(mail_directory_entry::Column::UserId.eq(user_id))
        .one(db)
        .await?
        .map(|entry| entry.stalwart_account_id))
}

/// The attendee's own copies of these UIDs, outside any subscription.
pub async fn copies<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    external_ids: Vec<String>,
) -> Result<Vec<calendar_event::Model>, sea_orm::DbErr> {
    calendar_event::Entity::find()
        .filter(calendar_event::Column::UserId.eq(user_id))
        .filter(calendar_event::Column::ExternalId.is_in(external_ids))
        .filter(calendar_event::Column::SubscriptionId.is_null())
        .all(db)
        .await
}

/// Marks every copy of the UID cancelled, returning how many there were.
pub async fn cancel<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    external_id: &str,
    now: time::PrimitiveDateTime,
) -> Result<u64, sea_orm::DbErr> {
    Ok(calendar_event::Entity::update_many()
        .col_expr(calendar_event::Column::IsCancelled, Expr::value(true))
        .col_expr(calendar_event::Column::SyncedAt, Expr::value(now))
        .col_expr(calendar_event::Column::UpdatedAt, Expr::value(now))
        .filter(calendar_event::Column::UserId.eq(user_id))
        .filter(calendar_event::Column::ExternalId.eq(external_id))
        .filter(calendar_event::Column::SubscriptionId.is_null())
        .exec(db)
        .await?
        .rows_affected)
}

/// The attendee's own answer on the copy, matching the address case-insensitively.
pub async fn set_status_by_email<C: ConnectionTrait>(
    db: &C,
    event_id: &str,
    email: &str,
    status: &str,
    now: time::PrimitiveDateTime,
) -> Result<(), sea_orm::DbErr> {
    event_participant::Entity::update_many()
        .col_expr(event_participant::Column::Status, Expr::value(status))
        .col_expr(event_participant::Column::UpdatedAt, Expr::value(now))
        .filter(event_participant::Column::EventId.eq(event_id))
        .filter(Func::lower(Expr::col(event_participant::Column::Email)).eq(email.to_lowercase()))
        .exec(db)
        .await
        .map(|_| ())
}
