//! `lib/stalwart-mail-limits.ts`: the Email and Jmap settings singletons, read with the provisioning token and parsed like `calendar-core`'s mail-server policy.

use std::sync::LazyLock;

use regex_lite::Regex;
use serde_json::{Value, json};
use solace_api_types::mail::{MailDefaultFolder, MailServerLimits};

use super::admin::{Admin, AdminError, method_result};

const EMAIL_PROPERTIES: [&str; 7] = [
    "maxAttachmentSize",
    "maxMessageSize",
    "maxMailboxDepth",
    "maxMailboxNameLength",
    "maxMailboxes",
    "maxIdentities",
    "defaultFolders",
];
const JMAP_PROPERTIES: [&str; 7] = [
    "maxUploadSize",
    "getMaxResults",
    "queryMaxResults",
    "maxMethodCalls",
    "maxConcurrentUploads",
    "maxRequestSize",
    "uploadTtl",
];

pub async fn fetch(admin: &Admin<'_>) -> Result<MailServerLimits, AdminError> {
    let envelope = admin
        .call_jmap(json!([
            ["x:Email/get", {"ids": ["singleton"], "properties": EMAIL_PROPERTIES}, "email-limits"],
            ["x:Jmap/get", {"ids": ["singleton"], "properties": JMAP_PROPERTIES}, "jmap-limits"],
        ]))
        .await?;
    let first = |method: &str| -> Result<Option<Value>, AdminError> {
        Ok(method_result(&envelope, method)?
            .pointer("/list/0")
            .cloned())
    };
    let email = first("x:Email/get")?;
    let jmap = first("x:Jmap/get")?;
    let field = |settings: &Option<Value>, key: &str| {
        settings
            .as_ref()
            .and_then(|settings| settings.get(key))
            .filter(|value| !value.is_null())
            .cloned()
    };
    let number = |settings: &Option<Value>, key: &str| field(settings, key).and_then(|v| count(&v));
    Ok(MailServerLimits {
        max_blob_upload_bytes: field(&jmap, "maxUploadSize").and_then(|v| size_bytes(&v)),
        max_attachment_size_bytes: field(&email, "maxAttachmentSize").and_then(|v| size_bytes(&v)),
        max_message_size_bytes: field(&email, "maxMessageSize").and_then(|v| size_bytes(&v)),
        max_mailbox_depth: number(&email, "maxMailboxDepth"),
        max_mailbox_name_length: number(&email, "maxMailboxNameLength"),
        max_mailboxes: number(&email, "maxMailboxes"),
        max_identities: number(&email, "maxIdentities"),
        default_folders: field(&email, "defaultFolders").map(|v| default_folders(&v)),
        get_max_results: number(&jmap, "getMaxResults"),
        query_max_results: number(&jmap, "queryMaxResults"),
        max_method_calls: number(&jmap, "maxMethodCalls"),
        max_concurrent_uploads: number(&jmap, "maxConcurrentUploads"),
        max_request_size_bytes: field(&jmap, "maxRequestSize").and_then(|v| size_bytes(&v)),
        upload_ttl_ms: field(&jmap, "uploadTtl").and_then(|v| duration_ms(&v)),
    })
}

/// `Number(value)` for the integer settings.
fn count(value: &Value) -> Option<u32> {
    match value {
        Value::Number(number) => number.as_u64(),
        Value::String(text) => text.trim().parse().ok(),
        _ => None,
    }
    .and_then(|n| u32::try_from(n).ok())
}

fn positive_integer(value: &Value) -> Option<u64> {
    value
        .as_f64()
        .filter(|n| *n > 0.0 && n.fract() == 0.0)
        .map(|n| n as u64)
}

/// `parseStalwartSizeBytes`: a positive integer, or a decimal amount with a unit (`75mb`, `1.5GiB`).
fn size_bytes(value: &Value) -> Option<u64> {
    static PATTERN: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"^(\d+(?:\.\d+)?)([a-z]+)?$").unwrap_or_else(|e| panic!("size pattern: {e}"))
    });
    if value.is_number() {
        return positive_integer(value);
    }
    let text = value.as_str()?.trim().to_lowercase();
    let captures = PATTERN.captures(&text)?;
    let amount: f64 = captures.get(1)?.as_str().parse().ok()?;
    let multiplier = match captures.get(2).map_or("b", |unit| unit.as_str()) {
        "b" => 1.0,
        "kb" => 1e3,
        "mb" => 1e6,
        "gb" => 1e9,
        "kib" => 1024.0,
        "mib" => 1024.0 * 1024.0,
        "gib" => 1024.0 * 1024.0 * 1024.0,
        _ => return None,
    };
    (amount > 0.0).then(|| (amount * multiplier).floor() as u64)
}

/// `parseStalwartDuration`: positive milliseconds, or an amount of `s`, `m`, `h` or `d`.
fn duration_ms(value: &Value) -> Option<u64> {
    static PATTERN: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"^(\d+(?:\.\d+)?)([smhd])$").unwrap_or_else(|e| panic!("duration pattern: {e}"))
    });
    if value.is_number() {
        return positive_integer(value);
    }
    let text = value.as_str()?.trim().to_lowercase();
    let captures = PATTERN.captures(&text)?;
    let amount: f64 = captures.get(1)?.as_str().parse().ok()?;
    let unit = match captures.get(2)?.as_str() {
        "s" => 1e3,
        "m" => 6e4,
        "h" => 3.6e6,
        _ => 8.64e7,
    };
    (amount > 0.0).then(|| (amount * unit).floor() as u64)
}

fn builtin_folders() -> Vec<MailDefaultFolder> {
    [
        ("inbox", "Inbox"),
        ("drafts", "Drafts"),
        ("sent", "Sent"),
        ("trash", "Trash"),
    ]
    .into_iter()
    .map(|(role, name)| MailDefaultFolder {
        role: role.into(),
        name: name.into(),
        create: true,
        subscribe: true,
    })
    .collect()
}

/// `parseStalwartDefaultFolders`: named folders by role, else the four built-in ones.
fn default_folders(value: &Value) -> Vec<MailDefaultFolder> {
    let folders: Vec<MailDefaultFolder> = value
        .as_object()
        .into_iter()
        .flatten()
        .filter_map(|(role, folder)| {
            let folder = folder.as_object()?;
            let name = folder.get("name")?.as_str()?.trim();
            (!name.is_empty()).then(|| MailDefaultFolder {
                role: role.to_lowercase(),
                name: name.to_owned(),
                create: folder.get("create") != Some(&Value::Bool(false)),
                subscribe: folder.get("subscribe") != Some(&Value::Bool(false)),
            })
        })
        .collect();
    if folders.is_empty() {
        builtin_folders()
    } else {
        folders
    }
}

#[cfg(test)]
mod tests {
    use super::super::admin::Admin;
    use super::super::fake::{FakeStalwart, Reply};
    use super::*;

    #[tokio::test]
    async fn partial_limits_when_a_singleton_fails() {
        let fake = FakeStalwart::scripted(vec![Reply::json(json!({"methodResponses": [
            ["x:Email/get", {"notFound": {"singleton": {}}}, "e1"],
            ["x:Jmap/get", {"list": [{"maxUploadSize": "75mb"}]}, "j1"],
        ]}))])
        .await;
        let limits = fetch(&Admin::for_tests(&fake)).await.unwrap();
        assert_eq!(
            serde_json::to_value(&limits).unwrap(),
            json!({"maxBlobUploadBytes": 75_000_000, "maxAttachmentSizeBytes": null, "maxMessageSizeBytes": null})
        );
        assert_eq!(
            fake.requests()[0].json(),
            json!({"using": ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"], "methodCalls": [
                ["x:Email/get", {"ids": ["singleton"], "properties": EMAIL_PROPERTIES}, "email-limits"],
                ["x:Jmap/get", {"ids": ["singleton"], "properties": JMAP_PROPERTIES}, "jmap-limits"],
            ]})
        );
    }

    #[test]
    fn returns_the_matching_method_response() {
        let envelope = json!({"methodResponses": [
            ["Mailbox/get", {"list": []}, "c1"],
            ["x:Email/get", {"list": [{"maxAttachmentSize": 1}]}, "c2"],
        ]});
        assert_eq!(
            method_result(&envelope, "x:Email/get").unwrap(),
            &json!({"list": [{"maxAttachmentSize": 1}]})
        );
        assert!(method_result(&envelope, "x:Jmap/get").is_err());
    }

    #[test]
    fn parses_sizes_durations_and_folders_like_calendar_core() {
        assert_eq!(size_bytes(&json!(50_000_000)), Some(50_000_000));
        assert_eq!(size_bytes(&json!(" 1.5KiB ")), Some(1536));
        assert_eq!(size_bytes(&json!("10")), Some(10));
        assert_eq!(size_bytes(&json!("10tb")), None);
        assert_eq!(size_bytes(&json!(-1)), None);
        assert_eq!(duration_ms(&json!("1h")), Some(3_600_000));
        assert_eq!(duration_ms(&json!(3_600_000)), Some(3_600_000));
        assert_eq!(duration_ms(&json!("5w")), None);
        assert_eq!(default_folders(&json!({})), builtin_folders());
        assert_eq!(
            default_folders(
                &json!({"Inbox": {"name": " In ", "create": false}, "x": {"name": ""}})
            ),
            vec![MailDefaultFolder {
                role: "inbox".into(),
                name: "In".into(),
                create: false,
                subscribe: true
            }]
        );
    }
}
