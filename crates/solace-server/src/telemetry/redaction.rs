//! The `report-redaction.ts` rules over the keys in `packages/calendar-core/src/redaction-policy.js`.

use std::collections::HashSet;
use std::sync::LazyLock;

use regex_lite::Regex;
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};

const POLICY: &str = include_str!("../../../../packages/calendar-core/src/redaction-policy.js");
const LOG_REF_HASH_LENGTH: usize = 12;
const MAX_CONTEXT_DEPTH: usize = 6;
pub const OMITTED: &str = "[omitted]";

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

/// `LOG_OMIT_FIELD_KEYS` and `LOG_HASH_FIELD_KEYS`, lowercased, read from the shared policy file.
pub struct Policy {
    pub omit: HashSet<String>,
    pub hash: HashSet<String>,
}

pub static POLICY_KEYS: LazyLock<Policy> = LazyLock::new(|| Policy {
    omit: policy_list("LOG_OMIT_FIELD_KEYS"),
    hash: policy_list("LOG_HASH_FIELD_KEYS"),
});

fn policy_list(name: &str) -> HashSet<String> {
    let Some(start) = POLICY.find(&format!("export const {name} = Object.freeze([")) else {
        return HashSet::new();
    };
    let rest = &POLICY[start..];
    let end = rest.find("]);").unwrap_or(rest.len());
    let quoted = pattern(r#""([^"]+)""#);
    quoted
        .captures_iter(&rest[..end])
        .filter_map(|capture| capture.get(1))
        .map(|key| key.as_str().to_lowercase())
        .collect()
}

/// Emails, encoded emails, bearer tokens and URLs out of free-form text.
pub fn redact_pii(text: &str) -> String {
    let patterns = &*PATTERNS;
    let text = patterns.email.replace_all(text, "[email]");
    let text = patterns.encoded_email.replace_all(&text, "[email]");
    let text = patterns.bearer.replace_all(&text, "Bearer [redacted]");
    patterns.url.replace_all(&text, "[url]").into_owned()
}

/// Strips the query string and emails in path params, for absolute and relative URLs.
pub fn sanitize_request_url(raw: &str) -> String {
    if let Ok(mut url) = url::Url::parse(raw) {
        if url.query().is_some() {
            url.set_query(Some("[redacted]"));
        }
        let patterns = &*PATTERNS;
        let path = patterns
            .email
            .replace_all(url.path(), "[email]")
            .into_owned();
        let path = patterns
            .encoded_email
            .replace_all(&path, "[email]")
            .into_owned();
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

/// Omits content keys, hashes identifier keys, redacts strings and summarizes arrays, like `sanitizeContext`.
pub fn sanitize_context(context: &Map<String, Value>) -> Map<String, Value> {
    sanitize_object(context, 0)
}

fn sanitize_object(context: &Map<String, Value>, depth: usize) -> Map<String, Value> {
    context
        .iter()
        .map(|(key, value)| (key.clone(), sanitize_value(key, value, depth)))
        .collect()
}

fn sanitize_value(key: &str, value: &Value, depth: usize) -> Value {
    if value.is_null() {
        return Value::Null;
    }
    let key = key.to_lowercase();
    let policy = &*POLICY_KEYS;
    if policy.omit.contains(&key) {
        return json!(OMITTED);
    }
    if policy.hash.contains(&key) {
        return match value {
            Value::String(text) => json!(log_ref(text)),
            _ => json!(OMITTED),
        };
    }
    match value {
        Value::String(text) => json!(redact_pii(text)),
        Value::Array(_) | Value::Object(_) if depth >= MAX_CONTEXT_DEPTH => json!(OMITTED),
        Value::Array(items) => {
            let mut summary = Map::new();
            summary.insert("count".into(), json!(items.len()));
            if let Some(first) = items.first() {
                summary.insert("sample".into(), sanitize_value(&key, first, depth + 1));
            }
            Value::Object(summary)
        }
        Value::Object(object) => Value::Object(sanitize_object(object, depth + 1)),
        other => other.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redaction_keys_come_from_the_shared_policy() {
        let policy = &*POLICY_KEYS;
        for key in [
            "password",
            "token",
            "displaytitle",
            "x-solace-gate",
            "bodyvalues",
        ] {
            assert!(policy.omit.contains(key), "{key}");
        }
        for key in ["email", "chosenemail", "emailid", "localpart"] {
            assert!(policy.hash.contains(key), "{key}");
        }
        assert!(policy.omit.is_disjoint(&policy.hash));
    }

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

    #[test]
    fn structured_context_is_redacted_by_key() {
        let context = json!({
            "userId": "u1",
            "email": "roan@example.com",
            "password": "hunter2",
            "note": "from roan@example.com",
            "nested": {"title": "Dentist", "count": 2},
            "recipients": ["a@example.com", "b@example.com"],
            "missing": null,
        });
        let Value::Object(context) = context else {
            unreachable!()
        };
        let sanitized = Value::Object(sanitize_context(&context));
        assert_eq!(
            sanitized,
            json!({
                "userId": "u1",
                "email": log_ref("roan@example.com"),
                "password": OMITTED,
                "note": "from [email]",
                "nested": {"title": OMITTED, "count": 2},
                "recipients": {"count": 2, "sample": "[email]"},
                "missing": null,
            })
        );
    }
}
