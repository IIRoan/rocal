//! `AppState`: the pool, HTTP clients, and everything derived from the config once at boot.

use std::sync::Arc;

use sea_orm::DatabaseConnection;

use crate::auth::cookies::CookieSettings;
use crate::config::Config;
use crate::http::origins::OriginPolicy;
use crate::integrations::stalwart::gate::StalwartGate;

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
}

impl AppState {
    pub fn new(config: Config, db: DatabaseConnection) -> Result<Self, reqwest::Error> {
        let http_no_redirect = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()?;
        Ok(Self {
            origins: Arc::new(OriginPolicy::new(&config)),
            cookies: Arc::new(CookieSettings::new(&config)),
            stalwart_gate: Arc::new(StalwartGate::new(
                &config.stalwart_base_url,
                config.stalwart_gate_key.as_deref(),
            )),
            config: Arc::new(config),
            db,
            http: reqwest::Client::builder().build()?,
            http_no_redirect,
        })
    }
}
