//! Reminder rows of an owner's event, and the event's `reminder` column they mirror.

use std::collections::HashMap;

use sea_orm::sea_query::Expr;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseTransaction, EntityTrait, QueryFilter,
    QueryOrder, QuerySelect, RelationTrait, Set,
};

use crate::db::entities::{calendar_event, event_notification};
use crate::instant;

pub async fn event<C: ConnectionTrait>(
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

/// The event's reminders, by type and lead time, joined to the owner as a second guard.
pub async fn for_event<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    event_id: &str,
) -> Result<Vec<event_notification::Model>, sea_orm::DbErr> {
    event_notification::Entity::find()
        .join(
            sea_orm::JoinType::InnerJoin,
            event_notification::Relation::CalendarEvent.def(),
        )
        .filter(event_notification::Column::EventId.eq(event_id))
        .filter(calendar_event::Column::UserId.eq(user_id))
        .order_by_asc(event_notification::Column::NotificationType)
        .order_by_asc(event_notification::Column::MinutesBefore)
        .all(db)
        .await
}

/// The newest stored display-title ciphertext, which a save without one keeps.
pub async fn latest_display_title<C: ConnectionTrait>(
    db: &C,
    event_id: &str,
) -> Result<Option<String>, sea_orm::DbErr> {
    Ok(event_notification::Entity::find()
        .filter(event_notification::Column::EventId.eq(event_id))
        .filter(event_notification::Column::EncryptedDisplayTitle.is_not_null())
        .order_by_desc(event_notification::Column::UpdatedAt)
        .one(db)
        .await?
        .and_then(|row| row.encrypted_display_title))
}

/// Sealed leads by `minutes_before`, which a save from a client that cannot seal keeps.
pub async fn stored_leads<C: ConnectionTrait>(
    db: &C,
    event_id: &str,
) -> Result<HashMap<i32, String>, sea_orm::DbErr> {
    Ok(event_notification::Entity::find()
        .filter(event_notification::Column::EventId.eq(event_id))
        .filter(event_notification::Column::EncryptedLead.is_not_null())
        .all(db)
        .await?
        .into_iter()
        .filter_map(|row| Some((row.minutes_before, row.encrypted_lead?)))
        .collect())
}

/// `reconcileEventReminderField`: the event's `reminder` follows its earliest enabled email reminder.
pub async fn set_event_reminder(
    db: &DatabaseTransaction,
    user_id: &str,
    event_id: &str,
    minutes: Option<i32>,
) -> Result<(), sea_orm::DbErr> {
    calendar_event::Entity::update_many()
        .col_expr(calendar_event::Column::Reminder, Expr::value(minutes))
        .col_expr(
            calendar_event::Column::UpdatedAt,
            Expr::value(instant::now()),
        )
        .filter(calendar_event::Column::Id.eq(event_id))
        .filter(calendar_event::Column::UserId.eq(user_id))
        .exec(db)
        .await
        .map(|_| ())
}

pub async fn delete_for_event(
    db: &DatabaseTransaction,
    event_id: &str,
) -> Result<u64, sea_orm::DbErr> {
    Ok(event_notification::Entity::delete_many()
        .filter(event_notification::Column::EventId.eq(event_id))
        .exec(db)
        .await?
        .rows_affected)
}

pub async fn insert(
    db: &DatabaseTransaction,
    rows: Vec<event_notification::ActiveModel>,
) -> Result<(), sea_orm::DbErr> {
    for row in rows {
        row.insert(db).await?;
    }
    Ok(())
}

/// Sets the sealed title and each matching lead on the event's unsent reminders; returns how many rows changed.
pub async fn seal_pending(
    db: &DatabaseTransaction,
    event_id: &str,
    title: Option<&str>,
    leads: &HashMap<i32, String>,
) -> Result<u64, sea_orm::DbErr> {
    let pending = event_notification::Entity::find()
        .filter(event_notification::Column::EventId.eq(event_id))
        .filter(event_notification::Column::IsSent.eq(false))
        .all(db)
        .await?;
    let mut updated = 0;
    for row in pending {
        let lead = leads.get(&row.minutes_before).cloned();
        if title.is_none() && lead.is_none() {
            continue;
        }
        let mut active = event_notification::ActiveModel::from(row);
        if let Some(title) = title {
            active.encrypted_display_title = Set(Some(title.to_owned()));
        }
        if let Some(lead) = lead {
            active.encrypted_lead = Set(Some(lead));
        }
        active.updated_at = Set(instant::now());
        active.update(db).await?;
        updated += 1;
    }
    Ok(updated)
}
