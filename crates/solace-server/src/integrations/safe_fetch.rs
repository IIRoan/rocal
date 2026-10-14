//! `lib/safe-fetch.ts`: requests to user-supplied URLs, with the address checked inside the connect-time DNS lookup (no rebinding), every redirect re-validated, and time and size caps.

pub mod host_policy;

use std::future::Future;
use std::net::{IpAddr, SocketAddr};
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;

use reqwest::dns::{Addrs, Name, Resolve, Resolving};
use reqwest::header::{CONTENT_ENCODING, CONTENT_LENGTH, HeaderMap, LOCATION};
use reqwest::{Method, StatusCode};
use thiserror::Error;
use url::Url;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Error)]
pub enum SafeFetchError {
    #[error("invalid-url")]
    InvalidUrl,
    #[error("unsupported-scheme")]
    UnsupportedScheme,
    #[error("private-network-host")]
    PrivateNetworkHost,
    #[error("too-many-redirects")]
    TooManyRedirects,
    #[error("redirect-without-location")]
    RedirectWithoutLocation,
    #[error("timeout")]
    Timeout,
    #[error("response-too-large")]
    ResponseTooLarge,
    #[error("request-failed")]
    RequestFailed,
}

/// One request; `timeout` covers every hop, `max_bytes` the decoded body.
#[derive(Debug, Clone)]
pub struct SafeRequest {
    pub method: Method,
    pub headers: HeaderMap,
    pub timeout: Duration,
    pub max_bytes: usize,
    pub max_redirects: usize,
}

#[derive(Debug)]
pub struct SafeResponse {
    pub status: StatusCode,
    /// Without `content-encoding` and `content-length`, which described the encoded body.
    pub headers: HeaderMap,
    pub body: Vec<u8>,
}

pub(crate) type Lookup = Arc<
    dyn Fn(String) -> Pin<Box<dyn Future<Output = std::io::Result<Vec<IpAddr>>> + Send>>
        + Send
        + Sync,
>;

/// `createValidatingLookup`: hands the connector only addresses that passed the policy, so the checked IP is the connected IP.
struct ValidatingResolver {
    lookup: Lookup,
    blocked: fn(&str) -> bool,
}

impl Resolve for ValidatingResolver {
    fn resolve(&self, name: Name) -> Resolving {
        let lookup = (self.lookup)(name.as_str().to_owned());
        let blocked = self.blocked;
        Box::pin(async move {
            let addresses = lookup.await?;
            if addresses.is_empty() || addresses.iter().any(|ip| blocked(&ip.to_string())) {
                return Err(SafeFetchError::PrivateNetworkHost.into());
            }
            let addrs: Addrs = Box::new(addresses.into_iter().map(|ip| SocketAddr::new(ip, 0)));
            Ok(addrs)
        })
    }
}

fn system_lookup() -> Lookup {
    Arc::new(|host| {
        Box::pin(async move {
            Ok(tokio::net::lookup_host((host.as_str(), 0))
                .await?
                .map(|address| address.ip())
                .collect())
        })
    })
}

/// The client for user URLs; clones share one connection-less client.
#[derive(Clone)]
pub struct SafeFetch {
    client: reqwest::Client,
    blocked: fn(&str) -> bool,
}

impl SafeFetch {
    pub fn new() -> Result<Self, reqwest::Error> {
        Self::with_lookup(system_lookup(), host_policy::is_private_network_host)
    }

    fn with_lookup(lookup: Lookup, blocked: fn(&str) -> bool) -> Result<Self, reqwest::Error> {
        let client = reqwest::Client::builder()
            .dns_resolver(ValidatingResolver { lookup, blocked })
            .redirect(reqwest::redirect::Policy::none())
            .no_proxy()
            // Every hop connects afresh, so every hop is resolved and checked again.
            .pool_max_idle_per_host(0)
            .build()?;
        Ok(Self { client, blocked })
    }

    /// `safeFetch`: follows redirects by hand, re-validating each target before connecting.
    pub async fn fetch(
        &self,
        raw_url: &str,
        request: &SafeRequest,
    ) -> Result<SafeResponse, SafeFetchError> {
        tokio::time::timeout(request.timeout, self.follow(raw_url, request))
            .await
            .map_err(|_| SafeFetchError::Timeout)?
    }

    async fn follow(
        &self,
        raw_url: &str,
        request: &SafeRequest,
    ) -> Result<SafeResponse, SafeFetchError> {
        let mut url = parse_url(raw_url, self.blocked)?;
        for _ in 0..=request.max_redirects {
            let response = self
                .client
                .request(request.method.clone(), url.clone())
                .headers(request.headers.clone())
                .send()
                .await
                .map_err(|error| classify(&error))?;
            if !is_redirect(response.status()) {
                return read(response, request.max_bytes).await;
            }
            let location = response
                .headers()
                .get(LOCATION)
                .ok_or(SafeFetchError::RedirectWithoutLocation)?
                .to_str()
                .map_err(|_| SafeFetchError::InvalidUrl)?;
            let next = url.join(location).map_err(|_| SafeFetchError::InvalidUrl)?;
            url = parse_url(next.as_str(), self.blocked)?;
        }
        Err(SafeFetchError::TooManyRedirects)
    }
}

fn is_redirect(status: StatusCode) -> bool {
    matches!(status.as_u16(), 301 | 302 | 303 | 307 | 308)
}

/// The resolver's refusal surfaces inside reqwest's connect error.
fn classify(error: &reqwest::Error) -> SafeFetchError {
    let mut source: Option<&(dyn std::error::Error + 'static)> = Some(error);
    while let Some(current) = source {
        if let Some(refused) = current.downcast_ref::<SafeFetchError>() {
            return *refused;
        }
        source = current.source();
    }
    if error.is_timeout() {
        SafeFetchError::Timeout
    } else {
        SafeFetchError::RequestFailed
    }
}

async fn read(
    mut response: reqwest::Response,
    max_bytes: usize,
) -> Result<SafeResponse, SafeFetchError> {
    let status = response.status();
    let mut headers = response.headers().clone();
    headers.remove(CONTENT_ENCODING);
    headers.remove(CONTENT_LENGTH);
    let mut body = Vec::new();
    if matches!(status.as_u16(), 101 | 103 | 204 | 205 | 304) {
        return Ok(SafeResponse {
            status,
            headers,
            body,
        });
    }
    // Decoded bodies have no declared length here, so only plain ones are refused up front.
    if response
        .content_length()
        .is_some_and(|length| length > max_bytes as u64)
    {
        return Err(SafeFetchError::ResponseTooLarge);
    }
    while let Some(chunk) = response.chunk().await.map_err(|error| classify(&error))? {
        if body.len() + chunk.len() > max_bytes {
            return Err(SafeFetchError::ResponseTooLarge);
        }
        body.extend_from_slice(&chunk);
    }
    Ok(SafeResponse {
        status,
        headers,
        body,
    })
}

/// `parseSafeFetchUrl`: http(s) only (`webcal:` as `https:`), no credentials, and no private literal host.
pub fn parse_url(raw_url: &str, blocked: fn(&str) -> bool) -> Result<Url, SafeFetchError> {
    let mut url = Url::parse(raw_url.trim()).map_err(|_| SafeFetchError::InvalidUrl)?;
    if url.scheme() == "webcal" {
        let rest = &url.as_str()["webcal:".len()..];
        url = Url::parse(&format!("https:{rest}")).map_err(|_| SafeFetchError::InvalidUrl)?;
    }
    if !matches!(url.scheme(), "http" | "https") {
        return Err(SafeFetchError::UnsupportedScheme);
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(SafeFetchError::InvalidUrl);
    }
    let host = url.host_str().unwrap_or_default();
    let host = host.strip_prefix('[').unwrap_or(host);
    let host = host.strip_suffix(']').unwrap_or(host);
    if host.is_empty() {
        return Err(SafeFetchError::InvalidUrl);
    }
    let canonical = host_policy::canonicalize_host(host);
    let refused = if host_policy::is_ip(&canonical) {
        blocked(&canonical)
    } else {
        host_policy::is_private_network_host(host)
    };
    if refused {
        return Err(SafeFetchError::PrivateNetworkHost);
    }
    Ok(url)
}

#[cfg(test)]
pub(crate) mod tests {
    use std::io::Write;
    use std::str::FromStr;
    use std::sync::Mutex;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use axum::Router;
    use axum::extract::{Query, State};
    use axum::http::{HeaderMap as AxumHeaders, Uri, header};
    use axum::response::{IntoResponse, Response};
    use axum::routing::get;

    use super::*;

    /// Only the test server's address counts as public, so the real private-address paths stay exercised.
    pub(crate) const TEST_PUBLIC_ADDRESS: &str = "127.0.0.1";

    pub(crate) fn test_policy(address: &str) -> bool {
        address != TEST_PUBLIC_ADDRESS && host_policy::is_private_network_host(address)
    }

    pub(crate) fn public_lookup() -> Lookup {
        Arc::new(|_| Box::pin(async { Ok(vec![IpAddr::from([127, 0, 0, 1])]) }))
    }

    /// Answers each lookup with the next address in `answers`.
    fn scripted_lookup(answers: &[&str], calls: Arc<AtomicUsize>) -> Lookup {
        let answers: Vec<IpAddr> = answers.iter().map(|a| a.parse().unwrap()).collect();
        Arc::new(move |_| {
            let index = calls.fetch_add(1, Ordering::SeqCst);
            let answer = answers[index.min(answers.len() - 1)];
            Box::pin(async move { Ok(vec![answer]) })
        })
    }

    pub(crate) fn safe_fetch(lookup: Lookup) -> SafeFetch {
        SafeFetch::with_lookup(lookup, test_policy).unwrap()
    }

    fn request() -> SafeRequest {
        SafeRequest {
            method: Method::GET,
            headers: HeaderMap::new(),
            timeout: Duration::from_secs(2),
            max_bytes: 1024,
            max_redirects: 3,
        }
    }

    #[derive(Clone, Default)]
    struct Seen(Arc<Mutex<Vec<String>>>);

    async fn record(State(seen): State<Seen>, headers: AxumHeaders, uri: Uri) -> Response {
        let host = headers
            .get(header::HOST)
            .and_then(|h| h.to_str().ok())
            .unwrap_or_default();
        seen.0.lock().unwrap().push(format!("{host}{uri}"));
        match uri.path() {
            "/ok" => ([(header::CONTENT_TYPE, "text/calendar")], "BEGIN:VCALENDAR").into_response(),
            "/gzip" => {
                let mut encoder =
                    flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
                encoder.write_all("x".repeat(4096).as_bytes()).unwrap();
                (
                    [(header::CONTENT_ENCODING, "gzip")],
                    encoder.finish().unwrap(),
                )
                    .into_response()
            }
            "/big" => "x".repeat(4096).into_response(),
            "/slow" => {
                tokio::time::sleep(Duration::from_millis(500)).await;
                "late".into_response()
            }
            "/loop" => (StatusCode::FOUND, [(header::LOCATION, "/loop")]).into_response(),
            _ => StatusCode::NOT_FOUND.into_response(),
        }
    }

    async fn redirect(
        State(seen): State<Seen>,
        headers: AxumHeaders,
        uri: Uri,
        Query(query): Query<Vec<(String, String)>>,
    ) -> Response {
        let host = headers
            .get(header::HOST)
            .and_then(|h| h.to_str().ok())
            .unwrap_or_default();
        seen.0.lock().unwrap().push(format!("{host}{uri}"));
        let to = query
            .into_iter()
            .find(|(key, _)| key == "to")
            .map(|(_, to)| to)
            .unwrap_or_default();
        (StatusCode::FOUND, [(header::LOCATION, to)]).into_response()
    }

    /// The test origin on 127.0.0.1 and the `host:port/path` of every request it saw.
    async fn server() -> (u16, Seen) {
        let seen = Seen::default();
        let app = Router::new()
            .route("/redirect", get(redirect))
            .fallback(record)
            .with_state(seen.clone());
        let listener = tokio::net::TcpListener::bind((TEST_PUBLIC_ADDRESS, 0))
            .await
            .unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move { axum::serve(listener, app).await });
        (port, seen)
    }

    fn encode(value: &str) -> String {
        crate::auth::cookies::encode_uri_component(value)
    }

    #[test]
    fn webcal_maps_to_https() {
        let url = parse_url("webcal://example.com/cal.ics", test_policy).unwrap();
        assert_eq!(url.as_str(), "https://example.com/cal.ics");
        for (raw, refused) in [
            ("file:///etc/passwd", SafeFetchError::UnsupportedScheme),
            ("gopher://example.com/", SafeFetchError::UnsupportedScheme),
            ("https://user:pw@example.com/", SafeFetchError::InvalidUrl),
            ("http://2130706433/", SafeFetchError::PrivateNetworkHost),
            (
                "http://[::ffff:169.254.169.254]/",
                SafeFetchError::PrivateNetworkHost,
            ),
            (
                "http://metadata.google.internal/",
                SafeFetchError::PrivateNetworkHost,
            ),
        ] {
            assert_eq!(
                parse_url(raw, host_policy::is_private_network_host).err(),
                Some(refused),
                "{raw}"
            );
        }
    }

    #[tokio::test]
    async fn lookup_validates_every_resolution() {
        let calls = Arc::new(AtomicUsize::new(0));
        let resolver = ValidatingResolver {
            lookup: scripted_lookup(&["93.184.216.34", "10.0.0.5"], calls),
            blocked: host_policy::is_private_network_host,
        };
        let first: Vec<SocketAddr> = resolver
            .resolve(Name::from_str("rebind.test").unwrap())
            .await
            .unwrap()
            .collect();
        assert_eq!(first, [SocketAddr::from(([93, 184, 216, 34], 0))]);
        let second = resolver
            .resolve(Name::from_str("rebind.test").unwrap())
            .await;
        let error = second.err().unwrap();
        assert_eq!(
            error.downcast_ref::<SafeFetchError>(),
            Some(&SafeFetchError::PrivateNetworkHost)
        );
    }

    #[tokio::test]
    async fn lookup_rejects_when_any_address_is_private() {
        let resolver = ValidatingResolver {
            lookup: Arc::new(|_| {
                Box::pin(async {
                    Ok(vec![
                        "93.184.216.34".parse().unwrap(),
                        "fe80::1".parse().unwrap(),
                    ])
                })
            }),
            blocked: host_policy::is_private_network_host,
        };
        let refused = resolver
            .resolve(Name::from_str("mixed.test").unwrap())
            .await;
        assert!(refused.is_err());
    }

    #[tokio::test]
    async fn connects_to_the_validated_address_with_the_original_host() {
        let (port, seen) = server().await;
        let response = safe_fetch(public_lookup())
            .fetch(&format!("http://calendar.test:{port}/ok"), &request())
            .await
            .unwrap();
        assert_eq!(response.status, StatusCode::OK);
        assert_eq!(response.body, b"BEGIN:VCALENDAR");
        assert!(
            seen.0
                .lock()
                .unwrap()
                .contains(&format!("calendar.test:{port}/ok"))
        );
    }

    #[tokio::test]
    async fn rebinding_on_a_redirect_hop_is_refused() {
        let (port, seen) = server().await;
        let calls = Arc::new(AtomicUsize::new(0));
        let lookup = scripted_lookup(&[TEST_PUBLIC_ADDRESS, "127.0.0.2"], calls.clone());
        let target = encode(&format!("http://rebind.test:{port}/ok"));
        let first = format!("rebind.test:{port}/redirect?to={target}");
        let refused = safe_fetch(lookup)
            .fetch(&format!("http://{first}"), &request())
            .await;
        assert_eq!(refused.err(), Some(SafeFetchError::PrivateNetworkHost));
        assert_eq!(calls.load(Ordering::SeqCst), 2);
        assert_eq!(*seen.0.lock().unwrap(), [first]);
    }

    #[tokio::test]
    async fn redirects_to_private_or_non_http_targets_are_refused() {
        let (port, _) = server().await;
        for location in [
            "http://10.0.0.1/",
            "http://169.254.169.254/latest/meta-data",
            "http://[::1]/",
            "file:///etc/passwd",
        ] {
            let url = format!(
                "http://calendar.test:{port}/redirect?to={}",
                encode(location)
            );
            let refused = safe_fetch(public_lookup()).fetch(&url, &request()).await;
            assert!(refused.is_err(), "{location}");
        }
    }

    #[tokio::test]
    async fn redirects_to_hosts_resolving_privately_are_refused() {
        let (port, _) = server().await;
        let lookup: Lookup = Arc::new(|host| {
            let address: IpAddr = if host == "internal.test" {
                [192, 168, 1, 10].into()
            } else {
                [127, 0, 0, 1].into()
            };
            Box::pin(async move { Ok(vec![address]) })
        });
        let target = encode(&format!("http://internal.test:{port}/ok"));
        let refused = safe_fetch(lookup)
            .fetch(
                &format!("http://calendar.test:{port}/redirect?to={target}"),
                &request(),
            )
            .await;
        assert_eq!(refused.err(), Some(SafeFetchError::PrivateNetworkHost));
    }

    #[tokio::test]
    async fn redirect_count_is_limited() {
        let (port, _) = server().await;
        let refused = safe_fetch(public_lookup())
            .fetch(&format!("http://calendar.test:{port}/loop"), &request())
            .await;
        assert_eq!(refused.err(), Some(SafeFetchError::TooManyRedirects));
    }

    #[tokio::test]
    async fn response_size_is_capped_after_decompression() {
        let (port, _) = server().await;
        let fetch = safe_fetch(public_lookup());
        for path in ["big", "gzip"] {
            let refused = fetch
                .fetch(&format!("http://calendar.test:{port}/{path}"), &request())
                .await;
            assert_eq!(
                refused.err(),
                Some(SafeFetchError::ResponseTooLarge),
                "{path}"
            );
        }
    }

    #[tokio::test]
    async fn gzip_bodies_within_the_cap_are_decoded() {
        let (port, _) = server().await;
        let response = safe_fetch(public_lookup())
            .fetch(
                &format!("http://calendar.test:{port}/gzip"),
                &SafeRequest {
                    max_bytes: 8192,
                    ..request()
                },
            )
            .await
            .unwrap();
        assert_eq!(response.body, "x".repeat(4096).as_bytes());
        assert!(response.headers.get(CONTENT_ENCODING).is_none());
    }

    #[tokio::test]
    async fn slow_responses_time_out() {
        let (port, _) = server().await;
        let refused = safe_fetch(public_lookup())
            .fetch(
                &format!("http://calendar.test:{port}/slow"),
                &SafeRequest {
                    timeout: Duration::from_millis(100),
                    ..request()
                },
            )
            .await;
        assert_eq!(refused.err(), Some(SafeFetchError::Timeout));
    }
}
