//! Schema migrations, applied in order at startup and recorded in `seaql_migrations`; each runs in its own transaction.

mod m20260928_150000_prisma_baseline;
mod m20261028_120000_encrypted_only_content;
mod m20261029_120000_drop_unused_storage;
mod m20261030_120000_encrypted_settings_preferences;
mod m20261030_130000_sealed_reminder_lead;

use sea_orm::{ConnectionTrait, DatabaseConnection, DbErr, TransactionTrait};
use sea_orm_migration::{MigrationTrait, MigratorTrait};

/// The advisory lock every migration runner takes, so the API and the worker starting together apply each migration once.
const MIGRATION_LOCK: i64 = 0x736f_6c61_6365;

pub struct Migrator;

#[sea_orm_migration::async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20260928_150000_prisma_baseline::Migration),
            Box::new(m20261028_120000_encrypted_only_content::Migration),
            Box::new(m20261029_120000_drop_unused_storage::Migration),
            Box::new(m20261030_120000_encrypted_settings_preferences::Migration),
            Box::new(m20261030_130000_sealed_reminder_lead::Migration),
        ]
    }
}

/// Applies the pending migrations; a second runner waits for the first, then finds nothing left to do.
pub async fn migrate(db: &DatabaseConnection) -> Result<(), DbErr> {
    // A transaction-scoped lock ends with this transaction, so a failed or dropped run never leaves it held.
    let lock = db.begin().await?;
    lock.execute_unprepared(&format!("SELECT pg_advisory_xact_lock({MIGRATION_LOCK})"))
        .await?;
    let migrated = Migrator::up(db, None).await;
    lock.commit().await?;
    migrated
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used, clippy::expect_used)]

    use sea_orm::{Database, Statement};

    use super::*;
    use crate::db::scratch::ScratchDatabase;

    /// Columns and indexes outside the two migration histories, which is everything the migrations change.
    async fn schema(db: &DatabaseConnection) -> Vec<String> {
        let rows = db
            .query_all_raw(Statement::from_string(
                sea_orm::DbBackend::Postgres,
                "SELECT concat_ws(' ', table_name, column_name, data_type, is_nullable, column_default) AS line
                   FROM information_schema.columns WHERE table_schema = 'public' AND table_name NOT IN ('_prisma_migrations', 'seaql_migrations')
                 UNION ALL SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename NOT IN ('_prisma_migrations', 'seaql_migrations')
                 ORDER BY 1",
            ))
            .await
            .unwrap();
        rows.iter()
            .map(|row| row.try_get("", "line").unwrap())
            .collect()
    }

    async fn prisma_history(db: &DatabaseConnection, last: &str) {
        db.execute_unprepared(&format!(
            r#"CREATE TABLE "_prisma_migrations" ("migration_name" text, "finished_at" timestamptz, "rolled_back_at" timestamptz);
               INSERT INTO "_prisma_migrations" VALUES ('{last}', now(), NULL);"#
        ))
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn a_database_prisma_migrated_ends_up_with_the_same_schema_as_a_new_one() {
        let new = ScratchDatabase::create().await;
        let production = ScratchDatabase::empty().await;
        // Production's schema came from Prisma, which recorded every migration it applied.
        production
            .db
            .execute_unprepared(include_str!(
                "migrations/m20260928_150000_prisma_baseline.sql"
            ))
            .await
            .unwrap();
        prisma_history(&production.db, "20260928150000_add_pending_avatar_id").await;

        migrate(&production.db).await.unwrap();

        assert_eq!(schema(&production.db).await, schema(&new.db).await);
    }

    #[tokio::test]
    async fn a_database_prisma_left_short_of_the_baseline_is_refused() {
        let stale = ScratchDatabase::empty().await;
        prisma_history(&stale.db, "20260928140000_add_user_avatar_id").await;

        let error = migrate(&stale.db).await.unwrap_err();

        assert!(
            error.to_string().contains("Prisma never applied"),
            "{error}"
        );
        assert!(schema(&stale.db).await.is_empty());
    }

    #[tokio::test]
    async fn two_runners_starting_together_apply_each_migration_once() {
        let scratch = ScratchDatabase::empty().await;
        let other = Database::connect(&scratch.url).await.unwrap();

        let (first, second) = tokio::join!(migrate(&scratch.db), migrate(&other));

        first.unwrap();
        second.unwrap();
        let applied = Migrator::get_applied_migrations(&scratch.db).await.unwrap();
        assert_eq!(applied.len(), Migrator::migrations().len());
        let _ = other.close().await;
    }
}
