//! What the Prisma client used to fill in: `@default(cuid())` ids, `@default(now())` and `@updatedAt`, in UTC milliseconds.

use sea_orm::ActiveValue::Set;
use sea_orm::entity::prelude::async_trait::async_trait;
use sea_orm::{ActiveModelBehavior, ConnectionTrait, DbErr};

use super::entities;
use crate::instant;

/// A Prisma-style cuid (v1), the format of every id the schema generates.
pub fn cuid() -> String {
    cuid::cuid1()
}

/// One instant for required and nullable timestamp columns alike, so a new row's `created_at` equals its `updated_at` as with Prisma.
trait Now {
    fn at(now: time::PrimitiveDateTime) -> Self;
}

impl Now for time::PrimitiveDateTime {
    fn at(now: time::PrimitiveDateTime) -> Self {
        now
    }
}

impl Now for Option<time::PrimitiveDateTime> {
    fn at(now: time::PrimitiveDateTime) -> Self {
        Some(now)
    }
}

/// `id`, `created_at` and `updated_at` columns, as each table has them.
macro_rules! behavior {
    ($($entity:ident: $($column:ident),+;)+) => {$(
        #[async_trait]
        impl ActiveModelBehavior for entities::$entity::ActiveModel {
            async fn before_save<C: ConnectionTrait>(mut self, _db: &C, insert: bool) -> Result<Self, DbErr> {
                #[allow(unused_variables)]
                let now = instant::now();
                $(behavior!(@$column self, insert, now);)+
                Ok(self)
            }
        }
    )+};
    (@id $model:ident, $insert:ident, $now:ident) => {
        if $insert && $model.id.is_not_set() {
            $model.id = Set(cuid());
        }
    };
    (@created_at $model:ident, $insert:ident, $now:ident) => {
        if $insert && $model.created_at.is_not_set() {
            $model.created_at = Set(Now::at($now));
        }
    };
    (@updated_at $model:ident, $insert:ident, $now:ident) => {
        if !$model.updated_at.is_set() {
            $model.updated_at = Set(Now::at($now));
        }
    };
}

behavior! {
    account: id, created_at, updated_at;
    calendar: id, created_at, updated_at;
    calendar_event: id, created_at, updated_at;
    calendar_sharing: id, created_at, updated_at;
    calendar_subscription: id, created_at, updated_at;
    calendar_sync_log: id;
    event_category: id, created_at, updated_at;
    event_notification: id, created_at, updated_at;
    event_participant: id, created_at, updated_at;
    invite: id, created_at, updated_at;
    jwks: id, created_at;
    mail_directory_entry: id, created_at, updated_at;
    mail_jmap_sync_state: id, created_at, updated_at;
    mail_vault_backup: id, created_at, updated_at;
    notification_job: id, created_at, updated_at;
    notification_log: id, created_at;
    oauth_access_token: id, created_at;
    oauth_client: id, created_at, updated_at;
    oauth_consent: id, created_at, updated_at;
    oauth_refresh_token: id, created_at;
    push_device: id, created_at, updated_at;
    recurrence_exception: id, created_at, updated_at;
    session: id, created_at, updated_at;
    user: id, created_at, updated_at;
    user_encryption_device: id, created_at, updated_at;
    user_encryption_password: id, created_at, updated_at;
    user_mail_settings: id, created_at, updated_at;
    user_recent_contacts: id, created_at, updated_at;
    user_settings: id, created_at, updated_at;
    verification: id, created_at, updated_at;
}

/// Passkey ids come from Better Auth and `createdAt` is nullable, so nothing is defaulted.
impl ActiveModelBehavior for entities::passkey::ActiveModel {}

impl ActiveModelBehavior for entities::rate_limit::ActiveModel {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_look_like_prisma_cuids() {
        let id = cuid();
        assert!(id.starts_with('c') && id.len() >= 24, "{id}");
        assert_ne!(id, cuid());
    }
}
