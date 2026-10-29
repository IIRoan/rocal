use sea_orm::{ConnectionTrait, DbBackend, Statement};
use sea_orm_migration::prelude::*;

/// The last of the 53 migrations Prisma applied; a database Prisma migrated must have reached it.
const LAST_PRISMA_MIGRATION: &str = "20260928150000_add_pending_avatar_id";

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();
        if !manager.has_table("_prisma_migrations").await? {
            db.execute_unprepared(include_str!("m20260928_150000_prisma_baseline.sql"))
                .await?;
            return Ok(());
        }
        // Production already has this schema from Prisma, so it is only recorded.
        let reached = db
            .query_one_raw(Statement::from_sql_and_values(
                DbBackend::Postgres,
                r#"SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = $1 AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL"#,
                [LAST_PRISMA_MIGRATION.into()],
            ))
            .await?;
        match reached {
            Some(_) => Ok(()),
            None => Err(DbErr::Migration(format!(
                "Prisma never applied {LAST_PRISMA_MIGRATION}; finish the Prisma migrations before this baseline"
            ))),
        }
    }
}
