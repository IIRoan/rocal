//! Test environment settings: environment variables over the local podman defaults, all passed through the guard.

use crate::guard::{self, GuardError};

/// Local Postgres 18 container started by `cargo xtask test-env up`.
pub const LOCAL_POSTGRES_PORT: u16 = 55432;
pub const LOCAL_POSTGRES_USER: &str = "solace_test";
pub const LOCAL_POSTGRES_PASSWORD: &str = "solace-test-pg";
/// Local test Stalwart container (apps/stalwart/test-env) started by `cargo xtask test-env up`.
pub const LOCAL_STALWART_PORT: u16 = 58080;
pub const LOCAL_STALWART_ADMIN_PASSWORD: &str = "solace-test-admin-local";
pub const LOCAL_STALWART_PROVISIONER_PASSWORD: &str = "solace-test-provisioner-local";
pub const LOCAL_STALWART_NOREPLY_PASSWORD: &str = "solace-test-noreply-local";
/// Fixed server secrets for local runs, shared by both backends so sessions and bridge passwords interoperate.
pub struct LocalSecrets {
    pub better_auth: &'static str,
    pub mail_bridge_hmac: &'static str,
    pub stalwart_webhook: &'static str,
}
pub const LOCAL_SECRETS: LocalSecrets = LocalSecrets {
    better_auth: "solace-test-better-auth-secret-local-0001",
    mail_bridge_hmac: "solace-test-mail-bridge-hmac-local-0001",
    stalwart_webhook: "solace-test-stalwart-webhook-local-0001",
};
/// Database every test database is cloned from.
pub const TEMPLATE_DATABASE: &str = "solace_test_template";
/// Mail domain of the test Stalwart (RFC 2606 reserved).
pub const TEST_MAIL_DOMAIN: &str = "solace.test";

#[derive(Debug, Clone)]
pub struct TestEnv {
    /// Maintenance connection to the test Postgres server (`TEST_DATABASE_URL`).
    pub database_url: String,
    pub stalwart_url: String,
    pub stalwart_admin_password: String,
    pub stalwart_provisioner_password: String,
    pub stalwart_noreply_password: String,
    pub mail_domain: String,
}

impl TestEnv {
    pub fn from_env() -> Result<Self, GuardError> {
        let var = |name: &str, default: String| std::env::var(name).unwrap_or(default);
        let env = Self {
            database_url: var(
                "TEST_DATABASE_URL",
                format!(
                    "postgres://{LOCAL_POSTGRES_USER}:{LOCAL_POSTGRES_PASSWORD}@127.0.0.1:{LOCAL_POSTGRES_PORT}/solace_test"
                ),
            ),
            stalwart_url: var(
                "TEST_STALWART_URL",
                format!("http://127.0.0.1:{LOCAL_STALWART_PORT}"),
            ),
            stalwart_admin_password: var(
                "TEST_STALWART_ADMIN_PASSWORD",
                LOCAL_STALWART_ADMIN_PASSWORD.into(),
            ),
            stalwart_provisioner_password: var(
                "TEST_STALWART_PROVISIONER_PASSWORD",
                LOCAL_STALWART_PROVISIONER_PASSWORD.into(),
            ),
            stalwart_noreply_password: var(
                "TEST_STALWART_NOREPLY_PASSWORD",
                LOCAL_STALWART_NOREPLY_PASSWORD.into(),
            ),
            mail_domain: var("TEST_MAIL_DOMAIN", TEST_MAIL_DOMAIN.into()),
        };
        guard::check_database_url("TEST_DATABASE_URL", &env.database_url)?;
        guard::check_service_url("TEST_STALWART_URL", &env.stalwart_url)?;
        guard::check_secret("TEST_STALWART_ADMIN_PASSWORD", &env.stalwart_admin_password)?;
        guard::check_secret(
            "TEST_STALWART_PROVISIONER_PASSWORD",
            &env.stalwart_provisioner_password,
        )?;
        guard::check_secret(
            "TEST_STALWART_NOREPLY_PASSWORD",
            &env.stalwart_noreply_password,
        )?;
        guard::check_mail_domain("TEST_MAIL_DOMAIN", &env.mail_domain)?;
        Ok(env)
    }

    /// The same server, another database; the name keeps the guard's `solace_test` prefix.
    pub fn database_url_for(&self, database: &str) -> Result<String, GuardError> {
        let mut url = url::Url::parse(&self.database_url)
            .map_err(|_| GuardError::InvalidUrl("TEST_DATABASE_URL"))?;
        url.set_path(database);
        let url = url.to_string();
        guard::check_database_url("database", &url)?;
        Ok(url)
    }
}
