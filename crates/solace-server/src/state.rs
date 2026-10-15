//! `AppState`: the pool, HTTP clients, and everything derived from the config once at boot.

use std::sync::Arc;

use sea_orm::DatabaseConnection;

use crate::auth::cookies::CookieSettings;
use crate::config::Config;
use crate::http::origins::OriginPolicy;
use crate::integrations::safe_fetch::SafeFetch;
use crate::integrations::stalwart::gate::StalwartGate;
use crate::integrations::stalwart::mailer::MailerConfig;
use crate::integrations::storage::AvatarStorage;
use crate::mail::service::MailCache;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub db: DatabaseConnection,
    pub http: reqwest::Client,
    /// For calls that must see redirects instead of following them.
    pub http_no_redirect: reqwest::Client,
    pub origins: Arc<OriginPolicy>,
    pub cookies: Arc<CookieSettings>,
    pub stalwart_gate: Arc<StalwartGate>,
    pub mailer: Option<Arc<MailerConfig>>,
    /// The only client allowed to fetch user-supplied URLs.
    pub safe_fetch: SafeFetch,
    /// The avatar bucket; `None` when it is not configured.
    pub avatar_storage: Option<Arc<AvatarStorage>>,
    /// Mail tokens per user, bridge passwords already set, and Stalwart's limits.
    pub mail_cache: Arc<MailCache>,
}

impl AppState {
    pub fn new(config: Config, db: DatabaseConnection) -> Result<Self, reqwest::Error> {
        let http_no_redirect = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()?;
        let http = reqwest::Client::builder().build()?;
        Ok(Self {
            avatar_storage: config
                .avatar_bucket
                .as_ref()
                .and_then(|bucket| AvatarStorage::new(bucket, http.clone()))
                .map(Arc::new),
            safe_fetch: SafeFetch::new()?,
            origins: Arc::new(OriginPolicy::new(&config)),
            cookies: Arc::new(CookieSettings::new(&config)),
            stalwart_gate: Arc::new(StalwartGate::new(
                &config.stalwart_base_url,
                config.stalwart_gate_key.as_deref(),
            )),
            mailer: config.mailer.clone().map(Arc::new),
            mail_cache: Arc::default(),
            config: Arc::new(config),
            db,
            http,
            http_no_redirect,
        })
    }
}
