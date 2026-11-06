use sea_orm::ConnectionTrait;
use sea_orm_migration::prelude::*;

/// Data only: search runs on the device, so the keyed word tokens that let the server link events by shared words go.
const CLEAR: &str = r#"
UPDATE "calendar_event" SET "blind_index_tokens" = NULL WHERE "blind_index_tokens" IS NOT NULL;
UPDATE "calendar" SET "blind_index_tokens" = NULL WHERE "blind_index_tokens" IS NOT NULL;
UPDATE "event_category" SET "blind_index_tokens" = NULL WHERE "blind_index_tokens" IS NOT NULL;
"#;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager.get_connection().execute_unprepared(CLEAR).await?;
        Ok(())
    }
}
