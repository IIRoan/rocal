//! Settings rows, plus the calendar and event writes that full encryption triggers.

use sea_orm::prelude::TimeDateTime;
use sea_orm::sea_query::OnConflict;
use sea_orm::{
    ColumnTrait, ConnectionTrait, DatabaseConnection, EntityTrait, QueryFilter, QuerySelect, Set,
    TransactionTrait,
};
use solace_api_types::settings::UpdateSettingsRequest;

use crate::db::cuid;
use crate::db::entities::{calendar, user_settings};
use crate::events::encryption::backfill_ciphertext_only;

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
        theme => Theme,
        default_view => DefaultView,
        week_start_day => WeekStartDay,
        timezone => Timezone,
        time_format => TimeFormat,
        working_hours_start => WorkingHoursStart,
        working_hours_end => WorkingHoursEnd,
        working_days => WorkingDays,
        email_notifications => EmailNotifications,
        push_notifications => PushNotifications,
        browser_notifications => BrowserNotifications,
        reminder_sound => ReminderSound,
        event_encryption_mode => EventEncryptionMode,
        default_event_duration => DefaultEventDuration,
        compact_view => CompactView,
        show_week_numbers => ShowWeekNumbers,
        show_declined_events => ShowDeclinedEvents,
    );
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

/// Upserts and, in the same transaction, disables every share link and drops plaintext kept beside ciphertext in those calendars.
pub async fn upsert_closing_share_links(
    db: &DatabaseConnection,
    user_id: &str,
    changes: UpdateSettingsRequest,
    now: TimeDateTime,
) -> Result<user_settings::Model, sea_orm::DbErr> {
    let transaction = db.begin().await?;
    let shared: Vec<String> = calendar::Entity::find()
        .select_only()
        .column(calendar::Column::Id)
        .filter(calendar::Column::UserId.eq(user_id))
        .filter(calendar::Column::IcsShareEnabled.eq(true))
        .into_tuple()
        .all(&transaction)
        .await?;
    let settings = upsert(&transaction, user_id, changes, now).await?;
    calendar::Entity::update_many()
        .col_expr(calendar::Column::IcsShareEnabled, false.into())
        .col_expr(
            calendar::Column::IcsShareToken,
            Option::<String>::None.into(),
        )
        .col_expr(calendar::Column::UpdatedAt, now.into())
        .filter(calendar::Column::UserId.eq(user_id))
        .filter(calendar::Column::IcsShareEnabled.eq(true))
        .exec(&transaction)
        .await?;
    let shared: Vec<&str> = shared.iter().map(String::as_str).collect();
    backfill_ciphertext_only(&transaction, user_id, &shared, now).await?;
    transaction.commit().await?;
    Ok(settings)
}

pub async fn delete<C: ConnectionTrait>(db: &C, user_id: &str) -> Result<(), sea_orm::DbErr> {
    user_settings::Entity::delete_many()
        .filter(user_settings::Column::UserId.eq(user_id))
        .exec(db)
        .await?;
    Ok(())
}
