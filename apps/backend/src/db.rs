//! The one database pool, its migrations, the generated entities, and the id and timestamp defaults Prisma used to set.

mod behavior;
pub mod entities;
// `async_trait` rejects a named `SchemaManager` lifetime in a migration's `up`.
#[allow(elided_lifetimes_in_paths)]
mod migrations;
#[cfg(any(test, feature = "test-support"))]
pub mod scratch;

pub use behavior::cuid;
pub use migrations::{Migrator, migrate};

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
