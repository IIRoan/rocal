use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // App-only preferences sealed on the device.
        manager
            .alter_table(
                Table::alter()
                    .table("user_settings")
                    .add_column(ColumnDef::new("encrypted_preferences").text())
                    .to_owned(),
            )
            .await
    }
}
