//! What an account still stores in an older form, by opaque id, for the client to re-seal in the background.

use sea_orm::sea_query::Condition;
use sea_orm::{
    ColumnTrait, ConnectionTrait, EntityTrait, JoinType, QueryFilter, QueryOrder, QuerySelect,
    RelationTrait,
};
use solace_api_types::e2ee::EncryptionUpgrades;

use crate::auth::guard::RouteUser;
use crate::db::entities::{calendar_event, event_notification, user_settings};
use crate::error::AppError;
use crate::events::queries::corpus_page;
use crate::instant;
use crate::state::AppState;

/// At most this many ids of each kind per report; the next start picks up the rest.
const BATCH: u64 = 200;

pub async fn report(state: &AppState, user: &RouteUser) -> Result<EncryptionUpgrades, AppError> {
    let (attributes, reminders, invitations, settings) = tokio::try_join!(
        events_with_readable_attributes(&state.db, &user.id),
        events_with_unsealed_reminders(&state.db, &user.id),
        corpus_page(&state.db, &user.id, None, true, 1, 0),
        user_settings::Entity::find()
            .filter(user_settings::Column::UserId.eq(&user.id))
            .one(&state.db),
    )?;
    Ok(EncryptionUpgrades {
        events_with_readable_attributes: attributes.into_iter().map(Into::into).collect(),
        events_with_unsealed_reminders: reminders.into_iter().map(Into::into).collect(),
        readable_invitations: i64::try_from(invitations.1).unwrap_or(i64::MAX),
        unsealed_settings: settings.is_some_and(|row| row.encrypted_preferences.is_none()),
    })
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
