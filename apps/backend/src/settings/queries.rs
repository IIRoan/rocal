//! Settings rows.

use sea_orm::prelude::TimeDateTime;
use sea_orm::sea_query::OnConflict;
use sea_orm::{ColumnTrait, ConnectionTrait, EntityTrait, QueryFilter, QuerySelect, Set};
use solace_api_types::settings::UpdateSettingsRequest;

use crate::db::cuid;
use crate::db::entities::{calendar, user_settings};

/// The app-only columns the sealed preferences replace; the server never reads them.
const SEALED_PREFERENCES: [user_settings::Column; 12] = [
    user_settings::Column::Theme,
    user_settings::Column::DefaultView,
    user_settings::Column::WeekStartDay,
    user_settings::Column::WorkingHoursStart,
    user_settings::Column::WorkingHoursEnd,
    user_settings::Column::WorkingDays,
    user_settings::Column::BrowserNotifications,
    user_settings::Column::ReminderSound,
    user_settings::Column::DefaultEventDuration,
    user_settings::Column::CompactView,
    user_settings::Column::ShowWeekNumbers,
    user_settings::Column::ShowDeclinedEvents,
];

pub async fn find<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Option<user_settings::Model>, sea_orm::DbErr> {
    user_settings::Entity::find()
        .filter(user_settings::Column::UserId.eq(user_id))
        .one(db)
        .await
}

/// A row of database defaults, or the row a concurrent first read just created.
pub async fn create<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<user_settings::Model, sea_orm::DbErr> {
    let now = crate::instant::now();
    user_settings::Entity::insert(user_settings::ActiveModel {
        id: Set(cuid()),
        user_id: Set(user_id.to_owned()),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    })
    .on_conflict(
        OnConflict::column(user_settings::Column::UserId)
            .do_nothing()
            .to_owned(),
    )
    .exec_without_returning(db)
    .await?;
    find(db, user_id)
        .await?
        .ok_or_else(|| sea_orm::DbErr::RecordNotFound("user_settings".into()))
}

pub async fn own_calendar<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    calendar_id: &str,
) -> Result<Option<calendar::Model>, sea_orm::DbErr> {
    calendar::Entity::find()
        .filter(calendar::Column::Id.eq(calendar_id))
        .filter(calendar::Column::UserId.eq(user_id))
        .one(db)
        .await
}

/// Prisma's native upsert: insert the row, or update only the given fields.
/// The stored sealed preferences, row-locked until the caller's transaction ends; `None` when there is no row yet.
pub async fn sealed_preferences_for_update<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Option<String>, sea_orm::DbErr> {
    Ok(user_settings::Entity::find()
        .filter(user_settings::Column::UserId.eq(user_id))
        .lock_exclusive()
        .one(db)
        .await?
        .and_then(|row| row.encrypted_preferences))
}

pub async fn upsert<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    changes: UpdateSettingsRequest,
    now: TimeDateTime,
) -> Result<user_settings::Model, sea_orm::DbErr> {
    use user_settings::Column;
    let mut row = user_settings::ActiveModel {
        id: Set(cuid()),
        user_id: Set(user_id.to_owned()),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    };
    let mut columns = vec![Column::UpdatedAt];
    macro_rules! apply {
        ($($field:ident => $column:ident),+ $(,)?) => {$(
            if let Some(value) = changes.$field {
                row.$field = Set(value.into());
                columns.push(Column::$column);
            }
        )+};
    }
    apply!(
        timezone => Timezone,
        time_format => TimeFormat,
        email_notifications => EmailNotifications,
        push_notifications => PushNotifications,
    );
    if let Some(sealed) = changes.encrypted_preferences {
        row.encrypted_preferences = Set(Some(sealed));
        columns.push(Column::EncryptedPreferences);
        // Left unset in the row, the conflict update takes each column's default from `excluded`.
        columns.extend(SEALED_PREFERENCES);
    } else {
        apply!(
            theme => Theme,
            default_view => DefaultView,
            week_start_day => WeekStartDay,
            working_hours_start => WorkingHoursStart,
            working_hours_end => WorkingHoursEnd,
            working_days => WorkingDays,
            browser_notifications => BrowserNotifications,
            reminder_sound => ReminderSound,
            default_event_duration => DefaultEventDuration,
            compact_view => CompactView,
            show_week_numbers => ShowWeekNumbers,
            show_declined_events => ShowDeclinedEvents,
        );
    }
    if let Some(calendar_id) = changes.default_calendar_id {
        row.default_calendar_id = Set(calendar_id.map(|id| id.0));
        columns.push(Column::DefaultCalendarId);
    }
    user_settings::Entity::insert(row)
        .on_conflict(
            OnConflict::column(Column::UserId)
                .update_columns(columns)
                .to_owned(),
        )
        .exec_with_returning(db)
        .await
}

pub async fn delete<C: ConnectionTrait>(db: &C, user_id: &str) -> Result<(), sea_orm::DbErr> {
    user_settings::Entity::delete_many()
        .filter(user_settings::Column::UserId.eq(user_id))
        .exec(db)
        .await?;
    Ok(())
}
