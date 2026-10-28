//! Redaction of emails, tokens, URLs and query strings from log text, like `report-redaction.ts`.

use std::sync::LazyLock;

use regex_lite::Regex;
use sha2::{Digest, Sha256};

const LOG_REF_HASH_LENGTH: usize = 12;

struct Patterns {
    email: Regex,
    encoded_email: Regex,
    bearer: Regex,
    url: Regex,
}

static PATTERNS: LazyLock<Patterns> = LazyLock::new(|| Patterns {
    email: pattern(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"),
    encoded_email: pattern(r"(?i)[a-zA-Z0-9._%+-]+%40[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"),
    bearer: pattern(r"(?i)Bearer\s+[A-Za-z0-9._~+/=-]+"),
    url: pattern(r#"(?i)https?://[^\s"'<>]+"#),
});

/// Only for constant patterns, which the tests compile.
fn pattern(source: &str) -> Regex {
    Regex::new(source).unwrap_or_else(|error| panic!("invalid constant pattern {source}: {error}"))
}

/// Emails, encoded emails, bearer tokens and URLs out of free-form text.
pub fn redact_pii(text: &str) -> String {
    let patterns = &*PATTERNS;
    let text = redact_emails(text);
    let text = patterns.bearer.replace_all(&text, "Bearer [redacted]");
    patterns.url.replace_all(&text, "[url]").into_owned()
}

fn redact_emails(text: &str) -> String {
    let text = PATTERNS.email.replace_all(text, "[email]");
    PATTERNS
        .encoded_email
        .replace_all(&text, "[email]")
        .into_owned()
}

/// Strips the query string and emails in path params, for absolute and relative URLs.
pub fn sanitize_request_url(raw: &str) -> String {
    if let Ok(mut url) = url::Url::parse(raw) {
        if url.query().is_some() {
            url.set_query(Some("[redacted]"));
        }
        let path = redact_emails(url.path());
        url.set_path(&path);
        return url.to_string();
    }
    let without_query = match raw.find('?') {
        Some(start) => format!("{}?[redacted]", &raw[..start]),
        None => raw.to_owned(),
    };
    redact_pii(&without_query)
}

/// A short stable reference for correlating logs without the raw value.
pub fn log_ref(value: &str) -> String {
    let normalized = value.trim().to_lowercase();
    if normalized.is_empty() {
        return "empty".into();
    }
    let digest = hex::encode(Sha256::digest(normalized.as_bytes()));
    digest[..LOG_REF_HASH_LENGTH].to_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn free_text_loses_emails_and_urls() {
        assert_eq!(
            redact_pii("mail roan@example.com, see https://solace.onl/x?y=1 with Bearer abc.def"),
            "mail [email], see [url] with Bearer [redacted]"
        );
        assert_eq!(redact_pii("key roan%40example.com"), "key [email]");
    }

    #[test]
    fn request_urls_lose_their_query() {
        assert_eq!(
            sanitize_request_url(
                "https://api.solace.onl/api/mail/keys/roan%40example.com?q=secret"
            ),
            "https://api.solace.onl/api/mail/keys/[email]?[redacted]"
        );
        assert_eq!(
            sanitize_request_url("/api/events/search?q=dentist"),
            "/api/events/search?[redacted]"
        );
        assert_eq!(sanitize_request_url("/api/health"), "/api/health");
    }

    #[test]
    fn log_refs_are_stable_and_opaque() {
        let reference = log_ref(" Roan@Example.com ");
        assert_eq!(reference, log_ref("roan@example.com"));
        assert_eq!(reference.len(), 12);
        assert!(!reference.contains("roan"));
        assert_eq!(log_ref("  "), "empty");
    }
}
