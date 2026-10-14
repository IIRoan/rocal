//! The client address for rate limits: `getClientIp` from `lib/rate-limit.ts`, used in memory only and never stored.

use std::net::IpAddr;

use axum::http::HeaderMap;

/// The platform sets these headers; a client cannot choose its own address behind the edge.
pub const TRUSTED_HEADERS: [&str; 2] = ["x-real-ip", "x-forwarded-for"];

/// The first entry of the first trusted header that holds an IP, else `unknown`.
pub fn client_ip(headers: &HeaderMap) -> String {
    TRUSTED_HEADERS
        .iter()
        .filter_map(|name| headers.get(*name)?.to_str().ok())
        .filter_map(|value| value.split(',').next().map(str::trim))
        .find(|first| first.parse::<IpAddr>().is_ok())
        .map_or_else(|| "unknown".into(), str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers(pairs: &[(&'static str, &str)]) -> HeaderMap {
        let mut headers = HeaderMap::new();
        for (name, value) in pairs {
            headers.insert(*name, value.parse().unwrap());
        }
        headers
    }

    #[test]
    fn platform_headers_win_and_non_ips_are_unknown() {
        assert_eq!(
            client_ip(&headers(&[
                ("x-real-ip", "198.51.100.4"),
                ("x-forwarded-for", "10.0.0.1")
            ])),
            "198.51.100.4"
        );
        assert_eq!(
            client_ip(&headers(&[("x-forwarded-for", "2001:db8::1, 10.0.0.1")])),
            "2001:db8::1"
        );
        assert_eq!(
            client_ip(&headers(&[("x-forwarded-for", "not-an-ip")])),
            "unknown"
        );
        assert_eq!(client_ip(&HeaderMap::new()), "unknown");
    }
}
