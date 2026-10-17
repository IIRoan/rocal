//! `withStalwartGate`: the backend-gate key goes only to https calls on the configured Stalwart origin.

use reqwest::RequestBuilder;

pub const GATE_HEADER: &str = "X-Solace-Gate";

#[derive(Debug, Clone)]
pub struct StalwartGate {
    origin: Option<String>,
    key: Option<String>,
}

impl StalwartGate {
    pub fn new(stalwart_base_url: &str, key: Option<&str>) -> Self {
        Self {
            origin: origin_of(stalwart_base_url),
            key: key
                .map(str::trim)
                .filter(|key| !key.is_empty())
                .map(str::to_owned),
        }
    }

    /// The key to send with a request to `url`, if any.
    pub fn key_for(&self, url: &str) -> Option<&str> {
        let key = self.key.as_deref()?;
        let origin = self
            .origin
            .as_deref()
            .filter(|origin| origin.starts_with("https://"))?;
        (origin_of(url).as_deref() == Some(origin)).then_some(key)
    }

    /// Sets the gate header (replacing a caller-supplied one) when the request goes to the gated origin.
    pub fn apply(&self, request: RequestBuilder, url: &str) -> RequestBuilder {
        let Some(value) = self
            .key_for(url)
            .and_then(|key| reqwest::header::HeaderValue::from_str(key).ok())
        else {
            return request;
        };
        // `headers` replaces existing values where `header` would append a second one.
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(GATE_HEADER, value);
        request.headers(headers)
    }
}

fn origin_of(url: &str) -> Option<String> {
    url::Url::parse(url)
        .ok()
        .map(|url| url.origin().ascii_serialization())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn header(gate: &StalwartGate, url: &str, existing: Option<&str>) -> Vec<String> {
        let mut request = reqwest::Client::new().get(url);
        if let Some(existing) = existing {
            request = request
                .header(GATE_HEADER, existing)
                .header("x-other", "kept");
        }
        let request = gate.apply(request, url).build().unwrap();
        request
            .headers()
            .get_all(GATE_HEADER)
            .iter()
            .filter_map(|v| v.to_str().ok().map(str::to_owned))
            .collect()
    }

    #[test]
    fn adds_the_key_to_https_requests() {
        let gate = StalwartGate::new("https://stalwart.test", Some("solace-test-gate"));
        assert_eq!(
            header(&gate, "https://stalwart.test/jmap/session", None),
            ["solace-test-gate"]
        );
        let request = gate
            .apply(
                reqwest::Client::new()
                    .get("https://stalwart.test/jmap")
                    .header("x-other", "kept"),
                "https://stalwart.test/jmap",
            )
            .build()
            .unwrap();
        assert_eq!(
            request
                .headers()
                .get("x-other")
                .and_then(|v| v.to_str().ok()),
            Some("kept")
        );
    }

    #[test]
    fn never_sends_the_key_over_http() {
        let gate = StalwartGate::new("http://stalwart.test", Some("solace-test-gate"));
        assert!(header(&gate, "http://stalwart.test/jmap/session", None).is_empty());
    }

    #[test]
    fn only_sends_the_key_to_the_stalwart_origin() {
        let gate = StalwartGate::new("https://stalwart.test", Some("solace-test-gate"));
        assert!(header(&gate, "https://elsewhere.test/jmap", None).is_empty());
        assert!(header(&gate, "https://stalwart.test:8443/jmap", None).is_empty());
    }

    #[test]
    fn passes_through_without_a_key() {
        let gate = StalwartGate::new("https://stalwart.test", Some("  "));
        assert!(header(&gate, "https://stalwart.test/jmap", None).is_empty());
    }

    #[test]
    fn replaces_a_caller_supplied_gate_header() {
        let gate = StalwartGate::new("https://stalwart.test", Some("solace-test-gate"));
        assert_eq!(
            header(&gate, "https://stalwart.test/jmap", Some("forged")),
            ["solace-test-gate"]
        );
    }
}
