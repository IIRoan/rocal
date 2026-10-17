//! Settings from the process environment, over the shared dev `.env` files that local runs pick up.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use solace_server::integrations::stalwart::mailer::MailerConfig;

const DEFAULT_PORT: u16 = 4002;
const DEFAULT_STALWART_URL: &str = "https://mail.solace.onl";

pub struct Settings {
    values: HashMap<String, String>,
    /// The `.env` files merged in, for the startup log.
    pub loaded_files: Vec<PathBuf>,
}

impl Settings {
    /// The process environment, plus values the discovered `.env` files add without overriding it.
    pub fn load() -> Self {
        let mut values: HashMap<String, String> = HashMap::new();
        let mut loaded_files = Vec::new();
        let start = std::env::current_dir().unwrap_or_default();
        for file in discover_env_files(&start) {
            let Ok(entries) = dotenvy::from_path_iter(&file) else {
                continue;
            };
            // The backend's PORT is its own; the worker keeps its default.
            let skip_port = is_shared_backend_env(&file);
            for (key, value) in entries.flatten() {
                if !(skip_port && key == "PORT") {
                    values.entry(key).or_insert(value);
                }
            }
            loaded_files.push(file);
        }
        values.extend(std::env::vars().filter(|(_, value)| !value.is_empty()));
        Self {
            values,
            loaded_files,
        }
    }

    #[cfg(test)]
    pub fn from_pairs(pairs: &[(&str, &str)]) -> Self {
        Self {
            values: pairs
                .iter()
                .map(|(key, value)| ((*key).to_owned(), (*value).to_owned()))
                .collect(),
            loaded_files: Vec::new(),
        }
    }

    /// The trimmed value of `name`, if set and not blank.
    pub fn get(&self, name: &str) -> Option<String> {
        self.values
            .get(name)
            .map(|value| value.trim().to_owned())
            .filter(|value| !value.is_empty())
    }

    pub fn is_production(&self) -> bool {
        self.get("NODE_ENV").as_deref() == Some("production")
    }

    pub fn port(&self) -> u16 {
        self.get("PORT")
            .and_then(|port| port.parse().ok())
            .unwrap_or(DEFAULT_PORT)
    }

    /// `EMAIL_FROM` (or its older names) as a bare address; a "Name <address>" form keeps the address.
    pub fn sender_address(&self) -> Option<String> {
        let raw = self
            .get("EMAIL_FROM")
            .or_else(|| self.get("EMAIL_FROM_ADDRESS"))
            .or_else(|| self.get("FROM_EMAIL"))?;
        let address = match (raw.rfind('<'), raw.rfind('>')) {
            (Some(open), Some(close)) if open < close => raw[open + 1..close].trim().to_owned(),
            _ => raw,
        };
        address.contains('@').then_some(address)
    }

    /// The noreply mailer, or `None` while its credentials or sender are missing.
    pub fn mailer(&self) -> Option<MailerConfig> {
        let password = self
            .values
            .get("STALWART_JMAP_PASSWORD")
            .filter(|value| !value.is_empty())?;
        Some(MailerConfig {
            base_url: self
                .get("STALWART_JMAP_URL")
                .or_else(|| self.get("STALWART_BASE_URL"))
                .unwrap_or_else(|| DEFAULT_STALWART_URL.into()),
            username: self.get("STALWART_JMAP_USERNAME")?,
            password: password.clone(),
            from: self.sender_address()?,
            from_name: self
                .get("EMAIL_FROM_NAME")
                .unwrap_or_else(|| "Solace".into()),
        })
    }

    /// APNs key id, team id and PEM key, or the names of what is missing.
    pub fn apns(&self) -> Result<(String, String, String), Vec<&'static str>> {
        let key_file = self.get("APNS_AUTH_KEY_FILE");
        let pem = match self.get("APNS_AUTH_KEY") {
            Some(pem) => Some(pem),
            None => key_file
                .as_ref()
                .and_then(|path| std::fs::read_to_string(path).ok()),
        }
        .and_then(|raw| normalize_pem(&raw));
        let key_id = self.get("APNS_KEY_ID");
        let team_id = self.get("APNS_TEAM_ID");
        match (key_id, team_id, pem) {
            (Some(key_id), Some(team_id), Some(pem)) => Ok((key_id, team_id, pem)),
            (key_id, team_id, pem) => Err([
                key_id.is_none().then_some("APNS_KEY_ID"),
                team_id.is_none().then_some("APNS_TEAM_ID"),
                pem.is_none().then_some(if key_file.is_some() {
                    "APNS_AUTH_KEY_FILE"
                } else {
                    "APNS_AUTH_KEY"
                }),
            ]
            .into_iter()
            .flatten()
            .collect()),
        }
    }

    /// `path` on the web app (`FRONTEND_URL`, else `NEXT_PUBLIC_APP_URL`), with `query`.
    pub fn frontend_url(&self, path: &str, query: &[(&str, &str)]) -> String {
        let base = self
            .get("FRONTEND_URL")
            .or_else(|| self.get("NEXT_PUBLIC_APP_URL"))
            .unwrap_or_else(|| "http://localhost".into());
        let base = base.trim_end_matches('/');
        let Ok(mut url) = url::Url::parse(base) else {
            return format!("{base}{path}");
        };
        let joined = format!("{}{path}", url.path().trim_end_matches('/'));
        url.set_path(&joined);
        if !query.is_empty() {
            url.query_pairs_mut().extend_pairs(query);
        }
        url.to_string()
    }
}

/// An APNs `.p8` key as PEM; a bare base64 body gets its PKCS#8 armor.
fn normalize_pem(raw: &str) -> Option<String> {
    let raw = raw.trim();
    if raw.is_empty() {
        None
    } else if raw.contains("BEGIN") {
        Some(raw.to_owned())
    } else {
        Some(format!(
            "-----BEGIN PRIVATE KEY-----\n{raw}\n-----END PRIVATE KEY-----"
        ))
    }
}

fn is_shared_backend_env(path: &Path) -> bool {
    path.file_name().is_some_and(|name| name == ".env")
        && path
            .parent()
            .and_then(Path::file_name)
            .is_some_and(|name| name == "backend")
}

/// `.env` here and in each parent, plus a `backend/.env` or `retired/backend/.env` beside them.
fn discover_env_files(start: &Path) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = Vec::new();
    for dir in start.ancestors().take(8) {
        for candidate in [
            dir.join(".env"),
            dir.join("backend/.env"),
            dir.join("retired/backend/.env"),
        ] {
            if candidate.is_file() && !files.contains(&candidate) {
                files.push(candidate);
            }
        }
    }
    files
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn env_files_are_found_up_the_tree_local_first() {
        let root = std::env::temp_dir().join(format!("solace-notif-env-{}", rand::random::<u64>()));
        let worker = root.join("apps/notifications");
        let backend = root.join("retired/backend");
        std::fs::create_dir_all(&worker).unwrap();
        std::fs::create_dir_all(&backend).unwrap();
        std::fs::write(backend.join(".env"), "DATABASE_URL=backend\nPORT=4001\n").unwrap();
        assert_eq!(discover_env_files(&worker), vec![backend.join(".env")]);
        std::fs::write(worker.join(".env"), "DATABASE_URL=local\n").unwrap();
        assert_eq!(
            discover_env_files(&worker),
            vec![worker.join(".env"), backend.join(".env")]
        );
        assert!(is_shared_backend_env(&backend.join(".env")));
        assert!(!is_shared_backend_env(&worker.join(".env")));
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn sender_address_drops_the_display_name() {
        let settings = |value| Settings::from_pairs(&[("EMAIL_FROM", value)]);
        assert_eq!(
            settings("Solace <noreply@solace.onl>")
                .sender_address()
                .as_deref(),
            Some("noreply@solace.onl")
        );
        assert_eq!(
            settings(" noreply@solace.onl ").sender_address().as_deref(),
            Some("noreply@solace.onl")
        );
        assert_eq!(settings("not an address").sender_address(), None);
        assert_eq!(
            Settings::from_pairs(&[("FROM_EMAIL", "a@b.test")])
                .sender_address()
                .as_deref(),
            Some("a@b.test")
        );
    }

    #[test]
    fn the_mailer_needs_credentials_and_a_sender() {
        let full = [
            ("STALWART_JMAP_USERNAME", "noreply"),
            ("STALWART_JMAP_PASSWORD", "secret"),
            ("EMAIL_FROM", "noreply@solace.onl"),
        ];
        let mailer = Settings::from_pairs(&full).mailer().unwrap();
        assert_eq!(mailer.base_url, DEFAULT_STALWART_URL);
        assert_eq!(mailer.from_name, "Solace");
        for missing in 0..full.len() {
            let partial: Vec<_> = full
                .iter()
                .enumerate()
                .filter(|(index, _)| *index != missing)
                .map(|(_, pair)| *pair)
                .collect();
            assert!(Settings::from_pairs(&partial).mailer().is_none());
        }
    }

    #[test]
    fn apns_names_what_is_missing_and_armors_bare_keys() {
        assert_eq!(
            Settings::from_pairs(&[]).apns().unwrap_err(),
            vec!["APNS_KEY_ID", "APNS_TEAM_ID", "APNS_AUTH_KEY"]
        );
        let (_, _, pem) = Settings::from_pairs(&[
            ("APNS_KEY_ID", "K"),
            ("APNS_TEAM_ID", "T"),
            ("APNS_AUTH_KEY", "QUJD"),
        ])
        .apns()
        .unwrap();
        assert_eq!(
            pem,
            "-----BEGIN PRIVATE KEY-----\nQUJD\n-----END PRIVATE KEY-----"
        );
    }

    #[test]
    fn frontend_urls_join_paths_and_queries() {
        let settings = Settings::from_pairs(&[("FRONTEND_URL", "https://solace.onl/")]);
        assert_eq!(
            settings.frontend_url("/calendar", &[("eventId", "e 1")]),
            "https://solace.onl/calendar?eventId=e+1"
        );
        assert_eq!(
            settings.frontend_url("/settings", &[]),
            "https://solace.onl/settings"
        );
        assert_eq!(
            Settings::from_pairs(&[]).frontend_url("/privacy", &[]),
            "http://localhost/privacy"
        );
    }

    #[test]
    fn port_defaults_to_4002() {
        assert_eq!(Settings::from_pairs(&[]).port(), 4002);
        assert_eq!(Settings::from_pairs(&[("PORT", "8080")]).port(), 8080);
    }
}
