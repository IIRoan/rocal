//! Request-schema pieces shared across routes, one per schema in `route-schemas.ts`, `_schemas.ts` and `_zod.ts`.

use serde_json::Value;

use super::zod::{self, RefineCtx, Schema};
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
