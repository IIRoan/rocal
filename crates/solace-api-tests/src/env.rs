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
/// Local S3 mock (adobe/s3mock) holding the avatar bucket, started by `cargo xtask test-env up`; it ignores credentials.
pub const LOCAL_S3_PORT: u16 = 59000;
pub const LOCAL_AVATAR_BUCKET: &str = "solace-test-avatars";
/// Fixed server secrets for local runs, shared by both backends so sessions and bridge passwords interoperate.
pub const LOCAL_BETTER_AUTH_SECRET: &str = "solace-test-better-auth-secret-local-0001";
pub const LOCAL_MAIL_BRIDGE_HMAC_KEY: &str = "solace-test-mail-bridge-hmac-local-0001";
pub const LOCAL_STALWART_WEBHOOK_SECRET: &str = "solace-test-stalwart-webhook-local-0001";
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
    /// Backend-gate key of an https test Stalwart (`TEST_STALWART_GATE_KEY`); unset for local plain HTTP.
    pub stalwart_gate_key: Option<String>,
    /// Secrets the backend under test runs with (`TEST_BETTER_AUTH_SECRET` etc.), defaulting to the `LOCAL_*` ones.
    pub better_auth_secret: String,
    pub mail_bridge_hmac_key: String,
    pub stalwart_webhook_secret: String,
    /// The avatar bucket (`TEST_AVATAR_BUCKET*`), the local S3 mock unless set.
    pub avatar_bucket: AvatarBucket,
}

#[derive(Debug, Clone)]
pub struct AvatarBucket {
    pub name: String,
    pub endpoint: String,
    pub region: String,
    pub access_key_id: String,
    pub secret_access_key: String,
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
            stalwart_gate_key: std::env::var("TEST_STALWART_GATE_KEY").ok(),
            better_auth_secret: var("TEST_BETTER_AUTH_SECRET", LOCAL_BETTER_AUTH_SECRET.into()),
            mail_bridge_hmac_key: var(
                "TEST_MAIL_BRIDGE_HMAC_KEY",
                LOCAL_MAIL_BRIDGE_HMAC_KEY.into(),
            ),
            stalwart_webhook_secret: var(
                "TEST_STALWART_WEBHOOK_SECRET",
                LOCAL_STALWART_WEBHOOK_SECRET.into(),
            ),
            avatar_bucket: AvatarBucket {
                name: var("TEST_AVATAR_BUCKET", LOCAL_AVATAR_BUCKET.into()),
                endpoint: var(
                    "TEST_AVATAR_BUCKET_ENDPOINT",
                    format!("http://127.0.0.1:{LOCAL_S3_PORT}"),
                ),
                region: var("TEST_AVATAR_BUCKET_REGION", "us-east-1".into()),
                access_key_id: var("TEST_AVATAR_BUCKET_ACCESS_KEY_ID", "solace-test-s3".into()),
                secret_access_key: var(
                    "TEST_AVATAR_BUCKET_SECRET_ACCESS_KEY",
                    "solace-test-s3-secret".into(),
                ),
            },
        };
        guard::check_bucket("TEST_AVATAR_BUCKET", &env.avatar_bucket.name)?;
        guard::check_secret("TEST_BETTER_AUTH_SECRET", &env.better_auth_secret)?;
        guard::check_secret("TEST_MAIL_BRIDGE_HMAC_KEY", &env.mail_bridge_hmac_key)?;
        guard::check_secret("TEST_STALWART_WEBHOOK_SECRET", &env.stalwart_webhook_secret)?;
        if let Some(key) = &env.stalwart_gate_key {
            guard::check_secret("TEST_STALWART_GATE_KEY", key)?;
        }
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

/// Where a backend under test listens and which mode it runs in.
pub struct BackendTarget<'a> {
    pub port: u16,
    pub production: bool,
    pub database_url: &'a str,
    pub stalwart_provision_token: &'a str,
}

/// The production web origin the suite's browser agents send in production mode.
pub const PRODUCTION_FRONTEND_URL: &str = "https://solace.test";
/// Production mode uses unresolvable `.test` URLs: they only name cookie domains, origins and the passkey RP.
pub const PRODUCTION_BACKEND_URL: &str = "https://api.solace.test";
pub const DEVELOPMENT_FRONTEND_URL: &str = "http://localhost:4100";

impl TestEnv {
    /// The environment both backends run with, so the TypeScript and Rust servers see identical settings.
    pub fn backend_vars(&self, target: &BackendTarget<'_>) -> Vec<(&'static str, String)> {
        let (node_env, backend_url, frontend_url) = if target.production {
            (
                "production",
                PRODUCTION_BACKEND_URL.to_owned(),
                PRODUCTION_FRONTEND_URL,
            )
        } else {
            (
                "development",
                format!("http://localhost:{}", target.port),
                DEVELOPMENT_FRONTEND_URL,
            )
        };
        let mut vars = vec![
            ("NODE_ENV", node_env.to_owned()),
            ("PORT", target.port.to_string()),
            ("BACKEND_URL", backend_url),
            ("FRONTEND_URL", frontend_url.to_owned()),
            ("PASSKEY_ORIGIN", frontend_url.to_owned()),
            ("DATABASE_URL", target.database_url.to_owned()),
            ("BETTER_AUTH_SECRET", self.better_auth_secret.clone()),
            ("MAIL_BRIDGE_HMAC_KEY", self.mail_bridge_hmac_key.clone()),
            (
                "STALWART_WEBHOOK_SECRET",
                self.stalwart_webhook_secret.clone(),
            ),
            // Every STALWART_* variable is set: the TypeScript backend otherwise falls back to production Stalwart.
            ("STALWART_BASE_URL", self.stalwart_url.clone()),
            ("STALWART_JMAP_URL", self.stalwart_url.clone()),
            ("STALWART_DEFAULT_DOMAIN", self.mail_domain.clone()),
            (
                "STALWART_PROVISION_TOKEN",
                target.stalwart_provision_token.to_owned(),
            ),
            ("STALWART_ADMIN_TOKEN", String::new()),
            (
                "STALWART_GATE_KEY",
                self.stalwart_gate_key.clone().unwrap_or_default(),
            ),
            (
                "STALWART_JMAP_USERNAME",
                format!("noreply@{}", self.mail_domain),
            ),
            (
                "STALWART_JMAP_PASSWORD",
                self.stalwart_noreply_password.clone(),
            ),
            (
                "STALWART_WEBHOOK_URL",
                format!(
                    "http://host.containers.internal:{}/api/internal/stalwart/webhook",
                    target.port
                ),
            ),
            ("EMAIL_FROM", format!("noreply@{}", self.mail_domain)),
            ("EMAIL_FROM_NAME", "Solace Test".to_owned()),
        ];
        let bucket = &self.avatar_bucket;
        vars.extend([
            ("AVATAR_BUCKET", bucket.name.clone()),
            ("AVATAR_BUCKET_ENDPOINT", bucket.endpoint.clone()),
            ("AVATAR_BUCKET_REGION", bucket.region.clone()),
            ("AVATAR_BUCKET_ACCESS_KEY_ID", bucket.access_key_id.clone()),
            (
                "AVATAR_BUCKET_SECRET_ACCESS_KEY",
                bucket.secret_access_key.clone(),
            ),
        ]);
        vars
    }
}
