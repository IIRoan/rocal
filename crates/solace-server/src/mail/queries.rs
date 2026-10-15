//! Mail directory entries, their vault backups and the user's mailbox approval.

use sea_orm::ActiveValue::{NotSet, Set, Unchanged};
use sea_orm::sea_query::OnConflict;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, DbErr, EntityTrait, QueryFilter, QuerySelect,
};
use time::PrimitiveDateTime;

use crate::db::cuid;
use crate::db::entities::{mail_directory_entry, mail_jmap_sync_state, mail_vault_backup, user};
use crate::instant;

/// What provisioning writes to an entry and its vault.
pub struct Provisioned<'a> {
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
    pub wrapped_secret: Option<String>,
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

/// Inserts or replaces the entry's vault; with `keep_seal`, a missing seal keeps the stored one.
pub async fn upsert_vault<C: ConnectionTrait>(
    db: &C,
    entry_id: &str,
    vault: Vault,
    keep_seal: bool,
) -> Result<mail_vault_backup::Model, DbErr> {
    use mail_vault_backup::Column;
    let now = instant::now();
    let mut columns = vec![
        Column::VaultVersion,
        Column::EncryptedVaultB64,
        Column::Kdf,
        Column::KdfSaltB64,
        Column::KdfMemoryKib,
        Column::KdfIterations,
        Column::KdfParallelism,
        Column::UpdatedAt,
    ];
    if !keep_seal || vault.wrapped_secret.is_some() {
        columns.push(Column::WrappedSecret);
    }
    if !keep_seal || vault.wrap_algorithm.is_some() {
        columns.push(Column::WrapAlgorithm);
    }
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
        wrapped_secret: Set(vault.wrapped_secret),
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
    stalwart_account_id: &str,
    user_id: &str,
    provisioned: Provisioned<'_>,
) -> Result<(), DbErr> {
    let vault = provisioned.vault.clone();
    let entry = entry_columns(provisioned);
    let entry = mail_directory_entry::ActiveModel {
        stalwart_account_id: Set(stalwart_account_id.to_owned()),
        user_id: Set(Some(user_id.to_owned())),
        ..entry
    }
    .insert(db)
    .await?;
    upsert_vault(db, &entry.id, vault, false).await?;
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
    upsert_vault(db, entry_id, vault, false).await?;
    Ok(())
}

fn entry_columns(provisioned: Provisioned<'_>) -> mail_directory_entry::ActiveModel {
    mail_directory_entry::ActiveModel {
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
