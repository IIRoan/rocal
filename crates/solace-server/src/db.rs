//! The one database pool, the generated entities, and the id and timestamp defaults Prisma used to set.

mod behavior;
pub mod entities;
#[cfg(test)]
pub mod scratch;

pub use behavior::cuid;

use std::time::Duration;

use sea_orm::{ConnectOptions, Database, DatabaseConnection, DbErr};

/// Small on purpose: memory per connection is part of the budget.
const MAX_CONNECTIONS: u32 = 10;

pub async fn connect(url: &str) -> Result<DatabaseConnection, DbErr> {
    let mut options = ConnectOptions::new(url);
    options
        .max_connections(MAX_CONNECTIONS)
        .min_connections(0)
        .acquire_timeout(Duration::from_secs(10))
        .idle_timeout(Duration::from_secs(300))
        .sqlx_logging(false);
    Database::connect(options).await
}
