//! Request-schema pieces shared across routes, one per schema in `route-schemas.ts`, `_schemas.ts` and `_zod.ts`.

use std::sync::LazyLock;

use regex_lite::Regex;
use serde_json::Value;

use super::zod::{self, RefineCtx, Schema};
use crate::addresses::is_reserved_system_email;
use crate::entity_metadata::{
    CALENDAR_COLORS, has_encrypted_payload_value, is_valid_calendar_color,
};

pub const PLAINTEXT_NAME_WITH_CIPHERTEXT_MESSAGE: &str =
    "Plaintext names must not be sent alongside an encrypted name.";

pub fn encryption_state_schema() -> Schema {
    zod::enumeration(&["plaintext", "shadow_write", "encrypted"])
}

pub fn calendar_color_schema() -> Schema {
    let message = format!(
        "Color must be one of: {} or a valid hex color (e.g., #FF0000)",
        CALENDAR_COLORS.join(", ")
    );
    zod::string().refine(
        |value| value.as_str().is_some_and(is_valid_calendar_color),
        &message,
        &[],
    )
}

pub fn calendar_delete_action_schema() -> Schema {
    zod::enumeration(&["delete_events", "move_events"])
}

/// `encryptionShadowFieldsSchema.shape`: `encryptionState` is accepted from older clients and ignored.
pub fn encryption_shadow_fields() -> [(&'static str, Schema); 4] {
    [
        ("encryptedName", zod::string().optional()),
        ("blindIndexTokens", zod::array(zod::string()).optional()),
        ("encryptionState", encryption_state_schema().optional()),
        (
            "encryptionKeyVersion",
            zod::number().int().gte(1.0).optional(),
        ),
    ]
}

/// `refineEncryptedNameBody`: no plaintext name beside its ciphertext, and a name of either kind when required.
pub fn refine_encrypted_name_body(
    entity_label: &'static str,
    require_name: bool,
) -> impl Fn(&Value, &mut RefineCtx<'_>) + Send + Sync + 'static {
    move |body, ctx| {
        let has_ciphertext = has_encrypted_payload_value(body.get("encryptedName"));
        let has_plaintext_name = body
            .get("name")
            .and_then(Value::as_str)
            .is_some_and(|name| !zod::js_trim(name).is_empty());
        if has_ciphertext && has_plaintext_name {
            ctx.add_issue(PLAINTEXT_NAME_WITH_CIPHERTEXT_MESSAGE, &["name"]);
        }
        if require_name && !has_ciphertext && !has_plaintext_name {
            ctx.add_issue(
                format!("{entity_label} name is required."),
                &["encryptedName"],
            );
        }
    }
}

/// What `Intl.DateTimeFormat(undefined, { timeZone })` accepts in Bun: IANA names in any case, or a UTC offset.
pub fn is_valid_timezone(value: &str) -> bool {
    crate::instant::time_zone(value).is_some()
}

/// `timezoneSchema`.
pub fn timezone_schema() -> Schema {
    zod::string().refine(
        |value| value.as_str().is_some_and(is_valid_timezone),
        "Invalid timezone identifier",
        &[],
    )
}

/// `recurrenceRuleObjectSchema`.
pub fn recurrence_rule_object_schema() -> Schema {
    let int_array = |min: f64, max: f64| zod::array(zod::number().int().gte(min).lte(max));
    zod::object([
        (
            "frequency",
            zod::enumeration(&["daily", "weekly", "monthly", "yearly"]),
        ),
        ("interval", zod::number().int().gte(1.0).lte(999.0)),
        ("count", zod::number().int().gte(1.0).optional()),
        ("until", zod::string().optional()),
        ("timezone", timezone_schema().optional()),
        ("byWeekDay", int_array(0.0, 6.0).optional()),
        ("byMonthDay", int_array(1.0, 31.0).optional()),
        ("byMonth", int_array(1.0, 12.0).optional()),
    ])
    .strict()
}

/// `recurrenceRuleSchema`: a rule object, or the JSON text of one.
pub fn recurrence_rule_schema() -> Schema {
    zod::union(vec![zod::string(), recurrence_rule_object_schema()])
}

/// `recurrenceScopeSchema`.
pub fn recurrence_scope_schema() -> Schema {
    zod::enumeration(&["this_only", "this_and_future", "all"])
}

/// `invitationImportStatusSchema`.
pub fn invitation_import_status_schema() -> Schema {
    zod::enumeration(&["accepted", "tentative"])
}

static PARTICIPANT_EMAIL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")
        .unwrap_or_else(|error| panic!("participant email pattern: {error}"))
});

/// `eventParticipantInputSchema`.
pub fn event_participant_input_schema() -> Schema {
    zod::object([
        (
            "email",
            zod::string()
                .min(3)
                .max(320)
                .regex(&PARTICIPANT_EMAIL)
                .refine(
                    |value| {
                        !value
                            .as_str()
                            .is_some_and(|email| is_reserved_system_email(email, None))
                    },
                    "Cannot invite system or administrative email addresses",
                    &[],
                ),
        ),
        ("displayName", zod::string().max(120).optional()),
        (
            "role",
            zod::enumeration(&["organizer", "attendee"]).optional(),
        ),
        (
            "status",
            zod::enumeration(&["pending", "accepted", "declined", "tentative"]).optional(),
        ),
    ])
    .strict()
}

/// `eventInvitationContentSchema`.
pub fn event_invitation_content_schema() -> Schema {
    zod::object([
        ("title", zod::string().min(1).max(255)),
        ("description", zod::string().max(1000).optional()),
        ("location", zod::string().max(255).optional()),
    ])
    .strict()
}

/// `eventContentEncryptionFieldsSchema.shape`.
pub fn event_content_encryption_fields() -> [(&'static str, Schema); 3] {
    [
        ("encryptedContent", zod::string().optional()),
        ("blindIndexTokens", zod::array(zod::string()).optional()),
        (
            "encryptionKeyVersion",
            zod::number().int().gte(1.0).optional(),
        ),
    ]
}

pub const PLAINTEXT_EVENT_CONTENT_WITH_CIPHERTEXT_MESSAGE: &str =
    "Plaintext event content must not be sent alongside encrypted content.";

/// `refineEncryptedEventContentBody`: no plaintext content beside ciphertext, and invitation copies only with both.
pub fn refine_encrypted_event_content_body(
    require_title: bool,
) -> impl Fn(&Value, &mut RefineCtx<'_>) + Send + Sync + 'static {
    move |body, ctx| {
        let has_ciphertext = has_encrypted_payload_value(body.get("encryptedContent"));
        if has_ciphertext {
            for field in ["title", "description", "location"] {
                if has_encrypted_payload_value(body.get(field)) {
                    ctx.add_issue(PLAINTEXT_EVENT_CONTENT_WITH_CIPHERTEXT_MESSAGE, &[field]);
                }
            }
        } else if require_title && !has_encrypted_payload_value(body.get("title")) {
            ctx.add_issue("Title is required and cannot be empty", &["title"]);
        }
        let has_participants = body
            .get("participants")
            .and_then(Value::as_array)
            .is_some_and(|participants| !participants.is_empty());
        if body.get("invitationContent").is_some() && (!has_ciphertext || !has_participants) {
            ctx.add_issue(
                "Invitation content is only accepted with encrypted content and participants.",
                &["invitationContent"],
            );
        }
    }
}

/// `eventEncryptionModeSchema`.
pub fn event_encryption_mode_schema() -> Schema {
    zod::enumeration(&["hybrid", "full"])
}

/// `themeSchema`.
pub fn theme_schema() -> Schema {
    zod::enumeration(&["light", "dark", "system"])
}

/// `defaultViewSchema`.
pub fn default_view_schema() -> Schema {
    zod::enumeration(&["month", "week", "day", "agenda"])
}

/// `timeFormatSchema`.
pub fn time_format_schema() -> Schema {
    zod::enumeration(&["12h", "24h"])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn time_zones_validate_like_bun_intl() {
        for valid in [
            "Europe/Amsterdam",
            "europe/amsterdam",
            "UTC",
            "utc",
            "GMT",
            "EST",
            "US/Pacific",
            "Asia/Calcutta",
            "Etc/GMT+5",
            "+05:30",
            "+0530",
            "-08",
            "+23:59",
        ] {
            assert!(is_valid_timezone(valid), "{valid}");
        }
        for invalid in [
            "Mars/Base",
            "",
            " Europe/Amsterdam",
            "Z",
            "+24:00",
            "+05:30:00",
            "+5",
            "05:30",
            "Factory",
            "localtime",
            "posixrules",
            "Etc/Unknown",
        ] {
            assert!(!is_valid_timezone(invalid), "{invalid}");
        }
    }
}
