//! An HTTP user agent for one test user: its own cookie jar, origin and client IP.

use reqwest::header::{COOKIE, HeaderMap, HeaderName, HeaderValue, ORIGIN, SET_COOKIE};
use reqwest::{Method, StatusCode};
use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::{Error, Result};

/// Which client the agent behaves like: a browser sends `Origin`, the Expo apps send `expo-origin`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClientKind {
    Browser,
    Expo,
}

#[derive(Debug, Clone)]
pub struct Agent {
    http: reqwest::Client,
    base_url: String,
    origin: String,
    kind: ClientKind,
    /// Rate limits key on this; each agent gets its own documentation-range address.
    client_ip: String,
    cookies: Vec<StoredCookie>,
}

/// A browser keys cookies by name and domain; the Expo client's jar keys them by name only.
#[derive(Debug, Clone)]
struct StoredCookie {
    name: String,
    domain: Option<String>,
    value: String,
}

#[derive(Debug)]
pub struct ApiResponse {
    pub status: StatusCode,
    pub headers: HeaderMap,
    pub body: Vec<u8>,
}

impl Agent {
    pub fn new(base_url: &str, origin: &str, kind: ClientKind) -> Result<Self> {
        let http = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()?;
        Ok(Self {
            http,
            base_url: base_url.trim_end_matches('/').to_owned(),
            origin: origin.to_owned(),
            kind,
            client_ip: random_test_ip(),
            cookies: Vec::new(),
        })
    }

    pub fn client_ip(&self) -> &str {
        &self.client_ip
    }

    pub fn cookie(&self, name: &str) -> Option<&str> {
        self.cookies
            .iter()
            .find(|cookie| cookie.name == name)
            .map(|cookie| cookie.value.as_str())
    }

    /// Every stored cookie as (name, value), in the order they are sent.
    pub fn cookies(&self) -> Vec<(String, String)> {
        self.cookies
            .iter()
            .map(|cookie| (cookie.name.clone(), cookie.value.clone()))
            .collect()
    }

    /// Stores a host-only cookie, replacing any cookie of that name.
    pub fn set_cookie(&mut self, name: &str, value: &str) {
        self.cookies.retain(|cookie| cookie.name != name);
        self.cookies.push(StoredCookie {
            name: name.to_owned(),
            domain: None,
            value: value.to_owned(),
        });
    }

    /// Replaces the value of every stored cookie called `name`, keeping its domain; stores a host-only one if none exists.
    pub fn replace_cookie(&mut self, name: &str, value: &str) {
        let mut found = false;
        for cookie in self.cookies.iter_mut().filter(|cookie| cookie.name == name) {
            cookie.value = value.to_owned();
            found = true;
        }
        if !found {
            self.set_cookie(name, value);
        }
    }

    pub fn clear_cookies(&mut self) {
        self.cookies.clear();
    }

    pub async fn get(&mut self, path: &str) -> Result<ApiResponse> {
        self.send(Method::GET, path, None, &[]).await
    }

    pub async fn delete(&mut self, path: &str) -> Result<ApiResponse> {
        self.send(Method::DELETE, path, None, &[]).await
    }

    pub async fn post(&mut self, path: &str, body: Value) -> Result<ApiResponse> {
        self.send(Method::POST, path, Some(body), &[]).await
    }

    pub async fn put(&mut self, path: &str, body: Value) -> Result<ApiResponse> {
        self.send(Method::PUT, path, Some(body), &[]).await
    }

    pub async fn patch(&mut self, path: &str, body: Value) -> Result<ApiResponse> {
        self.send(Method::PATCH, path, Some(body), &[]).await
    }

    /// Sends one request with this agent's cookies and identity headers, then stores the returned cookies.
    pub async fn send(
        &mut self,
        method: Method,
        path: &str,
        body: Option<Value>,
        extra_headers: &[(&str, &str)],
    ) -> Result<ApiResponse> {
        let mut request = self
            .http
            .request(method, format!("{}{}", self.base_url, path))
            .header("x-forwarded-for", &self.client_ip);
        request = match self.kind {
            ClientKind::Browser => request.header(ORIGIN, &self.origin),
            ClientKind::Expo => request.header("expo-origin", &self.origin),
        };
        if !self.cookies.is_empty() {
            let cookie = self
                .cookies
                .iter()
                .map(|cookie| format!("{}={}", cookie.name, cookie.value))
                .collect::<Vec<_>>()
                .join("; ");
            request = request.header(COOKIE, cookie);
        }
        for (name, value) in extra_headers {
            request = request.header(
                HeaderName::try_from(*name).map_err(|e| Error::Unexpected(e.to_string()))?,
                HeaderValue::try_from(*value).map_err(|e| Error::Unexpected(e.to_string()))?,
            );
        }
        if let Some(body) = body {
            request = request.json(&body);
        }
        let response = request.send().await?;
        let status = response.status();
        let headers = response.headers().clone();
        let body = response.bytes().await?.to_vec();
        for set_cookie in headers.get_all(SET_COOKIE) {
            if let Ok(set_cookie) = set_cookie.to_str() {
                self.store_cookie(set_cookie);
            }
        }
        Ok(ApiResponse {
            status,
            headers,
            body,
        })
    }

    fn store_cookie(&mut self, set_cookie: &str) {
        let Ok(parsed) = cookie::Cookie::parse(set_cookie) else {
            return;
        };
        let expired = parsed.value().is_empty()
            || parsed
                .max_age()
                .is_some_and(|age| age <= cookie::time::Duration::ZERO);
        let name = parsed.name().to_owned();
        let domain = parsed
            .domain()
            .map(|domain| domain.trim_start_matches('.').to_ascii_lowercase());
        let same = |cookie: &StoredCookie| match self.kind {
            ClientKind::Browser => cookie.name == name && cookie.domain == domain,
            ClientKind::Expo => cookie.name == name,
        };
        if let Some(index) = self.cookies.iter().position(same) {
            if expired {
                self.cookies.remove(index);
            } else if let Some(cookie) = self.cookies.get_mut(index) {
                cookie.value = parsed.value().to_owned();
            }
        } else if !expired {
            self.cookies.push(StoredCookie {
                name,
                domain,
                value: parsed.value().to_owned(),
            });
        }
    }
}

impl ApiResponse {
    pub fn json<T: DeserializeOwned>(&self) -> Result<T> {
        serde_json::from_slice(&self.body).map_err(|source| Error::Body {
            status: self.status.as_u16(),
            source,
            body: self.text(),
        })
    }

    pub fn value(&self) -> Result<Value> {
        self.json()
    }

    /// Decodes into the shared DTO and fails unless re-encoding it gives back the exact JSON, so DTOs can't drop or reshape fields.
    pub fn dto<T: DeserializeOwned + serde::Serialize>(&self) -> Result<T> {
        let raw: Value = self.json()?;
        let decoded: T = serde_json::from_value(raw.clone()).map_err(|source| Error::Body {
            status: self.status.as_u16(),
            source,
            body: self.text(),
        })?;
        let encoded = serde_json::to_value(&decoded)?;
        if encoded != raw {
            return Err(Error::Unexpected(format!(
                "DTO {} does not round-trip.\n  wire: {raw}\n   dto: {encoded}",
                std::any::type_name::<T>()
            )));
        }
        Ok(decoded)
    }

    /// Fails unless this is the error envelope with this status, error label and message.
    pub fn expect_error(&self, status: u16, error: &str, message: &str) -> Result<Value> {
        let body = self.value()?;
        let matches = self.status.as_u16() == status
            && body["statusCode"] == serde_json::json!(status)
            && body["error"] == serde_json::json!(error)
            && body["message"] == serde_json::json!(message)
            && body["timestamp"].is_string();
        if matches {
            Ok(body)
        } else {
            Err(Error::Unexpected(format!(
                "expected {status} {error:?} {message:?}, got {}: {body}",
                self.status.as_u16()
            )))
        }
    }

    pub fn text(&self) -> String {
        String::from_utf8_lossy(&self.body).into_owned()
    }

    /// Every `Set-Cookie` header, in order.
    pub fn set_cookies(&self) -> Vec<String> {
        self.headers
            .get_all(SET_COOKIE)
            .iter()
            .filter_map(|value| value.to_str().ok().map(str::to_owned))
            .collect()
    }

    /// Fails with the body when the status is not the expected one.
    pub fn expect_status(self, expected: u16) -> Result<Self> {
        if self.status.as_u16() == expected {
            Ok(self)
        } else {
            Err(Error::Status {
                expected,
                actual: self.status.as_u16(),
                body: self.text(),
            })
        }
    }
}

/// Lets a request's `Result` be checked and decoded without unwrapping it first.
pub trait ResponseResult {
    fn expect_status(self, expected: u16) -> Result<ApiResponse>;
    fn dto<T: DeserializeOwned + serde::Serialize>(self) -> Result<T>;
    fn value(self) -> Result<Value>;
}

impl ResponseResult for Result<ApiResponse> {
    fn expect_status(self, expected: u16) -> Result<ApiResponse> {
        self.and_then(|response| response.expect_status(expected))
    }

    fn dto<T: DeserializeOwned + serde::Serialize>(self) -> Result<T> {
        self.and_then(|response| response.dto())
    }

    fn value(self) -> Result<Value> {
        self.and_then(|response| response.value())
    }
}

/// A random IPv6 address in the documentation range (RFC 3849), so no two agents share a rate limit.
fn random_test_ip() -> String {
    let bytes: [u16; 4] = rand::random();
    format!(
        "2001:db8:{:x}:{:x}:{:x}:{:x}::1",
        bytes[0], bytes[1], bytes[2], bytes[3]
    )
}
