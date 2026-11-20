use sea_orm::ConnectionTrait;
use sea_orm_migration::prelude::*;

/// Data only: devices keep their own wrapped keys, so the server copies go wherever a password envelope can still open the account.
const BLANK: &str = r#"
UPDATE "user_encryption_device" AS device
   SET "wrapped_account_key" = '', "wrapped_search_key" = ''
 WHERE (device."wrapped_account_key" <> '' OR device."wrapped_search_key" <> '')
   AND EXISTS (SELECT 1 FROM "user_encryption_password" AS envelope WHERE envelope."user_id" = device."user_id");
"#;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager.get_connection().execute_unprepared(BLANK).await?;
        Ok(())
    }
}
