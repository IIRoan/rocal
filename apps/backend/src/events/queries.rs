//! Event rows and their relations, always scoped to the owner; relations load in batches by event id.

use std::collections::HashMap;

use sea_orm::sea_query::{Condition, Expr, Query, SelectStatement};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, EntityTrait, ExprTrait, FromQueryResult,
    PaginatorTrait, QueryFilter, QueryOrder, QuerySelect, QueryTrait, Set, Statement,
    Value as SqlValue,
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

pub async fn participants_by_event<C: ConnectionTrait>(
    db: &C,
    event_ids: Vec<String>,
) -> Result<HashMap<String, Vec<event_participant::Model>>, sea_orm::DbErr> {
    let mut grouped: HashMap<String, Vec<event_participant::Model>> = HashMap::new();
    for row in event_participant::Entity::find()
        .filter(event_participant::Column::EventId.is_in(event_ids))
        .all(db)
        .await?
    {
        grouped.entry(row.event_id.clone()).or_default().push(row);
    }
    Ok(grouped)
}

/// The series' own exceptions (Prisma's relation joined on `modified_event_id`, so TypeScript never applied them).
pub async fn exceptions<C: ConnectionTrait>(
    db: &C,
    series_ids: Vec<String>,
) -> Result<Vec<recurrence_exception::Model>, sea_orm::DbErr> {
    recurrence_exception::Entity::find()
        .filter(recurrence_exception::Column::ParentEventId.is_in(series_ids))
        .order_by_asc(recurrence_exception::Column::ExceptionDate)
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

/// New ciphertext with colour and category inside it, stored only while the owner's row still holds `expected`.
pub async fn reseal_if_unchanged<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    id: &str,
    expected: &str,
    row: calendar_event::ActiveModel,
) -> Result<Option<calendar_event::Model>, sea_orm::DbErr> {
    let updated = calendar_event::Entity::update_many()
        .set(row)
        .filter(calendar_event::Column::Id.eq(id))
        .filter(calendar_event::Column::UserId.eq(user_id))
        .filter(calendar_event::Column::EncryptedContent.eq(expected))
        .exec_with_returning(db)
        .await?;
    Ok(updated.into_iter().next())
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

/// `SELECT id FROM calendar_event WHERE …`, the series whose exceptions a delete must take along.
pub fn ids_where(condition: Condition) -> SelectStatement {
    Query::select()
        .column(calendar_event::Column::Id)
        .from(calendar_event::Entity)
        .cond_where(condition)
        .to_owned()
}

/// Recurrence exceptions have no foreign key, so they are deleted with the series `series` selects.
pub async fn delete_exceptions_of<C: ConnectionTrait>(
    db: &C,
    series: SelectStatement,
) -> Result<u64, sea_orm::DbErr> {
    Ok(recurrence_exception::Entity::delete_many()
        .filter(recurrence_exception::Column::ParentEventId.in_subquery(series))
        .exec(db)
        .await?
        .rows_affected)
}

/// The owner's events by id, with their exceptions.
pub async fn delete<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    ids: Vec<String>,
) -> Result<u64, sea_orm::DbErr> {
    delete_exceptions_of(
        db,
        ids_where(
            Condition::all()
                .add(calendar_event::Column::Id.is_in(ids.clone()))
                .add(calendar_event::Column::UserId.eq(user_id)),
        ),
    )
    .await?;
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

/// The corpus filter: the owner's events, minus invitations the owner declined as an attendee, or only the invitation copies still readable.
fn corpus_condition(
    user_id: &str,
    updated_after: Option<time::PrimitiveDateTime>,
    readable_invitations: bool,
) -> Condition {
    use calendar_event::Column;
    if readable_invitations {
        return Condition::all()
            .add(Column::UserId.eq(user_id))
            .add(Column::ExternalId.is_not_null())
            .add(Column::ExternalId.ne(""))
            .add(Column::IsSynced.eq(false))
            .add(Column::SubscriptionId.is_null())
            .add(Column::EncryptionState.ne("encrypted"))
            .add(
                Condition::any()
                    .add(Column::EncryptedContent.is_null())
                    .add(Column::EncryptedContent.eq("")),
            )
            .add(
                Condition::any()
                    .add(Column::Title.ne(""))
                    .add(Column::Description.ne(""))
                    .add(Column::Location.ne("")),
            );
    }
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
    readable_invitations: bool,
    limit: u64,
    offset: u64,
) -> Result<(Vec<calendar_event::Model>, u64), sea_orm::DbErr> {
    let condition = corpus_condition(user_id, updated_after, readable_invitations);
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

/// A search hit with its calendar's and category's labels.
#[derive(FromQueryResult)]
pub struct SearchRow {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub start: time::PrimitiveDateTime,
    pub end: time::PrimitiveDateTime,
    pub all_day: bool,
    pub location: Option<String>,
    pub color: Option<String>,
    pub calendar_id: String,
    pub category_id: Option<String>,
    pub timezone: String,
    pub recurrence: Option<String>,
    pub user_id: String,
    pub created_at: time::PrimitiveDateTime,
    pub updated_at: time::PrimitiveDateTime,
    pub encrypted_content: Option<String>,
    pub blind_index_tokens: Option<String>,
    pub encryption_state: String,
    pub encryption_key_version: i32,
    pub calendar_label_id: Option<String>,
    pub calendar_label_name: Option<String>,
    pub calendar_label_color: Option<String>,
    pub calendar_label_encrypted_name: Option<String>,
    pub calendar_label_key_version: Option<i32>,
    pub category_label_id: Option<String>,
    pub category_label_name: Option<String>,
    pub category_label_color: Option<String>,
    pub category_label_encrypted_name: Option<String>,
    pub category_label_key_version: Option<i32>,
}

#[derive(FromQueryResult)]
struct Total {
    total: i32,
}

/// Full-text matches of `text` (or a title substring) and blind-index token matches, best first, with the total.
pub async fn search<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    text: &str,
    tokens: Vec<String>,
    dates: Option<(time::PrimitiveDateTime, time::PrimitiveDateTime)>,
    limit: i64,
    offset: i64,
) -> Result<(Vec<SearchRow>, i64), sea_orm::DbErr> {
    let has_text = !text.is_empty();
    let vector = "to_tsvector('english', coalesce(e.title, '') || ' ' || coalesce(e.description, '') || ' ' || coalesce(e.location, ''))";
    let text_filter = if has_text {
        format!("{vector} @@ plainto_tsquery('english', $2) OR e.title ILIKE '%' || $2 || '%'")
    } else {
        "FALSE".into()
    };
    let rank = if has_text {
        format!("ts_rank({vector}, plainto_tsquery('english', $2))")
    } else {
        "0".into()
    };
    let mut values: Vec<SqlValue> = vec![user_id.into(), text.into()];
    let mut token_filter = String::new();
    if !tokens.is_empty() {
        let placeholders: Vec<String> = (0..tokens.len())
            .map(|i| format!("${}", values.len() + i + 1))
            .collect();
        token_filter = format!(
            "OR (e.blind_index_tokens IS NOT NULL AND e.blind_index_tokens::jsonb ?| ARRAY[{}])",
            placeholders.join(", ")
        );
        values.extend(tokens.into_iter().map(SqlValue::from));
    }
    let mut date_filter = String::new();
    if let Some((start, end)) = dates {
        date_filter = format!(
            "AND e.start <= ${}::timestamp AND e.end >= ${}::timestamp",
            values.len() + 1,
            values.len() + 2
        );
        values.push(start.into());
        values.push(end.into());
    }
    let where_clause =
        format!("WHERE e.user_id = $1 AND ({text_filter} {token_filter}) {date_filter}");
    let count_values = values.clone();
    let (limit_at, offset_at) = (values.len() + 1, values.len() + 2);
    values.push(limit.into());
    values.push(offset.into());
    let backend = db.get_database_backend();
    let rows = SearchRow::find_by_statement(Statement::from_sql_and_values(
        backend,
        format!(
            r#"SELECT e.id, e.title, e.description, e.start, e."end", e.all_day, e.location, e.color,
                e.calendar_id, e.category_id, e.timezone, e.recurrence, e.user_id, e.created_at, e.updated_at,
                e.encrypted_content, e.blind_index_tokens, e.encryption_state, e.encryption_key_version,
                c.id AS calendar_label_id, c.name AS calendar_label_name, c.color AS calendar_label_color,
                c.encrypted_name AS calendar_label_encrypted_name, c.encryption_key_version AS calendar_label_key_version,
                cat.id AS category_label_id, cat.name AS category_label_name, cat.color AS category_label_color,
                cat.encrypted_name AS category_label_encrypted_name, cat.encryption_key_version AS category_label_key_version,
                {rank} AS rank
            FROM calendar_event e
            LEFT JOIN calendar c ON e.calendar_id = c.id
            LEFT JOIN event_category cat ON e.category_id = cat.id
            {where_clause}
            ORDER BY rank DESC, e.start DESC
            LIMIT ${limit_at} OFFSET ${offset_at}"#
        ),
        values,
    ))
    .all(db)
    .await?;
    let total = Total::find_by_statement(Statement::from_sql_and_values(
        backend,
        format!("SELECT count(*)::int AS total FROM calendar_event e {where_clause}"),
        count_values,
    ))
    .one(db)
    .await?
    .map_or(0, |row| i64::from(row.total));
    Ok((rows, total))
}

/// The declined copy moves to the hidden staging calendar, forgets its Stalwart copy and keeps no readable text, as the mailed decline does.
pub async fn stage_declined<C: ConnectionTrait>(
    db: &C,
    id: &str,
    staging_calendar_id: &str,
    now: time::PrimitiveDateTime,
) -> Result<(), sea_orm::DbErr> {
    calendar_event::Entity::update_many()
        .col_expr(
            calendar_event::Column::CalendarId,
            Expr::value(staging_calendar_id),
        )
        .col_expr(
            calendar_event::Column::StalwartEventId,
            Expr::value(None::<String>),
        )
        .col_expr(
            calendar_event::Column::StalwartSyncedAt,
            Expr::value(None::<time::PrimitiveDateTime>),
        )
        .col_expr(calendar_event::Column::Title, Expr::value(""))
        .col_expr(
            calendar_event::Column::Description,
            Expr::value(None::<String>),
        )
        .col_expr(
            calendar_event::Column::Location,
            Expr::value(None::<String>),
        )
        .col_expr(calendar_event::Column::UpdatedAt, Expr::value(now))
        .filter(calendar_event::Column::Id.eq(id))
        .exec(db)
        .await
        .map(|_| ())
}
