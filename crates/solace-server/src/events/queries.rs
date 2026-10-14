//! Event rows and their relations, always scoped to the owner; relations load in batches by event id.

use std::collections::HashMap;

use sea_orm::sea_query::{Condition, Expr};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, EntityTrait, ExprTrait, PaginatorTrait,
    QueryFilter, QueryOrder, QuerySelect, QueryTrait, Set,
};

use super::participants::Resolved;
use crate::db::entities::{
    calendar, calendar_event, event_category, event_notification, event_participant,
    mail_directory_entry, notification_log, recurrence_exception, user, user_settings,
};

pub async fn user<C: ConnectionTrait>(
    db: &C,
    id: &str,
) -> Result<Option<user::Model>, sea_orm::DbErr> {
    user::Entity::find_by_id(id).one(db).await
}

pub async fn users_with_emails<C: ConnectionTrait>(
    db: &C,
    emails: Vec<String>,
) -> Result<Vec<user::Model>, sea_orm::DbErr> {
    user::Entity::find()
        .filter(user::Column::Email.is_in(emails))
        .all(db)
        .await
}

pub async fn directory_entries<C: ConnectionTrait>(
    db: &C,
    emails: Vec<String>,
) -> Result<Vec<mail_directory_entry::Model>, sea_orm::DbErr> {
    mail_directory_entry::Entity::find()
        .filter(mail_directory_entry::Column::Email.is_in(emails))
        .all(db)
        .await
}

pub async fn settings<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Option<user_settings::Model>, sea_orm::DbErr> {
    user_settings::Entity::find()
        .filter(user_settings::Column::UserId.eq(user_id))
        .one(db)
        .await
}

pub async fn find<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    id: &str,
) -> Result<Option<calendar_event::Model>, sea_orm::DbErr> {
    calendar_event::Entity::find()
        .filter(calendar_event::Column::Id.eq(id))
        .filter(calendar_event::Column::UserId.eq(user_id))
        .one(db)
        .await
}

pub async fn find_many<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    ids: Vec<String>,
) -> Result<Vec<calendar_event::Model>, sea_orm::DbErr> {
    calendar_event::Entity::find()
        .filter(calendar_event::Column::Id.is_in(ids))
        .filter(calendar_event::Column::UserId.eq(user_id))
        .all(db)
        .await
}

/// A mailed invitation's local copy, outside any subscription.
pub async fn by_external_id<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    external_id: &str,
) -> Result<Option<calendar_event::Model>, sea_orm::DbErr> {
    calendar_event::Entity::find()
        .filter(calendar_event::Column::UserId.eq(user_id))
        .filter(calendar_event::Column::ExternalId.eq(external_id))
        .filter(calendar_event::Column::SubscriptionId.is_null())
        .one(db)
        .await
}

/// Single events (not series, not detached occurrences) that overlap `[start, end]`.
pub async fn regular_in_range<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    start: time::PrimitiveDateTime,
    end: time::PrimitiveDateTime,
) -> Result<Vec<calendar_event::Model>, sea_orm::DbErr> {
    use calendar_event::Column;
    calendar_event::Entity::find()
        .filter(Column::UserId.eq(user_id))
        .filter(Column::Recurrence.is_null())
        .filter(Column::ParentEventId.is_null())
        .filter(
            Condition::any()
                .add(Column::Start.gte(start).and(Column::Start.lte(end)))
                .add(Column::End.gte(start).and(Column::End.lte(end)))
                .add(Column::Start.lte(start).and(Column::End.gte(end))),
        )
        .all(db)
        .await
}

pub async fn recurring<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Vec<calendar_event::Model>, sea_orm::DbErr> {
    calendar_event::Entity::find()
        .filter(calendar_event::Column::UserId.eq(user_id))
        .filter(calendar_event::Column::Recurrence.is_not_null())
        .all(db)
        .await
}

/// Detached occurrences of a series that start in `[start, end]`.
pub async fn modified_in_range<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    start: time::PrimitiveDateTime,
    end: time::PrimitiveDateTime,
) -> Result<Vec<calendar_event::Model>, sea_orm::DbErr> {
    use calendar_event::Column;
    calendar_event::Entity::find()
        .filter(Column::UserId.eq(user_id))
        .filter(Column::ParentEventId.is_not_null())
        .filter(Column::Recurrence.is_null())
        .filter(Column::Start.gte(start))
        .filter(Column::Start.lte(end))
        .all(db)
        .await
}

pub async fn calendars_by_id<C: ConnectionTrait>(
    db: &C,
    ids: Vec<String>,
) -> Result<HashMap<String, calendar::Model>, sea_orm::DbErr> {
    Ok(calendar::Entity::find()
        .filter(calendar::Column::Id.is_in(ids))
        .all(db)
        .await?
        .into_iter()
        .map(|row| (row.id.clone(), row))
        .collect())
}

pub async fn categories_by_id<C: ConnectionTrait>(
    db: &C,
    ids: Vec<String>,
) -> Result<HashMap<String, event_category::Model>, sea_orm::DbErr> {
    Ok(event_category::Entity::find()
        .filter(event_category::Column::Id.is_in(ids))
        .all(db)
        .await?
        .into_iter()
        .map(|row| (row.id.clone(), row))
        .collect())
}

pub async fn participants_with_users<C: ConnectionTrait>(
    db: &C,
    event_ids: &[String],
) -> Result<Vec<(event_participant::Model, Option<user::Model>)>, sea_orm::DbErr> {
    event_participant::Entity::find()
        .filter(event_participant::Column::EventId.is_in(event_ids.to_vec()))
        .find_also_related(user::Entity)
        .all(db)
        .await
}

pub async fn exceptions<C: ConnectionTrait>(
    db: &C,
    event_ids: Vec<String>,
) -> Result<Vec<recurrence_exception::Model>, sea_orm::DbErr> {
    recurrence_exception::Entity::find()
        .filter(recurrence_exception::Column::ParentEventId.is_in(event_ids))
        .all(db)
        .await
}

pub async fn active_categories<C: ConnectionTrait>(
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

pub async fn active_category<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    id: &str,
) -> Result<Option<event_category::Model>, sea_orm::DbErr> {
    event_category::Entity::find()
        .filter(event_category::Column::Id.eq(id))
        .filter(event_category::Column::UserId.eq(user_id))
        .filter(event_category::Column::IsActive.eq(true))
        .one(db)
        .await
}

pub async fn calendar<C: ConnectionTrait>(
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

pub async fn calendars_of<C: ConnectionTrait>(
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

pub async fn insert<C: ConnectionTrait>(
    db: &C,
    row: calendar_event::ActiveModel,
) -> Result<calendar_event::Model, sea_orm::DbErr> {
    row.insert(db).await
}

/// Updates the row only if nobody changed it since `seen`, the optimistic lock Prisma's `where: { updatedAt }` gave.
pub async fn update_if_unchanged<C: ConnectionTrait>(
    db: &C,
    row: calendar_event::ActiveModel,
    id: &str,
    seen: time::PrimitiveDateTime,
) -> Result<Option<calendar_event::Model>, sea_orm::DbErr> {
    let updated = calendar_event::Entity::update_many()
        .set(row)
        .filter(calendar_event::Column::Id.eq(id))
        .filter(calendar_event::Column::UpdatedAt.eq(seen))
        .exec_with_returning(db)
        .await?;
    Ok(updated.into_iter().next())
}

pub async fn update<C: ConnectionTrait>(
    db: &C,
    row: calendar_event::ActiveModel,
) -> Result<calendar_event::Model, sea_orm::DbErr> {
    row.update(db).await
}

pub async fn delete_participants<C: ConnectionTrait>(
    db: &C,
    ids: Vec<String>,
) -> Result<(), sea_orm::DbErr> {
    event_participant::Entity::delete_many()
        .filter(event_participant::Column::Id.is_in(ids))
        .exec(db)
        .await
        .map(|_| ())
}

pub async fn delete_participants_by_email<C: ConnectionTrait>(
    db: &C,
    event_id: &str,
    emails: Vec<String>,
) -> Result<(), sea_orm::DbErr> {
    event_participant::Entity::delete_many()
        .filter(event_participant::Column::EventId.eq(event_id))
        .filter(event_participant::Column::Email.is_in(emails))
        .exec(db)
        .await
        .map(|_| ())
}

/// The `(eventId, email)` upsert `syncParticipants` writes.
pub async fn upsert_participant<C: ConnectionTrait>(
    db: &C,
    event_id: &str,
    participant: &Resolved,
) -> Result<(), sea_orm::DbErr> {
    let existing = event_participant::Entity::find()
        .filter(event_participant::Column::EventId.eq(event_id))
        .filter(event_participant::Column::Email.eq(participant.email.as_str()))
        .one(db)
        .await?;
    let mut row = match existing {
        Some(row) => row.into(),
        None => event_participant::ActiveModel {
            event_id: Set(event_id.to_owned()),
            email: Set(participant.email.clone()),
            ..Default::default()
        },
    };
    row.user_id = Set(participant.user_id.clone());
    row.display_name = Set(Some(participant.display_name.clone()));
    row.role = Set(participant.role.to_owned());
    row.status = Set(participant.status.clone());
    row.save(db).await.map(|_| ())
}

pub async fn set_participant_status<C: ConnectionTrait>(
    db: &C,
    row: event_participant::Model,
    status: &str,
) -> Result<(), sea_orm::DbErr> {
    let mut active: event_participant::ActiveModel = row.into();
    active.status = Set(status.to_owned());
    active.update(db).await.map(|_| ())
}

pub async fn delete_reminders<C: ConnectionTrait>(
    db: &C,
    event_ids: Vec<String>,
) -> Result<u64, sea_orm::DbErr> {
    Ok(event_notification::Entity::delete_many()
        .filter(event_notification::Column::EventId.is_in(event_ids))
        .exec(db)
        .await?
        .rows_affected)
}

pub async fn delete_notification_logs<C: ConnectionTrait>(
    db: &C,
    user_id: Option<&str>,
    event_ids: Vec<String>,
) -> Result<(), sea_orm::DbErr> {
    let mut query = notification_log::Entity::delete_many()
        .filter(notification_log::Column::EventId.is_in(event_ids));
    if let Some(user_id) = user_id {
        query = query.filter(notification_log::Column::UserId.eq(user_id));
    }
    query.exec(db).await.map(|_| ())
}

pub async fn reminders<C: ConnectionTrait>(
    db: &C,
    event_id: &str,
) -> Result<Vec<event_notification::Model>, sea_orm::DbErr> {
    event_notification::Entity::find()
        .filter(event_notification::Column::EventId.eq(event_id))
        .all(db)
        .await
}

pub async fn insert_reminder<C: ConnectionTrait>(
    db: &C,
    row: event_notification::ActiveModel,
) -> Result<(), sea_orm::DbErr> {
    row.insert(db).await.map(|_| ())
}

pub async fn delete<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    ids: Vec<String>,
) -> Result<u64, sea_orm::DbErr> {
    Ok(calendar_event::Entity::delete_many()
        .filter(calendar_event::Column::Id.is_in(ids))
        .filter(calendar_event::Column::UserId.eq(user_id))
        .exec(db)
        .await?
        .rows_affected)
}

pub async fn move_to_calendar<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    ids: Vec<String>,
    calendar_id: &str,
    now: time::PrimitiveDateTime,
) -> Result<u64, sea_orm::DbErr> {
    Ok(calendar_event::Entity::update_many()
        .col_expr(calendar_event::Column::CalendarId, Expr::value(calendar_id))
        .col_expr(calendar_event::Column::UpdatedAt, Expr::value(now))
        .filter(calendar_event::Column::Id.is_in(ids))
        .filter(calendar_event::Column::UserId.eq(user_id))
        .exec(db)
        .await?
        .rows_affected)
}

/// The corpus filter: the owner's events, minus invitations the owner declined as an attendee.
fn corpus_condition(user_id: &str, updated_after: Option<time::PrimitiveDateTime>) -> Condition {
    use calendar_event::Column;
    let declined = event_participant::Entity::find()
        .select_only()
        .column(event_participant::Column::EventId)
        .filter(event_participant::Column::UserId.eq(user_id))
        .filter(event_participant::Column::Role.ne("organizer"))
        .filter(event_participant::Column::Status.eq("declined"))
        .into_query();
    let mut condition = Condition::all()
        .add(Column::UserId.eq(user_id))
        .add(Column::Id.not_in_subquery(declined));
    if let Some(after) = updated_after {
        condition = condition.add(Column::UpdatedAt.gt(after));
    }
    condition
}

pub async fn corpus_page<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    updated_after: Option<time::PrimitiveDateTime>,
    limit: u64,
    offset: u64,
) -> Result<(Vec<calendar_event::Model>, u64), sea_orm::DbErr> {
    let condition = corpus_condition(user_id, updated_after);
    let events = calendar_event::Entity::find()
        .filter(condition.clone())
        .order_by_asc(calendar_event::Column::UpdatedAt)
        .order_by_asc(calendar_event::Column::Id)
        .limit(limit)
        .offset(offset)
        .all(db)
        .await?;
    let total = calendar_event::Entity::find()
        .filter(condition)
        .count(db)
        .await?;
    Ok((events, total))
}
