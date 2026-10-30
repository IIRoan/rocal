//! Typed configuration from the environment, parsed once at boot.

use thiserror::Error;

use crate::integrations::stalwart::mailer::MailerConfig;

const DEV_BACKEND_URL: &str = "http://localhost:4001";
const DEV_FRONTEND_URL: &str = "http://localhost:4000";
const DEFAULT_STALWART_BASE_URL: &str = "https://mail.solace.onl";
const DEFAULT_MOBILE_AUTH_CALLBACK_URL: &str = "solace://api/auth";
const AUTH_SECRET_MIN_LENGTH: usize = 32;
const DEV_AUTH_SECRET: &str = "default-dev-secret-change-in-production";

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ConfigError {
    #[error(
        "BETTER_AUTH_SECRET must be set to at least {AUTH_SECRET_MIN_LENGTH} characters in production."
    )]
    WeakAuthSecret,
    #[error("{0} must be set.")]
    Missing(&'static str),
    #[error("{0} is not a valid value.")]
    Invalid(&'static str),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SameSite {
    Lax,
    Strict,
    None,
}

impl SameSite {
    /// Better Auth writes the attribute capitalized; the step-up cookie writes it as configured.
    pub fn better_auth(self) -> &'static str {
        match self {
            Self::Lax => "Lax",
            Self::Strict => "Strict",
            Self::None => "None",
        }
    }

    pub fn lowercase(self) -> &'static str {
        match self {
            Self::Lax => "lax",
            Self::Strict => "strict",
            Self::None => "none",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub backend_url: String,
    pub frontend_url: String,
    /// `NEXT_PUBLIC_APP_URL`, trusted beside the frontend.
    pub app_url: Option<String>,
    pub is_production: bool,
    pub cookie_same_site: SameSite,
    /// `AUTH_COOKIE_PREFIX`: a test environment on a production subdomain renames its cookies so they never overwrite or clear production's.
    pub auth_cookie_prefix: Option<String>,
    pub mobile_auth_callback_url: String,
    pub trusted_origins: Vec<String>,
    pub passkey_origin: String,
    pub auth_secret: String,
    pub database_url: String,
    pub database_pool_size: u32,
    pub stalwart_base_url: String,
    pub stalwart_default_domain: String,
    /// Scoped to Stalwart's registry (`solace-provisioner`); it must never read mailbox data.
    pub stalwart_provision_token: String,
    /// `noreplyEmail`: the address app mail comes from, known even without mailer credentials.
    pub noreply_email: String,
    /// The noreply identity app mail is sent as; mail is disabled without its credentials.
    pub mailer: Option<MailerConfig>,
    /// Verifies Stalwart's signed webhooks; the webhook answers 503 without it.
    pub stalwart_webhook_secret: Option<String>,
    /// The backend-gate key the Railway Stalwart domain requires (`apps/stalwart/backend-gate.cfg`).
    pub stalwart_gate_key: Option<String>,
    pub stalwart_admin_user_ids: Vec<String>,
    pub stalwart_admin_gate_key: Option<String>,
    /// `main.ts` polled every linked mailbox only outside Vercel, so production never did; it stays off unless set, since it widens server-side invite ingestion.
    pub mail_receipt_polling: bool,
    /// `CALENDAR_SYNC=false` keeps a deployment that doesn't serve the API yet from syncing feeds beside the one that does.
    pub calendar_sync: bool,
    /// Base64 HMAC key for the per-user Stalwart bridge passwords; mail tokens fail without it.
    pub mail_bridge_hmac_key: Option<String>,
    /// The private profile-picture bucket; uploads are unavailable without it.
    pub avatar_bucket: Option<AvatarBucketConfig>,
}

/// `env.avatarBucket`: an S3-compatible bucket (Railway) holding only re-encoded avatar variants.
#[derive(Debug, Clone)]
pub struct AvatarBucketConfig {
    pub name: String,
    pub endpoint: String,
    pub region: String,
    pub access_key_id: String,
    pub secret_access_key: String,
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        Self::from_lookup(|name| std::env::var(name).ok())
    }

    /// Reads variables through `lookup`, so tests build a config without touching the process environment.
    pub fn from_lookup(lookup: impl Fn(&str) -> Option<String>) -> Result<Self, ConfigError> {
        let var = |name: &str| lookup(name).filter(|value| !value.is_empty());
        let is_production = var("NODE_ENV").as_deref() == Some("production");
        let backend_url = var("BACKEND_URL").unwrap_or_else(|| DEV_BACKEND_URL.into());
        let frontend_url = var("FRONTEND_URL")
            .or_else(|| var("NEXT_PUBLIC_APP_URL"))
            .unwrap_or_else(|| DEV_FRONTEND_URL.into());
        let app_url = var("NEXT_PUBLIC_APP_URL");
        let port = match var("PORT") {
            Some(port) => port.parse().map_err(|_| ConfigError::Invalid("PORT"))?,
            None => 4001,
        };
        let cookie_same_site = match var("AUTH_COOKIE_SAME_SITE").as_deref() {
            Some("strict") => SameSite::Strict,
            Some("none") => SameSite::None,
            _ => SameSite::Lax,
        };
        let noreply_email = noreply_email(&var);
        let passkey_origin = var("PASSKEY_ORIGIN")
            .or_else(|| app_url.clone())
            .unwrap_or_else(|| frontend_url.clone());
        Ok(Self {
            port,
            frontend_url,
            app_url,
            is_production,
            cookie_same_site,
            auth_cookie_prefix: var("AUTH_COOKIE_PREFIX").map(|prefix| prefix.trim().to_owned()),
            mobile_auth_callback_url: var("MOBILE_AUTH_CALLBACK_URL")
                .or_else(|| var("NEXT_PUBLIC_MOBILE_AUTH_CALLBACK_URL"))
                .unwrap_or_else(|| DEFAULT_MOBILE_AUTH_CALLBACK_URL.into()),
            trusted_origins: csv(var("TRUSTED_ORIGINS").as_deref()),
            passkey_origin,
            auth_secret: auth_secret(var("BETTER_AUTH_SECRET"), is_production)?,
            database_url: var("DATABASE_URL").ok_or(ConfigError::Missing("DATABASE_URL"))?,
            database_pool_size: match var("DATABASE_POOL_SIZE") {
                Some(size) => size
                    .parse()
                    .ok()
                    .filter(|size| *size > 0)
                    .ok_or(ConfigError::Invalid("DATABASE_POOL_SIZE"))?,
                None => crate::db::DEFAULT_POOL_SIZE,
            },
            stalwart_base_url: var("STALWART_BASE_URL")
                .unwrap_or_else(|| DEFAULT_STALWART_BASE_URL.into()),
            stalwart_default_domain: var("STALWART_DEFAULT_DOMAIN")
                .unwrap_or_else(|| "solace.onl".into()),
            stalwart_provision_token: trimmed(&var, "STALWART_PROVISION_TOKEN")
                .or_else(|| var("STALWART_ADMIN_TOKEN"))
                .unwrap_or_default(),
            mailer: mailer(&var, &noreply_email),
            noreply_email,
            stalwart_webhook_secret: trimmed(&var, "STALWART_WEBHOOK_SECRET"),
            stalwart_gate_key: trimmed(&var, "STALWART_GATE_KEY"),
            stalwart_admin_user_ids: csv(var("STALWART_ADMIN_USER_IDS").as_deref()),
            stalwart_admin_gate_key: trimmed(&var, "STALWART_ADMIN_GATE_KEY"),
            mail_receipt_polling: matches!(
                var("MAIL_RECEIPT_POLLING").as_deref(),
                Some("1" | "true")
            ),
            calendar_sync: !matches!(var("CALENDAR_SYNC").as_deref(), Some("0" | "false")),
            mail_bridge_hmac_key: trimmed(&var, "MAIL_BRIDGE_HMAC_KEY"),
            avatar_bucket: avatar_bucket(&var),
            backend_url,
        })
    }
}

/// The variable without surrounding whitespace, `None` when that leaves nothing.
fn trimmed(var: &impl Fn(&str) -> Option<String>, name: &str) -> Option<String> {
    var(name)
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn noreply_email(var: &impl Fn(&str) -> Option<String>) -> String {
    trimmed(var, "EMAIL_FROM")
        .or_else(|| var("AUTH_EMAIL_FROM").or_else(|| var("AUTH_RESET_EMAIL_FROM")))
        .and_then(|value| sender_address(&value))
        .unwrap_or_else(|| "noreply@solace.onl".into())
}

/// `email-client.ts`: Stalwart JMAP credentials and the noreply address and name.
fn mailer(var: &impl Fn(&str) -> Option<String>, from: &str) -> Option<MailerConfig> {
    let username = trimmed(var, "STALWART_JMAP_USERNAME")?;
    let password = var("STALWART_JMAP_PASSWORD")?;
    let base_url = var("STALWART_JMAP_URL")
        .or_else(|| var("STALWART_BASE_URL"))
        .unwrap_or_else(|| DEFAULT_STALWART_BASE_URL.into())
        .trim_end_matches('/')
        .to_owned();
    Some(MailerConfig {
        base_url,
        username,
        password,
        from: from.to_owned(),
        from_name: trimmed(var, "EMAIL_FROM_NAME").unwrap_or_else(|| "Solace".into()),
    })
}

fn avatar_bucket(var: &impl Fn(&str) -> Option<String>) -> Option<AvatarBucketConfig> {
    Some(AvatarBucketConfig {
        name: trimmed(var, "AVATAR_BUCKET")?,
        endpoint: trimmed(var, "AVATAR_BUCKET_ENDPOINT")?,
        region: trimmed(var, "AVATAR_BUCKET_REGION").unwrap_or_else(|| "auto".into()),
        access_key_id: trimmed(var, "AVATAR_BUCKET_ACCESS_KEY_ID")?,
        secret_access_key: trimmed(var, "AVATAR_BUCKET_SECRET_ACCESS_KEY")?,
    })
}

/// `Name <address>` → `address`.
/// A sender's bare address, shared with the notifications worker: `Name <address>`, `address (comment)` or an address; `None` without an `@`.
pub fn sender_address(raw: &str) -> Option<String> {
    let raw = raw.trim();
    let address = match (raw.rfind('<'), raw.rfind('>')) {
        (Some(open), Some(close)) if open < close => raw[open + 1..close].trim().to_owned(),
        _ => raw
            .split_whitespace()
            .find(|part| part.contains('@'))?
            .to_owned(),
    };
    address.contains('@').then_some(address)
}

/// A padded secret is kept as is: changing it would sign out every session.
fn auth_secret(secret: Option<String>, deployed: bool) -> Result<String, ConfigError> {
    let secret = secret.unwrap_or_default();
    if secret.trim().len() >= AUTH_SECRET_MIN_LENGTH {
        return Ok(secret);
    }
    if deployed {
        return Err(ConfigError::WeakAuthSecret);
    }
    Ok(if secret.trim().is_empty() {
        DEV_AUTH_SECRET.into()
    } else {
        secret
    })
}

fn csv(value: Option<&str>) -> Vec<String> {
    value
        .unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|entry| !entry.is_empty())
        .map(str::to_owned)
        .collect()
}

#[cfg(test)]
impl Config {
    /// A development config for unit tests: a test auth secret and database URL unless `vars` sets its own.
    pub fn for_tests(vars: &[(&str, &str)]) -> Self {
        Self::from_lookup(|name| {
            vars.iter()
                .find(|(key, _)| *key == name)
                .map(|(_, value)| (*value).to_owned())
                .or_else(|| match name {
                    "DATABASE_URL" => Some("postgres://localhost/solace_test".into()),
                    "BETTER_AUTH_SECRET" => Some("solace-test-auth-secret-0123456789abcdef".into()),
                    _ => None,
                })
        })
        .unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn config(vars: &[(&str, &str)]) -> Result<Config, ConfigError> {
        let vars: Vec<(String, String)> = vars
            .iter()
            .map(|(k, v)| ((*k).to_owned(), (*v).to_owned()))
            .collect();
        Config::from_lookup(move |name| {
            vars.iter()
                .find(|(key, _)| key == name)
                .map(|(_, value)| value.clone())
        })
    }

    const DB: (&str, &str) = ("DATABASE_URL", "postgres://localhost/solace_test");

    #[test]
    fn the_noreply_address_drops_a_display_name() {
        let named = config(&[DB, ("EMAIL_FROM", "Solace <noreply@solace.onl>")]).unwrap();
        assert_eq!(named.noreply_email, "noreply@solace.onl");
        let bare = config(&[DB, ("EMAIL_FROM", " noreply@solace.onl (Solace)")]).unwrap();
        assert_eq!(bare.noreply_email, "noreply@solace.onl");
        let unusable = config(&[DB, ("EMAIL_FROM", "Solace")]).unwrap();
        assert_eq!(unusable.noreply_email, "noreply@solace.onl");
    }

    #[test]
    fn a_missing_or_short_auth_secret_fails_when_deployed() {
        let production = ("NODE_ENV", "production");
        assert_eq!(
            config(&[production, DB]).err(),
            Some(ConfigError::WeakAuthSecret)
        );
        assert_eq!(
            config(&[production, DB, ("BETTER_AUTH_SECRET", "short")]).err(),
            Some(ConfigError::WeakAuthSecret)
        );
        let strong = "s".repeat(32);
        let padded = format!(" {strong} ");
        assert_eq!(
            config(&[production, DB, ("BETTER_AUTH_SECRET", &padded)])
                .map(|c| c.auth_secret)
                .ok(),
            Some(padded)
        );
    }

    #[test]
    fn only_local_runs_fall_back_to_a_development_auth_secret() {
        assert_eq!(
            config(&[DB]).map(|c| c.auth_secret).ok().as_deref(),
            Some(DEV_AUTH_SECRET)
        );
        assert_eq!(
            config(&[DB, ("BETTER_AUTH_SECRET", "local")])
                .map(|c| c.auth_secret)
                .ok()
                .as_deref(),
            Some("local")
        );
    }

    #[test]
    fn urls_fall_back_like_the_typescript_backend() {
        let config = config(&[DB, ("NEXT_PUBLIC_APP_URL", "https://app.example")]).unwrap();
        assert_eq!(config.backend_url, DEV_BACKEND_URL);
        assert_eq!(config.frontend_url, "https://app.example");
        assert_eq!(config.passkey_origin, "https://app.example");
        assert!(!config.is_production);
        assert_eq!(config.cookie_same_site, SameSite::Lax);
    }

    #[test]
    fn calendar_sync_runs_unless_switched_off() {
        assert!(config(&[DB]).unwrap().calendar_sync);
        assert!(
            config(&[DB, ("CALENDAR_SYNC", "true")])
                .unwrap()
                .calendar_sync
        );
        assert!(
            !config(&[DB, ("CALENDAR_SYNC", "false")])
                .unwrap()
                .calendar_sync
        );
        assert!(!config(&[DB, ("CALENDAR_SYNC", "0")]).unwrap().calendar_sync);
    }
}
