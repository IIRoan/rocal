use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // One overwritten operational snapshot keeps no per-account history or user content.
        manager.get_connection().execute_unprepared("CREATE TABLE mail_policy_monitor (singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), directory_cursor text, cycle_near_expiry boolean NOT NULL DEFAULT false, cycle_drift boolean NOT NULL DEFAULT false, near_expiry boolean NOT NULL DEFAULT false, drift boolean NOT NULL DEFAULT false, incomplete boolean NOT NULL DEFAULT true, last_pass_at bigint, next_pass_at bigint, last_cycle_at bigint); INSERT INTO mail_policy_monitor (singleton) VALUES (true)").await?;
        Ok(())
    }
}
