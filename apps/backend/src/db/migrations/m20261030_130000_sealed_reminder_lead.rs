use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // The reminder lead sealed on the device for the iPhone extension.
        manager
            .alter_table(
                Table::alter()
                    .table("event_notification")
                    .add_column(ColumnDef::new("encrypted_lead").text())
                    .to_owned(),
            )
            .await?;
        // Nothing shows encryption device labels any more, and the API has stopped storing them.
        manager
            .exec_stmt(
                Query::update()
                    .table("user_encryption_device")
                    .value("device_label", Expr::null())
                    .and_where(Expr::col("device_label").is_not_null())
                    .to_owned(),
            )
            .await
    }
}
