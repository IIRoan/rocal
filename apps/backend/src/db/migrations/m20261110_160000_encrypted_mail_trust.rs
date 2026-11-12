use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Ciphertext survives until its owner deletes the account; peer identities are never indexed.
        manager.get_connection().execute_unprepared(
            "CREATE TABLE user_mail_trust (user_id TEXT PRIMARY KEY REFERENCES \"user\"(id) ON UPDATE CASCADE ON DELETE CASCADE, encrypted_trust TEXT NOT NULL)"
        ).await?;
        Ok(())
    }
}
