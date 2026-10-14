//! Better Auth's cookies byte for byte: names, `token.HMAC` signing, attributes, and the step-up cookie from `passkey-step-up.ts`.

use axum::http::{HeaderMap, header};
use base64::Engine;
use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use hmac::{KeyInit, Mac};
use serde::{Deserialize, Serialize};

use crate::config::{Config, SameSite};

type HmacSha256 = hmac::Hmac<sha2::Sha256>;

pub const SESSION_LIFETIME_SECONDS: i64 = 14 * 24 * 60 * 60;
pub const SESSION_UPDATE_AGE_SECONDS: i64 = 24 * 60 * 60;
pub const STEP_UP_COOKIE: &str = "solace-passkey-step-up";

/// The cookie settings `lib/auth.ts` gives Better Auth and `passkey-step-up.ts` uses.
#[derive(Debug, Clone)]
pub struct CookieSettings {
    secret: String,
    prefix: &'static str,
    secure: bool,
    same_site: SameSite,
    /// `crossSubDomainCookies`: the RP ID domain in production, the backend host otherwise.
    domain: String,
    /// The step-up cookie's domain: only in production, and never for `localhost`.
    step_up_domain: Option<String>,
    is_production: bool,
}

impl CookieSettings {
    pub fn new(config: &Config) -> Self {
        let backend_host = url::Url::parse(&config.backend_url)
            .ok()
            .and_then(|url| url.host_str().map(str::to_owned))
            .unwrap_or_else(|| "localhost".into());
        let root = registrable_domain(&backend_host);
        Self {
            secret: config.auth_secret.clone(),
            prefix: if config.is_production {
                "__Secure-better-auth"
            } else {
                "better-auth"
            },
            secure: config.is_production || config.cookie_same_site == SameSite::None,
            same_site: config.cookie_same_site,
            domain: if config.is_production {
                root.clone().unwrap_or(backend_host)
            } else {
                backend_host
            },
            step_up_domain: config.is_production.then_some(root).flatten(),
            is_production: config.is_production,
        }
    }

    pub fn name(&self, suffix: &str) -> String {
        format!("{}.{suffix}", self.prefix)
    }

    pub fn session_token(&self) -> String {
        self.name("session_token")
    }

    pub fn secret(&self) -> &str {
        &self.secret
    }

    /// A signed Better Auth cookie: `name=encodeURIComponent(value.signature)` and the shared attributes.
    pub fn signed(&self, name: &str, value: &str, max_age: Option<i64>) -> String {
        let signed = format!("{value}.{}", self.signature(value));
        self.better_auth_cookie(name, &encode_uri_component(&signed), max_age)
    }

    /// Better Auth's deletion: the same attributes with an empty value and `Max-Age=0`.
    pub fn expired(&self, name: &str) -> String {
        self.better_auth_cookie(name, "", Some(0))
    }

    fn better_auth_cookie(&self, name: &str, value: &str, max_age: Option<i64>) -> String {
        let mut cookie = format!("{name}={value}");
        if let Some(max_age) = max_age {
            cookie.push_str(&format!("; Max-Age={max_age}"));
        }
        cookie.push_str(&format!("; Domain={}; Path=/; HttpOnly", self.domain));
        if self.secure {
            cookie.push_str("; Secure");
        }
        cookie.push_str(&format!("; SameSite={}", self.same_site.better_auth()));
        cookie
    }

    fn signature(&self, value: &str) -> String {
        STANDARD.encode(self.hmac(value.as_bytes()))
    }

    fn hmac(&self, data: &[u8]) -> Vec<u8> {
        let mut mac = <HmacSha256 as KeyInit>::new_from_slice(self.secret.as_bytes())
            .unwrap_or_else(|_| unreachable!("HMAC accepts keys of any length"));
        mac.update(data);
        mac.finalize().into_bytes().to_vec()
    }

    /// `getSignedCookie`: `value.signature` with a 44-character standard base64 signature.
    pub fn verify_signed(&self, signed: &str) -> Option<String> {
        let dot = signed.rfind('.')?;
        let (value, signature) = (&signed[..dot], &signed[dot + 1..]);
        if value.is_empty() || signature.len() != 44 || !signature.ends_with('=') {
            return None;
        }
        let signature = STANDARD.decode(signature).ok()?;
        let mut mac = <HmacSha256 as KeyInit>::new_from_slice(self.secret.as_bytes()).ok()?;
        mac.update(value.as_bytes());
        mac.verify_slice(&signature).ok()?;
        Some(value.to_owned())
    }

    /// The step-up cookie binding a passkey verification to one user and session for two weeks.
    pub fn step_up(&self, user_id: &str, session_id: &str, now_seconds: i64) -> String {
        let payload = StepUpPayload {
            u: user_id.to_owned(),
            s: session_id.to_owned(),
            e: now_seconds + SESSION_LIFETIME_SECONDS,
        };
        let encoded = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&payload).unwrap_or_default());
        let value = format!(
            "{encoded}.{}",
            URL_SAFE_NO_PAD.encode(self.hmac(encoded.as_bytes()))
        );
        self.step_up_cookie(&encode_uri_component(&value), SESSION_LIFETIME_SECONDS)
    }

    pub fn step_up_cleared(&self) -> String {
        self.step_up_cookie("", 0)
    }

    fn step_up_cookie(&self, value: &str, max_age: i64) -> String {
        let mut cookie = format!(
            "{STEP_UP_COOKIE}={value}; Path=/; Max-Age={max_age}; SameSite={}; HttpOnly",
            self.same_site.lowercase()
        );
        if self.is_production {
            cookie.push_str("; Secure");
        }
        if let Some(domain) = &self.step_up_domain {
            cookie.push_str(&format!("; Domain={domain}"));
        }
        cookie
    }

    /// The step-up payload when the cookie is genuine, unexpired, and bound to this user and session.
    pub fn verified_step_up(
        &self,
        raw: &str,
        user_id: &str,
        session_id: &str,
        now_seconds: i64,
    ) -> Option<StepUpPayload> {
        let separator = raw.rfind('.').filter(|i| *i > 0)?;
        let (encoded, signature) = (&raw[..separator], &raw[separator + 1..]);
        let expected = URL_SAFE_NO_PAD.encode(self.hmac(encoded.as_bytes()));
        if !bool::from(subtle::ConstantTimeEq::ct_eq(
            signature.as_bytes(),
            expected.as_bytes(),
        )) {
            return None;
        }
        let payload: StepUpPayload =
            serde_json::from_slice(&URL_SAFE_NO_PAD.decode(encoded).ok()?).ok()?;
        (payload.e > now_seconds && payload.u == user_id && payload.s == session_id)
            .then_some(payload)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StepUpPayload {
    pub u: String,
    pub s: String,
    pub e: i64,
}

/// The last two labels (`api.solace.onl` → `solace.onl`), or none for `localhost` and bare hosts.
fn registrable_domain(host: &str) -> Option<String> {
    if host == "localhost" {
        return None;
    }
    let labels: Vec<&str> = host.split('.').collect();
    (labels.len() >= 2).then(|| labels[labels.len() - 2..].join("."))
}

/// better-call's `parseCookies`: the first occurrence wins, quotes are stripped, values percent-decoded when valid.
pub fn parse_cookies(headers: &HeaderMap) -> Vec<(String, String)> {
    let mut cookies: Vec<(String, String)> = Vec::new();
    for raw in headers.get_all(header::COOKIE) {
        let Ok(raw) = raw.to_str() else { continue };
        for part in raw.split(';') {
            let Some((name, value)) = part.split_once('=') else {
                continue;
            };
            let name = name.trim();
            if name.is_empty() || cookies.iter().any(|(existing, _)| existing == name) {
                continue;
            }
            let mut value = value.trim();
            if value.len() >= 2 && value.starts_with('"') && value.ends_with('"') {
                value = &value[1..value.len() - 1];
            }
            let decoded = percent_encoding::percent_decode_str(value)
                .decode_utf8()
                .map_or_else(|_| value.to_owned(), |v| v.into_owned());
            cookies.push((name.to_owned(), decoded));
        }
    }
    cookies
}

pub fn cookie<'a>(cookies: &'a [(String, String)], name: &str) -> Option<&'a str> {
    cookies
        .iter()
        .find(|(n, _)| n == name)
        .map(|(_, v)| v.as_str())
}

/// JavaScript's `encodeURIComponent`.
pub fn encode_uri_component(value: &str) -> String {
    const SET: &percent_encoding::AsciiSet = &percent_encoding::NON_ALPHANUMERIC
        .remove(b'-')
        .remove(b'_')
        .remove(b'.')
        .remove(b'!')
        .remove(b'~')
        .remove(b'*')
        .remove(b'\'')
        .remove(b'(')
        .remove(b')');
    percent_encoding::utf8_percent_encode(value, SET).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings(production: bool) -> CookieSettings {
        let mut config = Config::from_lookup(|name| match name {
            "DATABASE_URL" => Some("postgres://localhost/solace_test".into()),
            "BETTER_AUTH_SECRET" => Some("solace-test-auth-secret-0123456789abcdef".into()),
            _ => None,
        })
        .unwrap();
        config.is_production = production;
        config.backend_url = if production {
            "https://api.solace.test".into()
        } else {
            "http://localhost:4101".into()
        };
        CookieSettings::new(&config)
    }

    #[test]
    fn session_cookies_carry_better_auths_attributes() {
        let dev = settings(false);
        let cookie = dev.signed(
            "better-auth.session_token",
            "abc",
            Some(SESSION_LIFETIME_SECONDS),
        );
        assert!(cookie.starts_with("better-auth.session_token=abc."));
        assert!(
            cookie.ends_with("; Max-Age=1209600; Domain=localhost; Path=/; HttpOnly; SameSite=Lax"),
            "{cookie}"
        );
        let production = settings(true);
        assert_eq!(
            production.expired(&production.name("session_data")),
            "__Secure-better-auth.session_data=; Max-Age=0; Domain=solace.test; Path=/; HttpOnly; Secure; SameSite=Lax"
        );
        assert_eq!(
            production.step_up_cleared(),
            "solace-passkey-step-up=; Path=/; Max-Age=0; SameSite=lax; HttpOnly; Secure; Domain=solace.test"
        );
        assert_eq!(
            dev.step_up_cleared(),
            "solace-passkey-step-up=; Path=/; Max-Age=0; SameSite=lax; HttpOnly"
        );
    }

    #[test]
    fn signed_values_round_trip_and_reject_tampering() {
        let settings = settings(false);
        let cookie = settings.signed("better-auth.session_token", "token123", None);
        let encoded = cookie
            .split(';')
            .next()
            .and_then(|c| c.split_once('='))
            .map(|(_, v)| v)
            .unwrap();
        let decoded = percent_encoding::percent_decode_str(encoded)
            .decode_utf8()
            .unwrap();
        assert_eq!(
            settings.verify_signed(&decoded).as_deref(),
            Some("token123")
        );
        assert_eq!(
            settings.verify_signed(&decoded.replace("token123", "token124")),
            None
        );
        assert_eq!(settings.verify_signed("garbage"), None);
    }

    #[test]
    fn step_up_cookies_bind_user_session_and_expiry() {
        let settings = settings(false);
        let cookie = settings.step_up("u1", "s1", 1_000);
        let value = cookie
            .split(';')
            .next()
            .and_then(|c| c.split_once('='))
            .map(|(_, v)| v)
            .unwrap();
        let raw = percent_encoding::percent_decode_str(value)
            .decode_utf8()
            .unwrap();
        assert!(settings.verified_step_up(&raw, "u1", "s1", 1_000).is_some());
        assert!(settings.verified_step_up(&raw, "u2", "s1", 1_000).is_none());
        assert!(settings.verified_step_up(&raw, "u1", "s2", 1_000).is_none());
        assert!(
            settings
                .verified_step_up(&raw, "u1", "s1", 1_000 + SESSION_LIFETIME_SECONDS)
                .is_none()
        );
        assert!(
            settings
                .verified_step_up(&format!("{raw}x"), "u1", "s1", 1_000)
                .is_none()
        );
    }

    #[test]
    fn cookie_headers_parse_like_better_call() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::COOKIE,
            "a=1; b=\"two\"; a=3; c=x%2By; d=%ZZ".parse().unwrap(),
        );
        let cookies = parse_cookies(&headers);
        assert_eq!(cookie(&cookies, "a"), Some("1"));
        assert_eq!(cookie(&cookies, "b"), Some("two"));
        assert_eq!(cookie(&cookies, "c"), Some("x+y"));
        assert_eq!(cookie(&cookies, "d"), Some("%ZZ"));
    }
}
