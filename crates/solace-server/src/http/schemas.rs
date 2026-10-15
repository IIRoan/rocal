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

pub fn rsvp_status_schema() -> Schema {
    zod::enumeration(&["accepted", "declined", "tentative"])
}

pub fn bulk_event_action_schema() -> Schema {
    zod::enumeration(&["move", "delete", "duplicate"])
}

/// `eventInvitationContentSchema`: the transient plaintext for invitation mail.
pub fn event_invitation_content_schema() -> Schema {
    zod::object([
        ("title", zod::string().min(1).max(255)),
        ("description", zod::string().max(1000).optional()),
        ("location", zod::string().max(255).optional()),
    ])
    .strict()
}

/// `reminderFieldSchema`: minutes 0 to 43200, or `null`.
pub fn reminder_field_schema() -> Schema {
    zod::union(vec![
        zod::number().int().gte(0.0).lte(43_200.0),
        zod::null(),
    ])
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

/// `refineEncryptedEventContentBody`: no plaintext content beside ciphertext, a title without it, invitation copies only for encrypted invites.
pub fn refine_encrypted_event_content_body(
    require_title: bool,
) -> impl Fn(&Value, &mut RefineCtx<'_>) + Send + Sync + 'static {
    move |body, ctx| {
        let text = |name: &str| {
            body.get(name)
                .and_then(Value::as_str)
                .is_some_and(|v| !zod::js_trim(v).is_empty())
        };
        let has_ciphertext = has_encrypted_payload_value(body.get("encryptedContent"));
        if has_ciphertext {
            for field in ["title", "description", "location"] {
                if text(field) {
                    ctx.add_issue(
                        crate::events::encryption::PLAINTEXT_EVENT_CONTENT_WITH_CIPHERTEXT_MESSAGE,
                        &[field],
                    );
                }
            }
        } else if require_title && !text("title") {
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

/// `recurrenceFrequencySchema`.
pub fn recurrence_frequency_schema() -> Schema {
    zod::enumeration(&["daily", "weekly", "monthly", "yearly"])
}

/// `recurrenceRuleObjectSchema`.
pub fn recurrence_rule_object_schema() -> Schema {
    let int_array = |min: usize, max: usize| zod::array(zod::number().int().min(min).max(max));
    zod::object([
        ("frequency", recurrence_frequency_schema()),
        ("interval", zod::number().int().min(1).max(999)),
        ("count", zod::number().int().min(1).optional()),
        ("until", zod::string().optional()),
        ("timezone", timezone_schema().optional()),
        ("byWeekDay", int_array(0, 6).optional()),
        ("byMonthDay", int_array(1, 31).optional()),
        ("byMonth", int_array(1, 12).optional()),
    ])
    .strict()
}

/// `eventParticipantRoleSchema`.
pub fn event_participant_role_schema() -> Schema {
    zod::enumeration(&["organizer", "attendee"])
}

/// `eventParticipantStatusSchema`.
pub fn event_participant_status_schema() -> Schema {
    zod::enumeration(&["pending", "accepted", "declined", "tentative"])
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
        ("role", event_participant_role_schema().optional()),
        ("status", event_participant_status_schema().optional()),
    ])
    .strict()
}

/// `encryptedIcsImportEventSchema`: one client-encrypted event of an ICS file, a series override naming its series.
pub fn encrypted_ics_import_event_schema() -> Schema {
    let external_id = || zod::string().min(1).max(128);
    zod::object([
        ("externalId", external_id()),
        ("seriesExternalId", external_id().optional()),
        ("occurrenceDate", zod::string().datetime().optional()),
        (
            "excludedDates",
            zod::array(zod::string().datetime())
                .max(1000)
                .default(Value::Array(Vec::new())),
        ),
        ("start", zod::string().datetime()),
        ("end", zod::string().datetime()),
        ("allDay", zod::boolean()),
        ("timezone", timezone_schema()),
        ("recurrence", zod::string().optional()),
        ("encryptedContent", zod::string().min(1)),
        ("blindIndexTokens", zod::array(zod::string()).optional()),
        (
            "encryptionKeyVersion",
            zod::number().int().min(1).optional(),
        ),
        (
            "participants",
            zod::array(event_participant_input_schema()).optional(),
        ),
    ])
    .strict()
    .super_refine(|event, ctx| {
        let truthy = |key: &str| {
            event
                .get(key)
                .and_then(Value::as_str)
                .is_some_and(|text| !text.is_empty())
        };
        if truthy("seriesExternalId") != truthy("occurrenceDate") {
            ctx.add_issue("An override requires a series and occurrence date", &[]);
        }
        let instant = |key: &str| {
            event
                .get(key)
                .and_then(Value::as_str)
                .and_then(crate::instant::parse_js_date)
        };
        if let (Some(start), Some(end)) = (instant("start"), instant("end"))
            && end <= start
        {
            ctx.add_issue("End must follow start", &[]);
        }
        if let Some(rule) = event
            .get("recurrence")
            .and_then(Value::as_str)
            .filter(|rule| !rule.is_empty())
        {
            static RULE: LazyLock<Schema> = LazyLock::new(recurrence_rule_object_schema);
            let parsed = serde_json::from_str::<Value>(rule).ok();
            if parsed.is_none_or(|rule| RULE.parse(Some(&rule)).is_err()) {
                ctx.add_issue("Invalid recurrence rule", &[]);
            }
        }
    })
}

/// `encryptedIcsImportBodySchema`.
pub fn encrypted_ics_import_body_schema() -> Schema {
    zod::object([
        ("calendarId", zod::string().min(1)),
        (
            "encryptedEvents",
            zod::array(encrypted_ics_import_event_schema())
                .min(1)
                .max(100),
        ),
    ])
    .strict()
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
