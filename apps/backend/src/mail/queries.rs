//! Mail's database access: directory entries, their vault backups and the user's mailbox approval, and the `new_mail` push outbox.

use sea_orm::ActiveValue::{NotSet, Set, Unchanged};
use sea_orm::sea_query::extension::postgres::PgExpr;
use sea_orm::sea_query::{Expr, ExprTrait, OnConflict};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, DbErr, EntityTrait, QueryFilter, QuerySelect,
};
use serde_json::Value;
use time::PrimitiveDateTime;

use crate::db::cuid;
use crate::db::entities::{
    mail_directory_entry, mail_jmap_sync_state, mail_vault_backup, notification_job, user,
    user_settings,
};
use crate::instant;

/// What provisioning writes to an entry and its vault.
pub struct Provisioned<'a> {
    pub stalwart_account_id: &'a str,
    pub email: &'a str,
    pub local_part: &'a str,
    pub domain: &'a str,
    pub display_name: Option<String>,
    pub stalwart_domain_id: &'a str,
    pub stalwart_public_key_id: &'a str,
    pub public_key_armored: &'a str,
    pub fingerprint: &'a str,
    pub key_algorithm: &'a str,
    pub key_created_at: PrimitiveDateTime,
    pub vault: Vault,
}

#[derive(Clone)]
pub struct Vault {
    pub vault_version: i32,
    pub encrypted_vault_b64: String,
    pub kdf: String,
    pub kdf_salt_b64: String,
    pub kdf_memory_kib: i32,
    pub kdf_iterations: i32,
    pub kdf_parallelism: i32,
    pub wrapped_secret: String,
    pub wrap_algorithm: Option<String>,
}

pub async fn entry_by_user<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Option<mail_directory_entry::Model>, DbErr> {
    mail_directory_entry::Entity::find()
        .filter(mail_directory_entry::Column::UserId.eq(user_id))
        .one(db)
        .await
}

pub async fn entry_by_email<C: ConnectionTrait>(
    db: &C,
    email: &str,
) -> Result<Option<mail_directory_entry::Model>, DbErr> {
    mail_directory_entry::Entity::find()
        .filter(mail_directory_entry::Column::Email.eq(email))
        .one(db)
        .await
}

/// Global on purpose: an account id already in the directory must never be adopted or deleted.
pub async fn entry_by_account<C: ConnectionTrait>(
    db: &C,
    stalwart_account_id: &str,
) -> Result<Option<mail_directory_entry::Model>, DbErr> {
    mail_directory_entry::Entity::find()
        .filter(mail_directory_entry::Column::StalwartAccountId.eq(stalwart_account_id))
        .one(db)
        .await
}

pub async fn attach<C: ConnectionTrait>(
    db: &C,
    entry_id: &str,
    user_id: &str,
) -> Result<mail_directory_entry::Model, DbErr> {
    mail_directory_entry::ActiveModel {
        id: Unchanged(entry_id.to_owned()),
        user_id: Set(Some(user_id.to_owned())),
        ..Default::default()
    }
    .update(db)
    .await
}

pub async fn mailbox_approved<C: ConnectionTrait>(db: &C, user_id: &str) -> Result<bool, DbErr> {
    Ok(user::Entity::find_by_id(user_id)
        .select_only()
        .column(user::Column::MailboxApprovedAt)
        .into_tuple::<Option<PrimitiveDateTime>>()
        .one(db)
        .await?
        .flatten()
        .is_some())
}

pub async fn user_id_by_email<C: ConnectionTrait>(
    db: &C,
    email: &str,
) -> Result<Option<String>, DbErr> {
    user::Entity::find()
        .select_only()
        .column(user::Column::Id)
        .filter(user::Column::Email.eq(email))
        .into_tuple()
        .one(db)
        .await
}

pub async fn vault<C: ConnectionTrait>(
    db: &C,
    entry_id: &str,
) -> Result<Option<mail_vault_backup::Model>, DbErr> {
    mail_vault_backup::Entity::find()
        .filter(mail_vault_backup::Column::DirectoryEntryId.eq(entry_id))
        .one(db)
        .await
}

/// Inserts or replaces the entry's vault.
pub async fn upsert_vault<C: ConnectionTrait>(
    db: &C,
    entry_id: &str,
    vault: Vault,
) -> Result<mail_vault_backup::Model, DbErr> {
    use mail_vault_backup::Column;
    let now = instant::now();
    let columns = [
        Column::WrappedSecret,
        Column::WrapAlgorithm,
        Column::VaultVersion,
        Column::EncryptedVaultB64,
        Column::Kdf,
        Column::KdfSaltB64,
        Column::KdfMemoryKib,
        Column::KdfIterations,
        Column::KdfParallelism,
        Column::UpdatedAt,
    ];
    let row = mail_vault_backup::ActiveModel {
        id: Set(cuid()),
        directory_entry_id: Set(entry_id.to_owned()),
        vault_version: Set(vault.vault_version),
        encrypted_vault_b64: Set(vault.encrypted_vault_b64),
        kdf: Set(vault.kdf),
        kdf_salt_b64: Set(vault.kdf_salt_b64),
        kdf_memory_kib: Set(vault.kdf_memory_kib),
        kdf_iterations: Set(vault.kdf_iterations),
        kdf_parallelism: Set(vault.kdf_parallelism),
        wrapped_secret: Set(Some(vault.wrapped_secret)),
        wrap_algorithm: Set(vault.wrap_algorithm),
        created_at: Set(now),
        updated_at: Set(now),
    };
    mail_vault_backup::Entity::insert(row)
        .on_conflict(
            OnConflict::column(Column::DirectoryEntryId)
                .update_columns(columns)
                .to_owned(),
        )
        .exec_with_returning(db)
        .await
}

pub async fn insert_entry<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    provisioned: Provisioned<'_>,
) -> Result<(), DbErr> {
    let vault = provisioned.vault.clone();
    let entry = mail_directory_entry::ActiveModel {
        user_id: Set(Some(user_id.to_owned())),
        ..entry_columns(provisioned)
    }
    .insert(db)
    .await?;
    upsert_vault(db, &entry.id, vault).await?;
    Ok(())
}

/// Rewrites an existing entry for the provisioned mailbox, linking it to `user_id` when it had no owner.
pub async fn update_entry<C: ConnectionTrait>(
    db: &C,
    entry_id: &str,
    link_user: Option<&str>,
    provisioned: Provisioned<'_>,
) -> Result<(), DbErr> {
    let vault = provisioned.vault.clone();
    mail_directory_entry::ActiveModel {
        id: Unchanged(entry_id.to_owned()),
        user_id: link_user.map_or(NotSet, |user_id| Set(Some(user_id.to_owned()))),
        ..entry_columns(provisioned)
    }
    .update(db)
    .await?;
    upsert_vault(db, entry_id, vault).await?;
    Ok(())
}

fn entry_columns(provisioned: Provisioned<'_>) -> mail_directory_entry::ActiveModel {
    mail_directory_entry::ActiveModel {
        stalwart_account_id: Set(provisioned.stalwart_account_id.to_owned()),
        email: Set(provisioned.email.to_owned()),
        local_part: Set(provisioned.local_part.to_owned()),
        domain: Set(provisioned.domain.to_owned()),
        display_name: Set(provisioned.display_name),
        stalwart_domain_id: Set(provisioned.stalwart_domain_id.to_owned()),
        stalwart_public_key_id: Set(Some(provisioned.stalwart_public_key_id.to_owned())),
        public_key_armored: Set(provisioned.public_key_armored.to_owned()),
        public_key_fingerprint: Set(provisioned.fingerprint.to_owned()),
        key_algorithm: Set(provisioned.key_algorithm.to_owned()),
        source: Set("internal".into()),
        trust: Set("verified".into()),
        key_created_at: Set(Some(provisioned.key_created_at)),
        ..Default::default()
    }
}

pub async fn delete_sync_states<C: ConnectionTrait>(db: &C, entry_id: &str) -> Result<(), DbErr> {
    mail_jmap_sync_state::Entity::delete_many()
        .filter(mail_jmap_sync_state::Column::DirectoryEntryId.eq(entry_id))
        .exec(db)
        .await
        .map(|_| ())
}

pub async fn delete_entry<C: ConnectionTrait>(db: &C, entry_id: &str) -> Result<(), DbErr> {
    mail_directory_entry::Entity::delete_by_id(entry_id)
        .exec(db)
        .await
        .map(|_| ())
}

/// A directory entry owned by a Solace user.
pub struct LinkedMailbox {
    pub user_id: String,
    pub stalwart_account_id: String,
}

/// The linked entry whose unique `column` (Stalwart account id or address) equals `value`.
pub async fn linked_mailbox<C: ConnectionTrait>(
    db: &C,
    column: mail_directory_entry::Column,
    value: &str,
) -> Result<Option<LinkedMailbox>, DbErr> {
    let row: Option<(Option<String>, String)> = mail_directory_entry::Entity::find()
        .select_only()
        .column(mail_directory_entry::Column::UserId)
        .column(mail_directory_entry::Column::StalwartAccountId)
        .filter(column.eq(value))
        .into_tuple()
        .one(db)
        .await?;
    Ok(row.and_then(|(user_id, stalwart_account_id)| {
        Some(LinkedMailbox {
            user_id: user_id?,
            stalwart_account_id,
        })
    }))
}

/// The user's app-notification switch; `None` before their settings exist.
pub async fn push_notifications<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Option<bool>, DbErr> {
    user_settings::Entity::find()
        .select_only()
        .column(user_settings::Column::PushNotifications)
        .filter(user_settings::Column::UserId.eq(user_id))
        .into_tuple()
        .one(db)
        .await
}

/// Whether a `new_mail` push for this email is queued, in flight or retrying (the worker keeps those `pending`) or was sent; a `skipped` one may be queued again.
pub async fn new_mail_job_exists<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    email_id: &str,
) -> Result<bool, DbErr> {
    let found: Option<String> = notification_job::Entity::find()
        .select_only()
        .column(notification_job::Column::Id)
        .filter(notification_job::Column::UserId.eq(user_id))
        .filter(notification_job::Column::Kind.eq("new_mail"))
        .filter(notification_job::Column::Channel.eq("push"))
        .filter(notification_job::Column::Status.is_in(["pending", "sent"]))
        .filter(
            Expr::col(notification_job::Column::Payload)
                .cast_json_field("emailId")
                .eq(email_id),
        )
        .into_tuple()
        .one(db)
        .await?;
    Ok(found.is_some())
}

pub async fn insert_new_mail_job<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    payload: Value,
) -> Result<(), DbErr> {
    notification_job::ActiveModel {
        user_id: Set(user_id.to_owned()),
        kind: Set("new_mail".into()),
        channel: Set("push".into()),
        payload: Set(payload),
        status: Set("pending".into()),
        available_at: Set(instant::now()),
        ..Default::default()
    }
    .insert(db)
    .await
    .map(drop)
}

/// Linked mailboxes, for receipt-time sync.
pub async fn linked_mailboxes<C: ConnectionTrait>(
    db: &C,
) -> Result<Vec<mail_directory_entry::Model>, DbErr> {
    mail_directory_entry::Entity::find()
        .filter(mail_directory_entry::Column::UserId.is_not_null())
        .all(db)
        .await
}

pub async fn sync_state<C: ConnectionTrait>(
    db: &C,
    directory_entry_id: &str,
) -> Result<Option<mail_jmap_sync_state::Model>, DbErr> {
    mail_jmap_sync_state::Entity::find()
        .filter(mail_jmap_sync_state::Column::DirectoryEntryId.eq(directory_entry_id))
        .one(db)
        .await
}

pub struct States<'a> {
    pub email: &'a str,
    pub mailbox: &'a str,
    pub thread: Option<&'a str>,
}

pub async fn advance<C: ConnectionTrait>(
    db: &C,
    row: mail_jmap_sync_state::Model,
    states: &States<'_>,
) -> Result<mail_jmap_sync_state::Model, DbErr> {
    let now = instant::now();
    let mut active: mail_jmap_sync_state::ActiveModel = row.into();
    active.email_state = Set(states.email.to_owned());
    active.mailbox_state = Set(states.mailbox.to_owned());
    active.thread_state = Set(states.thread.map(str::to_owned));
    active.last_synced_at = Set(Some(now));
    active.updated_at = Set(now);
    active.update(db).await
}

/// Prisma's `upsert` on the directory entry, as one statement.
pub async fn store_initial<C: ConnectionTrait>(
    db: &C,
    directory_entry_id: &str,
    account_id: &str,
    states: &States<'_>,
) -> Result<mail_jmap_sync_state::Model, DbErr> {
    use mail_jmap_sync_state::Column;
    let now = instant::now();
    let row = mail_jmap_sync_state::ActiveModel {
        id: Set(cuid()),
        directory_entry_id: Set(directory_entry_id.to_owned()),
        stalwart_account_id: Set(account_id.to_owned()),
        email_state: Set(states.email.to_owned()),
        mailbox_state: Set(states.mailbox.to_owned()),
        thread_state: Set(states.thread.map(str::to_owned)),
        last_synced_at: Set(Some(now)),
        created_at: Set(now),
        updated_at: Set(now),
    };
    mail_jmap_sync_state::Entity::insert(row)
        .on_conflict(
            OnConflict::column(Column::DirectoryEntryId)
                .update_columns([
                    Column::StalwartAccountId,
                    Column::EmailState,
                    Column::MailboxState,
                    Column::ThreadState,
                    Column::LastSyncedAt,
                    Column::UpdatedAt,
                ])
                .to_owned(),
        )
        .exec_with_returning(db)
        .await
}
