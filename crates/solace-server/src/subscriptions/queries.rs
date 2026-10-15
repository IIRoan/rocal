//! Feed, sync log, mirrored calendar and imported event rows, always scoped to the owner where a request names them.

use std::collections::HashMap;

use sea_orm::prelude::TimeDateTime;
use sea_orm::sea_query::{Condition, Expr, OnConflict};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseConnection, EntityTrait, QueryFilter,
    QueryOrder, QuerySelect, Set, Statement, TransactionTrait,
};

use crate::db::cuid;
use crate::db::entities::{
    calendar, calendar_event, calendar_subscription, calendar_sync_log, recurrence_exception,
    user_settings,
};
use crate::events::queries as events;
use crate::instant;
use crate::integrations::ics::parse::{NewEvent, ParsedEvent};
use crate::integrations::ics::{RecurrenceRule, resolve_timezone};

pub async fn owned_with_calendars<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Vec<(calendar_subscription::Model, Option<calendar::Model>)>, sea_orm::DbErr> {
    calendar_subscription::Entity::find()
        .filter(calendar_subscription::Column::UserId.eq(user_id))
        .find_also_related(calendar::Entity)
        .order_by_desc(calendar_subscription::Column::CreatedAt)
        .all(db)
        .await
}

pub async fn sync_log_counts<C: ConnectionTrait>(
    db: &C,
    subscription_ids: Vec<String>,
) -> Result<HashMap<String, i64>, sea_orm::DbErr> {
    let counts: Vec<(String, i64)> = calendar_sync_log::Entity::find()
        .select_only()
        .column(calendar_sync_log::Column::SubscriptionId)
        .column_as(calendar_sync_log::Column::Id.count(), "count")
        .filter(calendar_sync_log::Column::SubscriptionId.is_in(subscription_ids))
        .group_by(calendar_sync_log::Column::SubscriptionId)
        .into_tuple()
        .all(db)
        .await?;
    Ok(counts.into_iter().collect())
}

pub async fn owned<C: ConnectionTrait>(
    db: &C,
    id: &str,
    user_id: &str,
) -> Result<Option<calendar_subscription::Model>, sea_orm::DbErr> {
    calendar_subscription::Entity::find_by_id(id)
        .filter(calendar_subscription::Column::UserId.eq(user_id))
        .one(db)
        .await
}

pub async fn owned_with_calendar<C: ConnectionTrait>(
    db: &C,
    id: &str,
    user_id: &str,
) -> Result<Option<(calendar_subscription::Model, Option<calendar::Model>)>, sea_orm::DbErr> {
    calendar_subscription::Entity::find_by_id(id)
        .filter(calendar_subscription::Column::UserId.eq(user_id))
        .find_also_related(calendar::Entity)
        .one(db)
        .await
}

pub async fn by_url<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    url: &str,
) -> Result<Option<calendar_subscription::Model>, sea_orm::DbErr> {
    calendar_subscription::Entity::find()
        .filter(calendar_subscription::Column::UserId.eq(user_id))
        .filter(calendar_subscription::Column::Url.eq(url))
        .one(db)
        .await
}

/// The read-only calendar a new feed mirrors into.
pub async fn insert_feed_calendar<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    name: &str,
    color: &str,
    public_holiday: bool,
) -> Result<calendar::Model, sea_orm::DbErr> {
    calendar::ActiveModel {
        name: Set(name.to_owned()),
        color: Set(color.to_owned()),
        kind: Set(if public_holiday {
            "public_holiday"
        } else {
            "subscribed"
        }
        .into()),
        is_public: Set(public_holiday),
        is_sync_only: Set(true),
        is_default: Set(false),
        user_id: Set(user_id.to_owned()),
        ..Default::default()
    }
    .insert(db)
    .await
}

pub async fn insert_feed<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    name: &str,
    url: &str,
    calendar_id: &str,
    sync_interval_minutes: i32,
) -> Result<calendar_subscription::Model, sea_orm::DbErr> {
    calendar_subscription::ActiveModel {
        name: Set(name.to_owned()),
        url: Set(url.to_owned()),
        user_id: Set(user_id.to_owned()),
        calendar_id: Set(calendar_id.to_owned()),
        last_sync_status: Set("pending".into()),
        sync_interval_minutes: Set(sync_interval_minutes),
        ..Default::default()
    }
    .insert(db)
    .await
}

/// What `PUT /api/subscriptions/:id` changes; `None` leaves a column alone.
pub struct FeedChanges<'a> {
    pub name: Option<&'a str>,
    pub color: Option<&'a str>,
    pub is_active: Option<bool>,
    pub sync_interval_minutes: Option<i32>,
}

/// Renames and recolors the calendar, then updates the feed, in one transaction.
pub async fn update_feed(
    db: &DatabaseConnection,
    feed: calendar_subscription::Model,
    calendar: calendar::Model,
    changes: FeedChanges<'_>,
) -> Result<(calendar_subscription::Model, calendar::Model), sea_orm::DbErr> {
    let transaction = db.begin().await?;
    let calendar = if changes.name.is_some() || changes.color.is_some() {
        let mut row: calendar::ActiveModel = calendar.into();
        if let Some(name) = changes.name {
            row.name = Set(name.to_owned());
        }
        if let Some(color) = changes.color {
            row.color = Set(color.to_owned());
        }
        row.update(&transaction).await?
    } else {
        calendar
    };
    let mut row: calendar_subscription::ActiveModel = feed.into();
    if let Some(name) = changes.name {
        row.name = Set(name.to_owned());
    }
    if let Some(is_active) = changes.is_active {
        row.is_active = Set(is_active);
    }
    if let Some(minutes) = changes.sync_interval_minutes {
        row.sync_interval_minutes = Set(minutes);
    }
    let feed = row.update(&transaction).await?;
    transaction.commit().await?;
    Ok((feed, calendar))
}

pub async fn delete_feed_events<C: ConnectionTrait>(
    db: &C,
    subscription_id: &str,
) -> Result<(), sea_orm::DbErr> {
    events::delete_exceptions_of(
        db,
        events::ids_where(
            Condition::all().add(calendar_event::Column::SubscriptionId.eq(subscription_id)),
        ),
    )
    .await?;
    calendar_event::Entity::delete_many()
        .filter(calendar_event::Column::SubscriptionId.eq(subscription_id))
        .exec(db)
        .await
        .map(|_| ())
}

/// Keeps a deleted feed's events as ordinary ones.
pub async fn detach_feed_events<C: ConnectionTrait>(
    db: &C,
    subscription_id: &str,
) -> Result<(), sea_orm::DbErr> {
    calendar_event::Entity::update_many()
        .col_expr(
            calendar_event::Column::SubscriptionId,
            Expr::value(Option::<String>::None),
        )
        .col_expr(calendar_event::Column::IsSynced, Expr::value(false))
        .col_expr(
            calendar_event::Column::ExternalId,
            Expr::value(Option::<String>::None),
        )
        .col_expr(
            calendar_event::Column::SyncedAt,
            Expr::value(Option::<TimeDateTime>::None),
        )
        .col_expr(
            calendar_event::Column::UpdatedAt,
            Expr::value(instant::now()),
        )
        .filter(calendar_event::Column::SubscriptionId.eq(subscription_id))
        .exec(db)
        .await
        .map(|_| ())
}

pub async fn delete_sync_only_calendar<C: ConnectionTrait>(
    db: &C,
    calendar_id: &str,
    user_id: &str,
) -> Result<(), sea_orm::DbErr> {
    calendar::Entity::delete_many()
        .filter(calendar::Column::Id.eq(calendar_id))
        .filter(calendar::Column::UserId.eq(user_id))
        .filter(calendar::Column::IsSyncOnly.eq(true))
        .exec(db)
        .await
        .map(|_| ())
}

/// Turns a deleted feed's sync-only calendar into an ordinary owned one.
pub async fn release_calendar<C: ConnectionTrait>(
    db: &C,
    calendar_id: &str,
    user_id: &str,
) -> Result<(), sea_orm::DbErr> {
    calendar::Entity::update_many()
        .col_expr(calendar::Column::IsSyncOnly, Expr::value(false))
        .col_expr(calendar::Column::Kind, Expr::value("owned"))
        .col_expr(calendar::Column::UpdatedAt, Expr::value(instant::now()))
        .filter(calendar::Column::Id.eq(calendar_id))
        .filter(calendar::Column::UserId.eq(user_id))
        .filter(calendar::Column::IsSyncOnly.eq(true))
        .exec(db)
        .await
        .map(|_| ())
}

pub async fn delete_feed<C: ConnectionTrait>(db: &C, id: &str) -> Result<(), sea_orm::DbErr> {
    calendar_subscription::Entity::delete_by_id(id)
        .exec(db)
        .await
        .map(|_| ())
}

/// The owner's zone for reading floating and all-day feed times; reading it creates default settings.
pub async fn user_timezone<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<String, sea_orm::DbErr> {
    let settings = user_settings::Entity::find()
        .filter(user_settings::Column::UserId.eq(user_id))
        .one(db)
        .await?;
    let settings = match settings {
        Some(settings) => settings,
        None => {
            user_settings::ActiveModel {
                user_id: Set(user_id.to_owned()),
                ..Default::default()
            }
            .insert(db)
            .await?
        }
    };
    Ok(instant::resolve_timezone(Some(&settings.timezone)))
}

pub async fn start_sync_log<C: ConnectionTrait>(
    db: &C,
    subscription_id: &str,
) -> Result<calendar_sync_log::Model, sea_orm::DbErr> {
    calendar_sync_log::ActiveModel {
        subscription_id: Set(subscription_id.to_owned()),
        status: Set("started".into()),
        started_at: Set(instant::now()),
        ..Default::default()
    }
    .insert(db)
    .await
}

/// How a sync attempt ended, as its log records it.
pub struct SyncOutcome {
    pub error_message: Option<String>,
    pub added: i32,
    pub updated: i32,
    pub deleted: i32,
    pub duration_ms: i32,
    pub http_status: Option<i32>,
}

pub async fn finish_sync_log<C: ConnectionTrait>(
    db: &C,
    log: calendar_sync_log::Model,
    outcome: SyncOutcome,
) -> Result<(), sea_orm::DbErr> {
    let mut row: calendar_sync_log::ActiveModel = log.into();
    row.status = Set(if outcome.error_message.is_some() {
        "error"
    } else {
        "success"
    }
    .into());
    if outcome.error_message.is_some() {
        row.error_message = Set(outcome.error_message);
    } else {
        row.events_added = Set(outcome.added);
        row.events_updated = Set(outcome.updated);
        row.events_deleted = Set(outcome.deleted);
    }
    if outcome.http_status.is_some() {
        row.http_status_code = Set(outcome.http_status);
    }
    row.completed_at = Set(Some(instant::now()));
    row.sync_duration_ms = Set(Some(outcome.duration_ms));
    row.update(db).await.map(|_| ())
}

/// Stamps the feed after a sync attempt; validators are only replaced by a full fetch.
pub async fn record_sync<C: ConnectionTrait>(
    db: &C,
    subscription_id: &str,
    error_message: Option<String>,
    validators: Option<(Option<String>, Option<String>)>,
) -> Result<(), sea_orm::DbErr> {
    let status = if error_message.is_some() {
        "error"
    } else {
        "success"
    };
    let mut update = calendar_subscription::Entity::update_many()
        .col_expr(
            calendar_subscription::Column::LastSyncAt,
            Expr::value(instant::now()),
        )
        .col_expr(
            calendar_subscription::Column::LastSyncStatus,
            Expr::value(status),
        )
        .col_expr(
            calendar_subscription::Column::LastErrorMessage,
            Expr::value(error_message),
        )
        .col_expr(
            calendar_subscription::Column::UpdatedAt,
            Expr::value(instant::now()),
        );
    if let Some((etag, last_modified)) = validators {
        update = update
            .col_expr(calendar_subscription::Column::Etag, Expr::value(etag))
            .col_expr(
                calendar_subscription::Column::LastModified,
                Expr::value(last_modified),
            );
    }
    update
        .filter(calendar_subscription::Column::Id.eq(subscription_id))
        .exec(db)
        .await
        .map(|_| ())
}

pub async fn feed_events<C: ConnectionTrait>(
    db: &C,
    subscription_id: &str,
) -> Result<Vec<calendar_event::Model>, sea_orm::DbErr> {
    calendar_event::Entity::find()
        .filter(calendar_event::Column::SubscriptionId.eq(subscription_id))
        .filter(calendar_event::Column::IsSynced.eq(true))
        .all(db)
        .await
}

pub async fn insert_event<C: ConnectionTrait>(
    db: &C,
    event: NewEvent,
) -> Result<calendar_event::Model, sea_orm::DbErr> {
    calendar_event::ActiveModel {
        title: Set(event.title),
        description: Set(event.description),
        start: Set(event.start),
        end: Set(event.end),
        all_day: Set(event.all_day),
        location: Set(event.location),
        recurrence: Set(event.recurrence),
        timezone: Set(event.timezone),
        is_synced: Set(event.is_synced),
        external_id: Set(Some(event.external_id)),
        subscription_id: Set(event.subscription_id),
        synced_at: Set(event.synced_at),
        user_id: Set(event.user_id),
        calendar_id: Set(event.calendar_id),
        ..Default::default()
    }
    .insert(db)
    .await
}

/// Applies a changed feed event; a feed without a description or location leaves the stored one, as Prisma skipped `undefined`.
pub async fn update_feed_event<C: ConnectionTrait>(
    db: &C,
    event: calendar_event::Model,
    parsed: &ParsedEvent,
) -> Result<(), sea_orm::DbErr> {
    let mut row: calendar_event::ActiveModel = event.into();
    row.title = Set(parsed.title.clone());
    if let Some(description) = &parsed.description {
        row.description = Set(Some(description.clone()));
    }
    row.start = Set(parsed.start);
    row.end = Set(parsed.end);
    row.all_day = Set(parsed.all_day);
    if let Some(location) = &parsed.location {
        row.location = Set(Some(location.clone()));
    }
    row.recurrence = Set(parsed.recurrence.as_ref().map(RecurrenceRule::to_json));
    row.timezone = Set(resolve_timezone(parsed.timezone.as_deref()));
    row.synced_at = Set(Some(instant::now()));
    row.update(db).await.map(|_| ())
}

pub async fn delete_event<C: ConnectionTrait>(db: &C, id: &str) -> Result<(), sea_orm::DbErr> {
    events::delete_exceptions_of(
        db,
        events::ids_where(Condition::all().add(calendar_event::Column::Id.eq(id))),
    )
    .await?;
    calendar_event::Entity::delete_by_id(id)
        .exec(db)
        .await
        .map(|_| ())
}

/// Hangs a feed override under its series, or frees it when the series is gone.
pub async fn set_parent<C: ConnectionTrait>(
    db: &C,
    event: calendar_event::Model,
    parent_event_id: Option<String>,
) -> Result<(), sea_orm::DbErr> {
    let mut row: calendar_event::ActiveModel = event.into();
    row.parent_event_id = Set(parent_event_id);
    row.update(db).await.map(|_| ())
}

/// A feed series' exceptions as `(date, type, modified event)`, oldest first.
pub type ExceptionSet = Vec<(TimeDateTime, String, Option<String>)>;

/// Replaces a feed series' exceptions with `wanted`.
pub async fn replace_exceptions<C: ConnectionTrait>(
    db: &C,
    series_id: &str,
    wanted: ExceptionSet,
) -> Result<(), sea_orm::DbErr> {
    recurrence_exception::Entity::delete_many()
        .filter(recurrence_exception::Column::ParentEventId.eq(series_id))
        .exec(db)
        .await?;
    for (date, kind, modified_event_id) in wanted {
        recurrence_exception::ActiveModel {
            parent_event_id: Set(series_id.to_owned()),
            exception_date: Set(date),
            modified_event_id: Set(modified_event_id),
            r#type: Set(kind),
            ..Default::default()
        }
        .insert(db)
        .await?;
    }
    Ok(())
}

/// External ids among `external_ids` that already name a non-feed event in the calendar.
pub async fn taken_external_ids<C: ConnectionTrait>(
    db: &C,
    calendar_id: &str,
    external_ids: Vec<String>,
) -> Result<Vec<String>, sea_orm::DbErr> {
    let taken: Vec<Option<String>> = calendar_event::Entity::find()
        .select_only()
        .column(calendar_event::Column::ExternalId)
        .filter(calendar_event::Column::CalendarId.eq(calendar_id))
        .filter(calendar_event::Column::ExternalId.is_in(external_ids))
        .filter(calendar_event::Column::IsSynced.eq(false))
        .into_tuple()
        .all(db)
        .await?;
    Ok(taken.into_iter().flatten().collect())
}

/// A non-feed event of the owner's calendar with this external id; `series` also requires a recurrence.
pub async fn imported_event<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    calendar_id: &str,
    external_id: &str,
    series: bool,
) -> Result<Option<calendar_event::Model>, sea_orm::DbErr> {
    let mut query = calendar_event::Entity::find()
        .filter(calendar_event::Column::UserId.eq(user_id))
        .filter(calendar_event::Column::CalendarId.eq(calendar_id))
        .filter(calendar_event::Column::ExternalId.eq(external_id))
        .filter(calendar_event::Column::IsSynced.eq(false));
    if series {
        query = query.filter(calendar_event::Column::Recurrence.is_not_null());
    }
    query.one(db).await
}

/// Points the series' occurrence at its override, replacing an exception already there.
pub async fn upsert_modified_exception<C: ConnectionTrait>(
    db: &C,
    parent_event_id: &str,
    exception_date: TimeDateTime,
    modified_event_id: &str,
) -> Result<(), sea_orm::DbErr> {
    let now = instant::now();
    recurrence_exception::Entity::insert(recurrence_exception::ActiveModel {
        id: Set(cuid()),
        parent_event_id: Set(parent_event_id.to_owned()),
        exception_date: Set(exception_date),
        modified_event_id: Set(Some(modified_event_id.to_owned())),
        r#type: Set("modified".into()),
        created_at: Set(now),
        updated_at: Set(now),
    })
    .on_conflict(
        OnConflict::columns([
            recurrence_exception::Column::ParentEventId,
            recurrence_exception::Column::ExceptionDate,
        ])
        .update_columns([
            recurrence_exception::Column::ModifiedEventId,
            recurrence_exception::Column::Type,
            recurrence_exception::Column::UpdatedAt,
        ])
        .to_owned(),
    )
    .exec(db)
    .await
    .map(|_| ())
}

/// Active feeds never synced or last synced before `synced_before`, oldest first (never-synced ones last, as Postgres sorts nulls).
pub async fn due<C: ConnectionTrait>(
    db: &C,
    synced_before: TimeDateTime,
) -> Result<Vec<calendar_subscription::Model>, sea_orm::DbErr> {
    calendar_subscription::Entity::find()
        .filter(calendar_subscription::Column::IsActive.eq(true))
        .filter(
            Condition::any()
                .add(calendar_subscription::Column::LastSyncAt.is_null())
                .add(calendar_subscription::Column::LastSyncAt.lt(synced_before)),
        )
        .order_by_asc(calendar_subscription::Column::LastSyncAt)
        .all(db)
        .await
}

/// Deletes every feed's sync logs beyond its `keep` most recent.
pub async fn trim_sync_logs<C: ConnectionTrait>(db: &C, keep: u32) -> Result<(), sea_orm::DbErr> {
    db.execute_raw(Statement::from_sql_and_values(
        db.get_database_backend(),
        "DELETE FROM calendar_sync_log WHERE id IN (SELECT id FROM (SELECT id, row_number() OVER \
         (PARTITION BY subscription_id ORDER BY started_at DESC) AS position FROM calendar_sync_log) AS ranked \
         WHERE position > $1)",
        [i64::from(keep).into()],
    ))
    .await
    .map(|_| ())
}
