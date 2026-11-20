use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Deleted events move here as JSON copies of their rows for 30 days; the user cascade covers account deletion by any API version.
        manager
            .get_connection()
            .execute_unprepared(
                r#"CREATE TABLE event_trash (
                    id text PRIMARY KEY,
                    user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE ON UPDATE CASCADE,
                    event_id text NOT NULL,
                    calendar_id text NOT NULL,
                    rows jsonb NOT NULL,
                    trashed_at timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
                CREATE INDEX event_trash_user_id_trashed_at_idx ON event_trash (user_id, trashed_at DESC);
                CREATE INDEX event_trash_trashed_at_idx ON event_trash (trashed_at);"#,
            )
            .await?;
        Ok(())
    }
}
