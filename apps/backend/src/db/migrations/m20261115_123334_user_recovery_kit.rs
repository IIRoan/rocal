use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Credential material that lives as long as the account and goes with it; only a SHA-256 of the recovery auth key is kept.
        manager.get_connection().execute_unprepared(
            "CREATE TABLE user_recovery_kit (user_id TEXT PRIMARY KEY REFERENCES \"user\"(id) ON UPDATE CASCADE ON DELETE CASCADE, auth_key_hash TEXT NOT NULL, wrapped_account_key TEXT NOT NULL, wrapped_search_key TEXT NOT NULL, key_version INTEGER NOT NULL, created_at TIMESTAMP(3) NOT NULL)"
        ).await?;
        Ok(())
    }
}
