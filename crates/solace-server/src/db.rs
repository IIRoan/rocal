//! The one database pool, the generated entities, and the id and timestamp defaults Prisma used to set.

mod behavior;
pub mod entities;
#[cfg(test)]
pub mod scratch;

pub use behavior::cuid;

use std::time::Duration;

use sea_orm::{ConnectOptions, Database, DatabaseConnection, DbErr};

/// Small on purpose: memory per connection is part of the budget. `DATABASE_POOL_SIZE` overrides it.
pub const DEFAULT_POOL_SIZE: u32 = 10;

pub async fn connect(url: &str, pool_size: u32) -> Result<DatabaseConnection, DbErr> {
    let mut options = ConnectOptions::new(url);
    options
        .max_connections(pool_size)
        .min_connections(0)
        .acquire_timeout(Duration::from_secs(10))
        // sqlx pings every connection before handing it out, a second round trip per query; a broken one fails its query and is dropped.
        .test_before_acquire(false)
        .idle_timeout(Duration::from_secs(300))
        .sqlx_logging(false);
    Database::connect(options).await
}
