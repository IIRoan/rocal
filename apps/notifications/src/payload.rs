//! `notification_job.payload`: opaque references only; the iOS Notification Service Extension resolves content on-device.

use serde_json::{Map, Value};

const ALLOWED: [&str; 7] = [
    "kind",
    "eventId",
    "minutesBefore",
    "inboundCount",
    "emailId",
    "accountId",
    "emailFallback",
];
/// Legacy plaintext keys: rows that still carry them are delivered, but the values are never read.
const LEGACY_IGNORED: [&str; 3] = ["subject", "title", "fromName"];
const MAX_OPAQUE_ID_LENGTH: usize = 128;

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Payload {
    pub kind: String,
    pub event_id: String,
    pub minutes_before: Option<i64>,
    pub inbound_count: Option<i64>,
    pub email_id: String,
    pub account_id: String,
    /// A reminder push whose email was dropped; if the push ends skipped, that email is queued instead.
    pub email_fallback: bool,
}

/// The payload, or `None` when it is malformed or carries anything but opaque references.
pub fn parse(raw: &str) -> Option<Payload> {
    // A JSON `null` payload reads as empty, as Go's decoder read it.
    let map = match serde_json::from_str::<Value>(raw) {
        Ok(Value::Object(map)) => map,
        Ok(Value::Null) => Map::new(),
        _ => return None,
    };
    if map
        .keys()
        .any(|key| !ALLOWED.contains(&key.as_str()) && !LEGACY_IGNORED.contains(&key.as_str()))
    {
        return None;
    }
    let payload = Payload {
        kind: text(&map, "kind")?,
        event_id: text(&map, "eventId")?,
        minutes_before: number(&map, "minutesBefore")?,
        inbound_count: number(&map, "inboundCount")?,
        email_id: text(&map, "emailId")?,
        account_id: text(&map, "accountId")?,
        email_fallback: match map.get("emailFallback") {
            None | Some(Value::Null) => false,
            Some(Value::Bool(flag)) => *flag,
            Some(_) => return None,
        },
    };
    let mail_refs = !payload.email_id.is_empty() || !payload.account_id.is_empty();
    let valid = match payload.kind.as_str() {
        "" => true,
        "event_reminder" => !mail_refs,
        "new_mail" => payload.event_id.is_empty() && !payload.email_fallback,
        _ => false,
    };
    let short = [&payload.event_id, &payload.email_id, &payload.account_id]
        .iter()
        .all(|id| id.len() <= MAX_OPAQUE_ID_LENGTH);
    (valid && short).then_some(payload)
}

/// A trimmed string field; absent or null is empty, any other type is invalid.
fn text(map: &Map<String, Value>, key: &str) -> Option<String> {
    match map.get(key) {
        None | Some(Value::Null) => Some(String::new()),
        Some(Value::String(value)) => Some(value.trim().to_owned()),
        Some(_) => None,
    }
}

/// An optional integer field; any other type is invalid.
fn number(map: &Map<String, Value>, key: &str) -> Option<Option<i64>> {
    match map.get(key) {
        None | Some(Value::Null) => Some(None),
        Some(value) => value.as_i64().map(Some),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_fields_are_rejected() {
        for raw in [
            r#"{"kind":"event_reminder","eventId":"e1","description":"x"}"#,
            r#"{"kind":"event_reminder","location":"x"}"#,
            r#"{"kind":"new_mail","preview":"x"}"#,
            r#"{"kind":"birthday"}"#,
            r#"{"kind":"event_reminder","minutesBefore":"5"}"#,
            "not json",
            "[]",
            "5",
        ] {
            assert_eq!(parse(raw), None, "{raw}");
        }
    }

    #[test]
    fn a_null_payload_reads_as_empty() {
        assert_eq!(parse("null"), Some(Payload::default()));
    }

    #[test]
    fn metadata_and_mail_refs_are_allowed() {
        assert_eq!(
            parse(r#"{"kind":"event_reminder","eventId":" e1 ","minutesBefore":15}"#),
            Some(Payload {
                kind: "event_reminder".into(),
                event_id: "e1".into(),
                minutes_before: Some(15),
                ..Payload::default()
            })
        );
        let mail = parse(r#"{"kind":"new_mail","emailId":"m1","accountId":"a1","inboundCount":3}"#)
            .unwrap();
        assert_eq!(
            (
                mail.email_id.as_str(),
                mail.account_id.as_str(),
                mail.inbound_count
            ),
            ("m1", "a1", Some(3))
        );
    }

    #[test]
    fn legacy_plaintext_keys_are_tolerated_but_never_read() {
        let payload = parse(
            r#"{"kind":"new_mail","emailId":"m1","subject":"Secret","fromName":"Ann","title":"T"}"#,
        )
        .unwrap();
        assert_eq!(payload.email_id, "m1");
        assert!(!format!("{payload:?}").contains("Secret"));
    }

    #[test]
    fn refs_must_match_the_kind() {
        assert_eq!(parse(r#"{"kind":"event_reminder","emailId":"m1"}"#), None);
        assert_eq!(parse(r#"{"kind":"event_reminder","accountId":"a1"}"#), None);
        assert_eq!(parse(r#"{"kind":"new_mail","eventId":"e1"}"#), None);
        assert_eq!(parse(r#"{"kind":"new_mail","emailFallback":true}"#), None);
        assert!(
            parse(r#"{"kind":"event_reminder","eventId":"e1","emailFallback":true}"#)
                .unwrap()
                .email_fallback
        );
    }

    #[test]
    fn opaque_ids_are_bounded() {
        let long = "x".repeat(MAX_OPAQUE_ID_LENGTH + 1);
        assert_eq!(parse(&format!(r#"{{"eventId":"{long}"}}"#)), None);
        assert!(parse(&format!(r#"{{"eventId":"{}"}}"#, &long[1..])).is_some());
    }
}
