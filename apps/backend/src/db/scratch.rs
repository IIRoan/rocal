//! Unit-test databases cloned from the suite's template on the local test Postgres, dropped afterwards.
// Test support: a setup failure aborts the test, which is what a panic is for here.
#![allow(clippy::unwrap_used, clippy::expect_used)]

use sea_orm::{ConnectionTrait, Database, DatabaseConnection, SqlxPostgresConnector};

/// The test Postgres of `cargo xtask test-env up`; `TEST_DATABASE_URL` may point elsewhere, but only at a test server.
const LOCAL_SERVER: &str = "postgres://solace_test:solace-test-pg@127.0.0.1:55432/solace_test";
const TEMPLATE: &str = "solace_test_template";

pub struct ScratchDatabase {
    pub db: DatabaseConnection,
    pub url: String,
    admin_url: String,
    name: String,
}

impl ScratchDatabase {
    pub async fn create() -> Self {
        let admin_url = std::env::var("TEST_DATABASE_URL").unwrap_or_else(|_| LOCAL_SERVER.into());
        let mut url = url::Url::parse(&admin_url).expect("TEST_DATABASE_URL");
        assert!(
            url.password()
                .is_some_and(|p| p.starts_with("solace-test-")),
            "unit tests only run against the test Postgres"
        );
        let name = format!("solace_test_unit_{}", uuid::Uuid::new_v4().simple());
        let admin = Database::connect(&admin_url)
            .await
            .expect("connect to the test Postgres (cargo xtask test-env up)");
        admin
            .execute_unprepared(&format!("CREATE DATABASE {name} TEMPLATE {TEMPLATE}"))
            .await
            .expect("clone the template database (cargo xtask test-env template)");
        let _ = admin.close().await;
        url.set_path(&name);
        let pool = sea_orm::sqlx::postgres::PgPoolOptions::new()
            .max_connections(4)
            .connect(url.as_str())
            .await
            .expect("connect to the scratch database");
        Self {
            db: SqlxPostgresConnector::from_sqlx_postgres_pool(pool),
            url: url.to_string(),
            admin_url,
            name,
        }
    }
}

impl Drop for ScratchDatabase {
    fn drop(&mut self) {
        let (admin_url, name) = (self.admin_url.clone(), self.name.clone());
        // Drop runs inside the test's runtime, so the cleanup gets a thread and runtime of its own.
        let cleanup = std::thread::spawn(move || {
            let runtime = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build();
            if let Ok(runtime) = runtime {
                runtime.block_on(async {
                    if let Ok(admin) = Database::connect(&admin_url).await {
                        let _ = admin
                            .execute_unprepared(&format!(
                                "DROP DATABASE IF EXISTS {name} WITH (FORCE)"
                            ))
                            .await;
                        let _ = admin.close().await;
                    }
                });
            }
        });
        let _ = cleanup.join();
    }
}
