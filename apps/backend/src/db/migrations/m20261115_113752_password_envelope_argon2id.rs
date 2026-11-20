use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Argon2id envelopes keep their memory and lanes; PBKDF2 rows leave both NULL.
        manager
            .alter_table(
                Table::alter()
                    .table("user_encryption_password")
                    .add_column(ColumnDef::new("kdf_memory_kib").integer())
                    .add_column(ColumnDef::new("kdf_parallelism").integer())
                    .to_owned(),
            )
            .await
    }
}
