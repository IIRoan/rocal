//! Key envelope upserts and the owner-scoped reads behind bootstrap and the reset snapshot.

use sea_orm::sea_query::OnConflict;
use sea_orm::{
    ColumnTrait, ConnectionTrait, DerivePartialModel, EntityTrait, QueryFilter, QueryOrder, Set,
};

use crate::db::cuid;
use crate::db::entities::{
    calendar, calendar_event, event_category, user_encryption_device, user_encryption_password,
};
use crate::instant;

pub struct DeviceKeys {
    pub device_label: Option<String>,
    pub public_key: String,
    pub public_key_algorithm: String,
    pub wrapped_account_key: String,
    pub wrapped_search_key: String,
    pub wrap_algorithm: String,
    pub key_version: i32,
}

pub struct PasswordKeys {
    pub kdf_algorithm: String,
    pub kdf_salt: String,
    pub kdf_iterations: i32,
    pub wrapped_account_key: String,
    pub wrapped_search_key: String,
    pub wrap_algorithm: String,
    pub key_version: i32,
}

/// The event columns the reset snapshot returns.
#[derive(Debug, DerivePartialModel)]
#[sea_orm(entity = "calendar_event::Entity")]
pub struct EventRow {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub encrypted_content: Option<String>,
    pub blind_index_tokens: Option<String>,
    pub encryption_state: String,
    pub encryption_key_version: i32,
    pub start: sea_orm::prelude::TimeDateTime,
    pub end: sea_orm::prelude::TimeDateTime,
    pub timezone: String,
    pub all_day: bool,
    pub location: Option<String>,
    pub color: Option<String>,
    pub calendar_id: String,
    pub category_id: Option<String>,
    pub reminder: Option<i32>,
    pub recurrence: Option<String>,
    pub parent_event_id: Option<String>,
    pub created_at: sea_orm::prelude::TimeDateTime,
    pub updated_at: sea_orm::prelude::TimeDateTime,
}

pub async fn devices<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Vec<user_encryption_device::Model>, sea_orm::DbErr> {
    user_encryption_device::Entity::find()
        .filter(user_encryption_device::Column::UserId.eq(user_id))
        .order_by_desc(user_encryption_device::Column::LastSeenAt)
        .order_by_asc(user_encryption_device::Column::CreatedAt)
        .all(db)
        .await
}

pub async fn password_envelope<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Option<user_encryption_password::Model>, sea_orm::DbErr> {
    user_encryption_password::Entity::find()
        .filter(user_encryption_password::Column::UserId.eq(user_id))
        .one(db)
        .await
}

/// The owner's calendars, default first then by name; `owned_only` drops subscribed and other kinds.
pub async fn calendars<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    owned_only: bool,
) -> Result<Vec<calendar::Model>, sea_orm::DbErr> {
    let mut query = calendar::Entity::find().filter(calendar::Column::UserId.eq(user_id));
    if owned_only {
        query = query.filter(calendar::Column::Kind.eq("owned"));
    }
    query
        .order_by_desc(calendar::Column::IsDefault)
        .order_by_asc(calendar::Column::Name)
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
        .order_by_asc(event_category::Column::CreatedAt)
        .all(db)
        .await
}

/// The owner's own (not feed-synced) events, least recently updated first.
pub async fn unsynced_events<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Vec<EventRow>, sea_orm::DbErr> {
    calendar_event::Entity::find()
        .filter(calendar_event::Column::UserId.eq(user_id))
        .filter(calendar_event::Column::IsSynced.eq(false))
        .order_by_asc(calendar_event::Column::UpdatedAt)
        .order_by_asc(calendar_event::Column::CreatedAt)
        .into_partial_model()
        .all(db)
        .await
}

/// One row per user and device id: a repeat registration updates the keys in place.
pub async fn upsert_device<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    device_id: String,
    keys: DeviceKeys,
) -> Result<user_encryption_device::Model, sea_orm::DbErr> {
    use user_encryption_device::Column;
    let now = instant::now();
    user_encryption_device::Entity::insert(user_encryption_device::ActiveModel {
        id: Set(cuid()),
        user_id: Set(user_id.to_owned()),
        device_id: Set(device_id),
        device_label: Set(keys.device_label),
        public_key: Set(keys.public_key),
        public_key_algorithm: Set(keys.public_key_algorithm),
        wrapped_account_key: Set(keys.wrapped_account_key),
        wrapped_search_key: Set(keys.wrapped_search_key),
        wrap_algorithm: Set(keys.wrap_algorithm),
        key_version: Set(keys.key_version),
        last_seen_at: Set(now),
        created_at: Set(now),
        updated_at: Set(now),
    })
    .on_conflict(
        OnConflict::columns([Column::UserId, Column::DeviceId])
            .update_columns([
                Column::DeviceLabel,
                Column::PublicKey,
                Column::PublicKeyAlgorithm,
                Column::WrappedAccountKey,
                Column::WrappedSearchKey,
                Column::WrapAlgorithm,
                Column::KeyVersion,
                Column::LastSeenAt,
                Column::UpdatedAt,
            ])
            .to_owned(),
    )
    .exec_with_returning(db)
    .await
}

/// One envelope per user: a repeat store rotates it in place.
pub async fn upsert_password_envelope<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    keys: PasswordKeys,
) -> Result<user_encryption_password::Model, sea_orm::DbErr> {
    use user_encryption_password::Column;
    let now = instant::now();
    user_encryption_password::Entity::insert(user_encryption_password::ActiveModel {
        id: Set(cuid()),
        user_id: Set(user_id.to_owned()),
        kdf_algorithm: Set(keys.kdf_algorithm),
        kdf_salt: Set(keys.kdf_salt),
        kdf_iterations: Set(keys.kdf_iterations),
        wrapped_account_key: Set(keys.wrapped_account_key),
        wrapped_search_key: Set(keys.wrapped_search_key),
        wrap_algorithm: Set(keys.wrap_algorithm),
        key_version: Set(keys.key_version),
        created_at: Set(now),
        updated_at: Set(now),
    })
    .on_conflict(
        OnConflict::column(Column::UserId)
            .update_columns([
                Column::KdfAlgorithm,
                Column::KdfSalt,
                Column::KdfIterations,
                Column::WrappedAccountKey,
                Column::WrappedSearchKey,
                Column::WrapAlgorithm,
                Column::KeyVersion,
                Column::UpdatedAt,
            ])
            .to_owned(),
    )
    .exec_with_returning(db)
    .await
}
