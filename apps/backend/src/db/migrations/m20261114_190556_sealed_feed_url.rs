use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // A feed URL sealed on the device; sealed rows keep only a `sealed:<id>` placeholder in `url`.
        manager
            .alter_table(
                Table::alter()
                    .table("calendar_subscription")
                    .add_column(ColumnDef::new("encrypted_url").text())
                    .to_owned(),
            )
            .await
    }
}
