use sea_orm::{ConnectionTrait, DbBackend, Statement};
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // An unsealed vault cannot be re-sealed by the server, so stop before changing anything; never delete one.
        let unsealed = manager
            .get_connection()
            .query_one_raw(Statement::from_string(
                DbBackend::Postgres,
                r#"SELECT 1 FROM "mail_vault_backup" WHERE "wrapped_secret" IS NULL OR btrim("wrapped_secret") = '' LIMIT 1"#,
            ))
            .await?;
        if unsealed.is_some() {
            return Err(DbErr::Migration(
                "mail_vault_backup has rows without wrapped_secret; have their owners re-seal them first".into(),
            ));
        }
        for table in [
            "oauth_access_token",
            "oauth_refresh_token",
            "oauth_consent",
            "oauth_client",
            "jwks",
            "calendar_sharing",
        ] {
            manager
                .drop_table(Table::drop().table(table).to_owned())
                .await?;
        }
        manager
            .alter_table(
                Table::alter()
                    .table("calendar")
                    .drop_column("force_full_encryption")
                    .drop_column("ics_share_token")
                    .drop_column("ics_share_enabled")
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table("user_settings")
                    .drop_column("event_encryption_mode")
                    .to_owned(),
            )
            .await?;
        manager
            .alter_table(
                Table::alter()
                    .table("mail_vault_backup")
                    .modify_column(ColumnDef::new("wrapped_secret").text().not_null())
                    .to_owned(),
            )
            .await
    }
}
