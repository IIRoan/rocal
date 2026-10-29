//! Calendar rows, scoped to their owner, and the event writes calendar changes cause.

use sea_orm::sea_query::{Condition, Expr};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, EntityTrait, IntoActiveModel, ModelTrait,
    PaginatorTrait, QueryFilter, QueryOrder, Set,
};

use crate::db::entities::{calendar, calendar_event};
use crate::entity_metadata::MAIL_INVITATION_STAGING_CALENDAR_NAME;
use crate::events::queries as events;
use crate::instant;

/// `excludeInvitationStagingCalendarWhere`: not the hidden `Invitations` calendar.
fn not_staging() -> Condition {
    Condition::all()
        .add(
            Condition::all()
                .add(calendar::Column::Name.eq(MAIL_INVITATION_STAGING_CALENDAR_NAME))
                .add(calendar::Column::IsVisible.eq(false)),
        )
        .not()
}

pub async fn owned_by<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Vec<calendar::Model>, sea_orm::DbErr> {
    calendar::Entity::find()
        .filter(calendar::Column::UserId.eq(user_id))
        .order_by_desc(calendar::Column::IsDefault)
        .order_by_asc(calendar::Column::Name)
        .all(db)
        .await
}

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

pub async fn insert<C: ConnectionTrait>(
    db: &C,
    row: calendar::ActiveModel,
) -> Result<calendar::Model, sea_orm::DbErr> {
    row.insert(db).await
}

pub async fn update<C: ConnectionTrait>(
    db: &C,
    row: calendar::ActiveModel,
) -> Result<calendar::Model, sea_orm::DbErr> {
    row.update(db).await
}

/// Clears the default flag on the user's other calendars.
pub async fn clear_default<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    except: Option<&str>,
) -> Result<(), sea_orm::DbErr> {
    let mut query = calendar::Entity::update_many()
        .col_expr(calendar::Column::IsDefault, Expr::value(false))
        .col_expr(calendar::Column::UpdatedAt, Expr::value(instant::now()))
        .filter(calendar::Column::UserId.eq(user_id))
        .filter(calendar::Column::IsDefault.eq(true));
    if let Some(except) = except {
        query = query.filter(calendar::Column::Id.ne(except));
    }
    query.exec(db).await.map(|_| ())
}

/// The user's owned calendars, the staging calendar aside.
pub async fn count_editable<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<u64, sea_orm::DbErr> {
    calendar::Entity::find()
        .filter(calendar::Column::UserId.eq(user_id))
        .filter(calendar::Column::Kind.eq("owned"))
        .filter(not_staging())
        .count(db)
        .await
}

pub async fn count_events<C: ConnectionTrait>(
    db: &C,
    calendar_id: &str,
) -> Result<u64, sea_orm::DbErr> {
    calendar_event::Entity::find()
        .filter(calendar_event::Column::CalendarId.eq(calendar_id))
        .count(db)
        .await
}

pub async fn move_events<C: ConnectionTrait>(
    db: &C,
    from: &str,
    to: &calendar::Model,
) -> Result<(), sea_orm::DbErr> {
    calendar_event::Entity::update_many()
        .col_expr(
            calendar_event::Column::CalendarId,
            Expr::value(to.id.clone()),
        )
        .col_expr(
            calendar_event::Column::StalwartCalendarId,
            Expr::value(to.stalwart_calendar_id.clone()),
        )
        .col_expr(
            calendar_event::Column::UpdatedAt,
            Expr::value(instant::now()),
        )
        .filter(calendar_event::Column::CalendarId.eq(from))
        .exec(db)
        .await
        .map(|_| ())
}

/// The calendar's events with their recurrence exceptions.
pub async fn delete_events<C: ConnectionTrait>(
    db: &C,
    calendar_id: &str,
) -> Result<(), sea_orm::DbErr> {
    events::delete_exceptions_of(
        db,
        events::ids_where(Condition::all().add(calendar_event::Column::CalendarId.eq(calendar_id))),
    )
    .await?;
    calendar_event::Entity::delete_many()
        .filter(calendar_event::Column::CalendarId.eq(calendar_id))
        .exec(db)
        .await
        .map(|_| ())
}

/// The oldest regular calendar left, to become the default.
pub async fn next_default<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    except: &str,
) -> Result<Option<calendar::Model>, sea_orm::DbErr> {
    calendar::Entity::find()
        .filter(calendar::Column::UserId.eq(user_id))
        .filter(calendar::Column::Id.ne(except))
        .filter(calendar::Column::Kind.eq("owned"))
        .filter(calendar::Column::IsSyncOnly.eq(false))
        .filter(not_staging())
        .order_by_asc(calendar::Column::CreatedAt)
        .one(db)
        .await
}

pub async fn make_default<C: ConnectionTrait>(
    db: &C,
    row: calendar::Model,
) -> Result<(), sea_orm::DbErr> {
    let mut active = row.into_active_model();
    active.is_default = Set(true);
    active.update(db).await.map(|_| ())
}

pub async fn delete<C: ConnectionTrait>(
    db: &C,
    row: calendar::Model,
) -> Result<(), sea_orm::DbErr> {
    row.delete(db).await.map(|_| ())
}
