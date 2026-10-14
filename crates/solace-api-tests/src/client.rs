//! An HTTP user agent for one test user: its own cookie jar, origin and client IP.

use std::collections::BTreeMap;

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
    /// Rate limits key on this; each agent gets its own TEST-NET-3 / documentation-range address.
    client_ip: String,
    cookies: BTreeMap<String, String>,
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
            cookies: BTreeMap::new(),
        })
    }

    pub fn client_ip(&self) -> &str {
        &self.client_ip
    }

    pub fn cookie(&self, name: &str) -> Option<&str> {
        self.cookies.get(name).map(String::as_str)
    }

    pub fn cookies(&self) -> &BTreeMap<String, String> {
        &self.cookies
    }

    pub fn set_cookie(&mut self, name: &str, value: &str) {
        self.cookies.insert(name.to_owned(), value.to_owned());
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
                .map(|(name, value)| format!("{name}={value}"))
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
        let mut parts = set_cookie.split(';');
        let Some((name, value)) = parts.next().and_then(|pair| pair.split_once('=')) else {
            return;
        };
        let expired = parts.any(|attribute| {
            let attribute = attribute.trim().to_ascii_lowercase();
            attribute == "max-age=0" || attribute.starts_with("max-age=-")
        });
        let name = name.trim().to_owned();
        if expired || value.is_empty() {
            self.cookies.remove(&name);
        } else {
            self.cookies.insert(name, value.trim().to_owned());
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

/// A random IPv6 address in the documentation range (RFC 3849), so no two agents share a rate limit.
fn random_test_ip() -> String {
    let bytes: [u16; 4] = rand::random();
    format!(
        "2001:db8:{:x}:{:x}:{:x}:{:x}::1",
        bytes[0], bytes[1], bytes[2], bytes[3]
    )
}
