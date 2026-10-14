//! Trusted origins: `createRuntimeOriginPolicy` from `@workspace/runtime` plus the native deep links Better Auth trusts.

use crate::config::Config;

/// Calendar and Mail, production and development clients, trusted without extra configuration.
const DEFAULT_MOBILE_AUTH_CALLBACK_URLS: [&str; 5] = [
    "solace://api/auth",
    "solace-dev://api/auth",
    "solace-mail://api/auth",
    "solace-mail-dev://api/auth",
    "app.solace.onl://api/auth",
];
const LOCAL_DEVELOPMENT_ORIGINS: [&str; 2] = ["http://localhost", "https://localhost"];
const LOOPBACK_HOSTS: [&str; 3] = ["localhost", "127.0.0.1", "::1"];

#[derive(Debug, Clone)]
pub struct OriginPolicy {
    is_production: bool,
    trusted: Vec<String>,
    cors: Vec<String>,
    configured_hostnames: Vec<String>,
    mobile: Vec<String>,
}

impl OriginPolicy {
    pub fn new(config: &Config) -> Self {
        let mut configured = Vec::new();
        if !config.is_production {
            configured.extend(LOCAL_DEVELOPMENT_ORIGINS.map(str::to_owned));
        }
        configured.extend(config.trusted_origins.iter().cloned());
        let sources: Vec<&str> = [
            Some(config.backend_url.as_str()),
            Some(config.frontend_url.as_str()),
            config.app_url.as_deref(),
        ]
        .into_iter()
        .flatten()
        .chain(configured.iter().map(String::as_str))
        .collect();
        let trusted = unique(sources.iter().filter_map(|s| normalize_trusted_origin(s)));
        let cors = unique(trusted.iter().filter_map(|o| http_origin(o)));
        let configured_hostnames = unique(
            sources
                .iter()
                .copied()
                .chain(trusted.iter().map(String::as_str))
                .filter_map(hostname),
        );
        let mobile = unique(
            std::iter::once(config.mobile_auth_callback_url.as_str())
                .chain(DEFAULT_MOBILE_AUTH_CALLBACK_URLS)
                .flat_map(mobile_variants),
        );
        Self {
            is_production: config.is_production,
            trusted,
            cors,
            configured_hostnames,
            mobile,
        }
    }

    /// CORS and Better Auth's origin check; outside production any loopback, private or `.local` host of this server counts.
    pub fn is_allowed(&self, origin: &str, request_host: Option<&str>) -> bool {
        let Some(normalized) = normalize_trusted_origin(origin) else {
            return false;
        };
        if self.trusted.contains(&normalized) {
            return true;
        }
        let Some(origin) = http_origin(&normalized) else {
            return false;
        };
        if self.cors.contains(&origin) {
            return true;
        }
        if self.is_production {
            return false;
        }
        let Some(origin_host) = hostname(&origin) else {
            return false;
        };
        request_host
            .map(normalize_hostname)
            .into_iter()
            .chain(self.configured_hostnames.iter().cloned())
            .any(|candidate| {
                is_equivalent_host(&origin_host, &candidate)
                    && is_local_development_host(&candidate)
            })
    }

    /// `getAuthTrustedOrigins`: the static list, the request's origin when allowed, and the native deep links.
    pub fn auth_trusted(&self, origin: Option<&str>, request_host: Option<&str>) -> Vec<String> {
        let mut origins = self.trusted.clone();
        if let Some(origin) = origin.map(str::trim).filter(|o| !o.is_empty())
            && self.is_allowed(origin, request_host)
            && let Some(normalized) = normalize_trusted_origin(origin)
            && !origins.contains(&normalized)
        {
            origins.push(normalized);
        }
        for link in &self.mobile {
            if !origins.contains(link) {
                origins.push(link.clone());
            }
        }
        origins
    }
}

/// `solace-dev://api/auth` → itself, `solace-dev://`, `solace-dev://api` and `solace-dev://api/auth`.
fn mobile_variants(url: &str) -> Vec<String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    let mut variants = vec![trimmed.trim_end_matches('/').to_owned()];
    if let Ok(parsed) = url::Url::parse(trimmed) {
        let root = format!("{}://", parsed.scheme());
        variants.push(root);
        if let Some(host) = parsed.host_str().filter(|h| !h.is_empty()) {
            let mut current = format!("{}://{host}", parsed.scheme());
            variants.push(current.clone());
            for segment in parsed.path().split('/').filter(|s| !s.is_empty()) {
                current = format!("{current}/{segment}");
                variants.push(current.clone());
            }
        }
    }
    unique(variants)
}

fn unique(values: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for value in values {
        let value = value.trim().to_owned();
        if !value.is_empty() && !out.contains(&value) {
            out.push(value);
        }
    }
    out
}

fn normalize_trusted_origin(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    match url::Url::parse(trimmed) {
        Ok(url) if matches!(url.scheme(), "http" | "https") => {
            Some(url.origin().ascii_serialization())
        }
        _ => Some(trimmed.trim_end_matches('/').to_owned()),
    }
}

fn http_origin(value: &str) -> Option<String> {
    let url = url::Url::parse(value.trim()).ok()?;
    matches!(url.scheme(), "http" | "https").then(|| url.origin().ascii_serialization())
}

fn hostname(value: &str) -> Option<String> {
    let url = url::Url::parse(value.trim()).ok()?;
    url.host_str().map(normalize_hostname)
}

fn normalize_hostname(host: &str) -> String {
    host.trim()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .to_lowercase()
}

fn is_loopback(host: &str) -> bool {
    LOOPBACK_HOSTS.contains(&host)
}

fn is_private_ipv4(host: &str) -> bool {
    let Ok(address) = host.parse::<std::net::Ipv4Addr>() else {
        return false;
    };
    let [a, b, ..] = address.octets();
    a == 10 || a == 127 || (a == 192 && b == 168) || (a == 172 && (16..=31).contains(&b))
}

fn is_local_development_host(host: &str) -> bool {
    is_loopback(host) || is_private_ipv4(host) || host.ends_with(".local")
}

fn is_equivalent_host(left: &str, right: &str) -> bool {
    left == right || (is_loopback(left) && is_loopback(right))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn policy(production: bool, trusted: &[&str]) -> OriginPolicy {
        let mut config = crate::config::Config::from_lookup(|name| match name {
            "DATABASE_URL" => Some("postgres://localhost/solace_test".into()),
            "BETTER_AUTH_SECRET" => Some("s".repeat(32)),
            _ => None,
        })
        .unwrap();
        config.is_production = production;
        config.backend_url = "http://localhost:4001".into();
        config.frontend_url = "http://localhost:4000".into();
        config.trusted_origins = trusted.iter().map(|s| (*s).to_owned()).collect();
        OriginPolicy::new(&config)
    }

    #[test]
    fn blank_mobile_callbacks_add_no_trusted_origins() {
        assert!(mobile_variants("  ").is_empty());
        assert_eq!(
            mobile_variants("solace-dev://api/auth"),
            ["solace-dev://api/auth", "solace-dev://", "solace-dev://api"]
        );
    }

    #[test]
    fn localhost_and_loopback_hosts_are_trusted_only_outside_production() {
        let dev = policy(false, &[]);
        assert!(dev.is_allowed("http://localhost", None));
        assert!(dev.is_allowed("http://localhost:8081", Some("127.0.0.1")));
        assert!(dev.is_allowed("http://192.168.2.23:8081", Some("192.168.2.23")));
        assert!(!dev.is_allowed("https://evil.test", Some("localhost")));
        let production = policy(true, &["https://app.solace.onl"]);
        assert!(!production.is_allowed("http://localhost", None));
        assert!(production.is_allowed("https://app.solace.onl", None));
        let auth = production.auth_trusted(Some("http://localhost"), None);
        assert!(!auth.contains(&"http://localhost".to_owned()));
        assert!(
            auth.contains(&"solace://".to_owned())
                && auth.contains(&"solace://api/auth".to_owned())
        );
    }
}
