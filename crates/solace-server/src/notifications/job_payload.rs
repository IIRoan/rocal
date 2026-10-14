//! `lib/notification-job.ts`: outbox payloads hold a closed set of opaque references; the iOS NSE resolves content on-device.

use serde_json::{Map, Value, json};
use thiserror::Error;

use crate::http::zod::js_length;

const ALLOWED_KEYS: [&str; 6] = [
    "kind",
    "eventId",
    "minutesBefore",
    "inboundCount",
    "emailId",
    "accountId",
];
const MAX_OPAQUE_ID_LENGTH: usize = 128;
const DISALLOWED: &str = "Notification job payload contains disallowed fields.";

/// `NotificationJobPayloadError`.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
#[error("{0}")]
pub struct PayloadError(String);

fn opaque_id(value: &Value, field: &str) -> Result<Value, PayloadError> {
    match value.as_str().map(str::trim) {
        Some(id) if !id.is_empty() && js_length(id) <= MAX_OPAQUE_ID_LENGTH => Ok(id.into()),
        _ => Err(PayloadError(format!("Invalid {field}."))),
    }
}

fn integer_at_least(value: &Value, field: &str, min: f64) -> Result<Value, PayloadError> {
    match value.as_f64() {
        Some(number) if number.fract() == 0.0 && number >= min => Ok(value.clone()),
        _ => Err(PayloadError(format!("Invalid {field}."))),
    }
}

/// `sanitizeNotificationJobPayload`: unknown keys, malformed refs and refs of the other job kind are refused.
pub fn sanitize(input: &Map<String, Value>) -> Result<Value, PayloadError> {
    if input
        .keys()
        .any(|key| !ALLOWED_KEYS.contains(&key.as_str()))
    {
        return Err(PayloadError(DISALLOWED.into()));
    }
    let mut payload = Map::new();
    if let Some(kind) = input.get("kind") {
        match kind.as_str() {
            Some("event_reminder" | "new_mail") => payload.insert("kind".into(), kind.clone()),
            _ => return Err(PayloadError("Invalid notification job kind.".into())),
        };
    }
    for (key, check) in [
        ("eventId", None),
        ("minutesBefore", Some(0.0)),
        ("inboundCount", Some(1.0)),
        ("emailId", None),
        ("accountId", None),
    ] {
        if let Some(value) = input.get(key) {
            let checked = match check {
                Some(min) => integer_at_least(value, key, min)?,
                None => opaque_id(value, key)?,
            };
            payload.insert(key.into(), checked);
        }
    }
    let kind = payload.get("kind").and_then(Value::as_str);
    let has = |key: &str| payload.contains_key(key);
    if (kind == Some("event_reminder") && (has("emailId") || has("accountId")))
        || (kind == Some("new_mail") && has("eventId"))
    {
        return Err(PayloadError(DISALLOWED.into()));
    }
    Ok(Value::Object(payload))
}

fn sanitize_value(input: Value) -> Result<Value, PayloadError> {
    match input {
        Value::Object(input) => sanitize(&input),
        _ => Err(PayloadError(DISALLOWED.into())),
    }
}

/// `eventReminderPayload`.
pub fn event_reminder_payload(event_id: &str, minutes_before: u32) -> Result<Value, PayloadError> {
    sanitize_value(json!({
        "kind": "event_reminder",
        "eventId": event_id,
        "minutesBefore": minutes_before,
    }))
}

/// `newMailPayload`: blank refs are left out.
pub fn new_mail_payload(
    inbound_count: u32,
    email_id: Option<&str>,
    account_id: Option<&str>,
) -> Result<Value, PayloadError> {
    let mut payload = json!({ "kind": "new_mail", "inboundCount": inbound_count });
    for (key, value) in [("emailId", email_id), ("accountId", account_id)] {
        if let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) {
            payload[key] = value.into();
        }
    }
    sanitize_value(payload)
}

/// `shouldScheduleEventReminder`: unless both channels are explicitly off.
pub fn should_schedule_event_reminder(
    email_notifications: Option<bool>,
    push_notifications: Option<bool>,
) -> bool {
    email_notifications != Some(false) || push_notifications != Some(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn object(value: Value) -> Map<String, Value> {
        match value {
            Value::Object(map) => map,
            other => panic!("not an object: {other}"),
        }
    }

    fn rejects_plaintext(field: &str) {
        let mut mail = object(json!({"kind": "new_mail", "inboundCount": 1}));
        mail.insert(field.into(), "Secret".into());
        assert!(sanitize(&mail).is_err(), "{field}");
        let mut reminder =
            object(json!({"kind": "event_reminder", "eventId": "evt-1", "minutesBefore": 15}));
        reminder.insert(field.into(), "Secret".into());
        assert!(sanitize(&reminder).is_err(), "{field}");
    }

    #[test]
    fn accepts_the_opaque_ref_allowlist() {
        let input = object(json!({
            "kind": "new_mail",
            "inboundCount": 1,
            "emailId": " email-1 ",
            "accountId": "acct-1",
        }));
        assert_eq!(
            sanitize(&input),
            Ok(
                json!({"kind": "new_mail", "inboundCount": 1, "emailId": "email-1", "accountId": "acct-1"})
            )
        );
    }

    #[test]
    fn rejects_plaintext_title() {
        rejects_plaintext("title");
    }

    #[test]
    fn rejects_plaintext_subject() {
        rejects_plaintext("subject");
    }

    #[test]
    fn rejects_plaintext_from_name() {
        rejects_plaintext("fromName");
    }

    #[test]
    fn rejects_plaintext_display_title() {
        rejects_plaintext("displayTitle");
    }

    #[test]
    fn rejects_refs_of_the_other_kind() {
        let reminder =
            object(json!({"kind": "event_reminder", "eventId": "evt-1", "emailId": "email-1"}));
        assert!(sanitize(&reminder).is_err());
        let mail = object(json!({"kind": "new_mail", "inboundCount": 1, "eventId": "evt-1"}));
        assert!(sanitize(&mail).is_err());
        for invalid in [
            json!({"kind": null}),
            json!({"eventId": " "}),
            json!({"eventId": "e".repeat(129)}),
            json!({"minutesBefore": 1.5}),
            json!({"inboundCount": 0}),
        ] {
            assert!(sanitize(&object(invalid.clone())).is_err(), "{invalid}");
        }
    }

    #[test]
    fn builds_event_and_mail_payloads() {
        assert_eq!(
            event_reminder_payload("evt-1", 0),
            Ok(json!({"kind": "event_reminder", "eventId": "evt-1", "minutesBefore": 0}))
        );
        assert_eq!(
            new_mail_payload(3, None, None),
            Ok(json!({"kind": "new_mail", "inboundCount": 3}))
        );
        assert_eq!(
            new_mail_payload(1, Some("email-1"), Some(" acct-1 ")),
            Ok(
                json!({"kind": "new_mail", "inboundCount": 1, "emailId": "email-1", "accountId": "acct-1"})
            )
        );
        assert!(should_schedule_event_reminder(None, None));
        assert!(should_schedule_event_reminder(Some(false), Some(true)));
        assert!(!should_schedule_event_reminder(Some(false), Some(false)));
    }
}
