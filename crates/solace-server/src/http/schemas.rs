//! Request-schema pieces shared across routes, one per schema in `route-schemas.ts`, `_schemas.ts` and `_zod.ts`.

use std::sync::LazyLock;

use regex_lite::Regex;

use super::zod::{self, Schema};

/// Offset zones `Intl.DateTimeFormat` accepts: `±HH`, `±HHMM`, `±HH:MM`.
static UTC_OFFSET: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[+-](?:[01][0-9]|2[0-3])(?::?[0-5][0-9])?$")
        .unwrap_or_else(|error| panic!("offset pattern: {error}"))
});

/// What `Intl.DateTimeFormat(undefined, { timeZone })` accepts in Bun: IANA names in any case, or a UTC offset.
pub fn is_valid_timezone(value: &str) -> bool {
    // jiff also knows `Factory` and `Etc/Unknown`, which JavaScriptCore refuses.
    UTC_OFFSET.is_match(value)
        || (!value.eq_ignore_ascii_case("factory")
            && !value.eq_ignore_ascii_case("etc/unknown")
            && jiff::tz::db().get(value).is_ok())
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
