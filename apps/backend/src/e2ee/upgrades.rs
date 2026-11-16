//! What an account still stores in an older form, by opaque id, for the client to re-seal in the background.

use sea_orm::sea_query::Condition;
use sea_orm::{
    AccessMode, ColumnTrait, ConnectionTrait, EntityTrait, IsolationLevel, JoinType, QueryFilter,
    QueryOrder, QuerySelect, RelationTrait, Statement, TransactionTrait,
};
use solace_api_types::e2ee::EncryptionUpgrades;

use crate::auth::guard::RouteUser;
use crate::db::entities::{
    calendar, calendar_event, calendar_subscription, event_notification, user_settings,
};
use crate::error::AppError;
use crate::events::encryption::BOUND_EVENT_CONTENT_VERSION;
use crate::events::queries::corpus_page;
use crate::instant;
use crate::state::AppState;

/// At most this many ids of each kind per report; the next start picks up the rest.
const BATCH: u64 = 200;

pub async fn report(state: &AppState, user: &RouteUser) -> Result<EncryptionUpgrades, AppError> {
    // One snapshot, so a trash or restore between the live and trashed reads never makes both look empty.
    let snapshot = state
        .db
        .begin_with_config(
            Some(IsolationLevel::RepeatableRead),
            Some(AccessMode::ReadOnly),
        )
        .await?;
    let db = &snapshot;
    let attributes = events_with_readable_attributes(db, &user.id).await?;
    let unbound = events_with_unbound_content(db, &user.id).await?;
    let trashed = trash_with_unbound_content(db, &user.id).await?;
    let reminders = events_with_unsealed_reminders(db, &user.id).await?;
    let invitations = corpus_page(db, &user.id, None, true, 1, 0).await?;
    let settings = user_settings::Entity::find()
        .filter(user_settings::Column::UserId.eq(&user.id))
        .one(db)
        .await?;
    let feeds = subscriptions_with_readable_names(db, &user.id).await?;
    let urls = subscriptions_with_readable_urls(db, &user.id).await?;
    snapshot.commit().await?;
    Ok(EncryptionUpgrades {
        events_with_readable_attributes: attributes.into_iter().map(Into::into).collect(),
        events_with_unsealed_reminders: reminders.into_iter().map(Into::into).collect(),
        events_with_unbound_content: unbound.into_iter().map(Into::into).collect(),
        trash_with_unbound_content: trashed,
        readable_invitations: i64::try_from(invitations.1).unwrap_or(i64::MAX),
        unsealed_settings: settings.is_some_and(|row| row.encrypted_preferences.is_none()),
        subscriptions_with_readable_names: feeds.into_iter().map(Into::into).collect(),
        subscriptions_with_readable_urls: urls.into_iter().map(Into::into).collect(),
    })
}

/// Feeds whose URL an older client stored readable.
async fn subscriptions_with_readable_urls<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Vec<String>, sea_orm::DbErr> {
    calendar_subscription::Entity::find()
        .select_only()
        .column(calendar_subscription::Column::Id)
        .filter(calendar_subscription::Column::UserId.eq(user_id))
        .filter(calendar_subscription::Column::EncryptedUrl.is_null())
        .order_by_asc(calendar_subscription::Column::Id)
        .limit(BATCH)
        .into_tuple()
        .all(db)
        .await
}

/// Feeds an older client named in readable text, on the feed or its calendar.
async fn subscriptions_with_readable_names<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Vec<String>, sea_orm::DbErr> {
    calendar_subscription::Entity::find()
        .select_only()
        .column(calendar_subscription::Column::Id)
        .join(
            JoinType::InnerJoin,
            calendar_subscription::Relation::Calendar.def(),
        )
        .filter(calendar_subscription::Column::UserId.eq(user_id))
        .filter(
            Condition::any()
                .add(calendar_subscription::Column::Name.ne(""))
                .add(calendar::Column::Name.ne("")),
        )
        .order_by_asc(calendar_subscription::Column::Id)
        .limit(BATCH)
        .into_tuple()
        .all(db)
        .await
}

/// Sealed events whose colour or category an older client left in a readable column.
async fn events_with_readable_attributes<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Vec<String>, sea_orm::DbErr> {
    calendar_event::Entity::find()
        .select_only()
        .column(calendar_event::Column::Id)
        .filter(calendar_event::Column::UserId.eq(user_id))
        .filter(calendar_event::Column::SubscriptionId.is_null())
        .filter(calendar_event::Column::EncryptionState.eq("encrypted"))
        .filter(calendar_event::Column::EncryptedContent.ne(""))
        .filter(
            Condition::any()
                .add(calendar_event::Column::Color.is_not_null())
                .add(calendar_event::Column::CategoryId.is_not_null()),
        )
        .order_by_asc(calendar_event::Column::Id)
        .limit(BATCH)
        .into_tuple()
        .all(db)
        .await
}

/// Sealed events whose content an older client sealed without binding it to the row id.
async fn events_with_unbound_content<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Vec<String>, sea_orm::DbErr> {
    calendar_event::Entity::find()
        .select_only()
        .column(calendar_event::Column::Id)
        .filter(calendar_event::Column::UserId.eq(user_id))
        .filter(calendar_event::Column::SubscriptionId.is_null())
        .filter(calendar_event::Column::EncryptionState.eq("encrypted"))
        .filter(calendar_event::Column::EncryptedContent.ne(""))
        .filter(calendar_event::Column::EncryptionKeyVersion.lt(BOUND_EVENT_CONTENT_VERSION))
        .order_by_asc(calendar_event::Column::Id)
        .limit(BATCH)
        .into_tuple()
        .all(db)
        .await
}

/// Trash entries holding unbound content, which a restore brings back as it was, so the account is not marked bound while any remain.
async fn trash_with_unbound_content<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<i64, sea_orm::DbErr> {
    let row = db
        .query_one_raw(Statement::from_sql_and_values(
            db.get_database_backend(),
            r#"SELECT count(*) AS n FROM event_trash t WHERE t.user_id = $1 AND EXISTS (
                   SELECT 1 FROM jsonb_array_elements(t.rows -> 'events') e
                   WHERE e ->> 'subscription_id' IS NULL AND e ->> 'encryption_state' = 'encrypted'
                     AND coalesce(e ->> 'encrypted_content', '') <> ''
                     AND (e ->> 'encryption_key_version')::int < $2)"#,
            [user_id.into(), BOUND_EVENT_CONTENT_VERSION.into()],
        ))
        .await?;
    row.map_or(Ok(0), |row| row.try_get("", "n"))
}

/// Events whose upcoming reminders still lack a sealed title or lead, so their push would show neither.
async fn events_with_unsealed_reminders<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Vec<String>, sea_orm::DbErr> {
    event_notification::Entity::find()
        .select_only()
        .column(event_notification::Column::EventId)
        .distinct()
        .join(
            JoinType::InnerJoin,
            event_notification::Relation::CalendarEvent.def(),
        )
        .filter(calendar_event::Column::UserId.eq(user_id))
        .filter(calendar_event::Column::IsSynced.eq(false))
        .filter(event_notification::Column::IsSent.eq(false))
        .filter(event_notification::Column::IsEnabled.eq(true))
        .filter(event_notification::Column::NotificationTime.gt(instant::now()))
        .filter(
            Condition::any()
                .add(event_notification::Column::EncryptedLead.is_null())
                .add(event_notification::Column::EncryptedDisplayTitle.is_null()),
        )
        .order_by_asc(event_notification::Column::EventId)
        .limit(BATCH)
        .into_tuple()
        .all(db)
        .await
}
