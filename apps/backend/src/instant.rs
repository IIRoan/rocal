//! UTC instants as the schema stores them (`TIMESTAMP(3)` without time zone) and as `toISOString()` writes them.

use solace_api_types::Timestamp;
use time::macros::format_description;
use time::{Duration, OffsetDateTime, PrimitiveDateTime};

/// Now in UTC, truncated to the millisecond like a JavaScript `Date`.
pub fn now() -> PrimitiveDateTime {
    let now = OffsetDateTime::now_utc();
    let millis = now.millisecond();
    let now = now
        .replace_nanosecond(u32::from(millis) * 1_000_000)
        .unwrap_or(now);
    PrimitiveDateTime::new(now.date(), now.time())
}

/// `2026-10-14T16:29:30.535Z`.
pub fn iso(value: PrimitiveDateTime) -> Timestamp {
    let format =
        format_description!("[year]-[month]-[day]T[hour]:[minute]:[second].[subsecond digits:3]Z");
    Timestamp(value.format(&format).unwrap_or_default())
}

pub fn seconds(seconds: i64) -> Duration {
    Duration::seconds(seconds)
}

/// Epoch milliseconds, the unit of JavaScript `Date` arithmetic.
pub fn unix_millis(value: PrimitiveDateTime) -> i64 {
    let at = value.assume_utc();
    at.unix_timestamp() * 1000 + i64::from(at.millisecond())
}

/// Back from epoch milliseconds; `None` outside the range a timestamp column holds.
pub fn from_unix_millis(millis: i64) -> Option<PrimitiveDateTime> {
    let at = OffsetDateTime::from_unix_timestamp_nanos(i128::from(millis) * 1_000_000).ok()?;
    Some(PrimitiveDateTime::new(at.date(), at.time()))
}

/// JavaScript keeps three fraction digits and drops the rest, so `.1234567890` is 123 ms and `.9999` before 1970 is -1 ms.
fn milliseconds_only(text: &str) -> std::borrow::Cow<'_, str> {
    let Some(dot) = text.find('.') else {
        return text.into();
    };
    let digits = text[dot + 1..]
        .bytes()
        .take_while(u8::is_ascii_digit)
        .count();
    if digits <= 3 {
        return text.into();
    }
    format!("{}{}", &text[..dot + 4], &text[dot + 1 + digits..]).into()
}

/// `new Date(text)` for the forms clients send: ISO 8601 (a date-time without offset is UTC, the servers' zone) and RFC 2822.
pub fn parse_js_date(text: &str) -> Option<i64> {
    let text = milliseconds_only(text.trim());
    let text = text.as_ref();
    if let Ok(timestamp) = text.parse::<jiff::Timestamp>() {
        return Some(timestamp.as_millisecond());
    }
    let utc = |datetime: jiff::civil::DateTime| {
        datetime
            .to_zoned(jiff::tz::TimeZone::UTC)
            .ok()
            .map(|zoned| zoned.timestamp().as_millisecond())
    };
    if let Ok(datetime) = text.parse::<jiff::civil::DateTime>() {
        return utc(datetime);
    }
    if let Ok(date) = text.parse::<jiff::civil::Date>() {
        return utc(date.to_datetime(jiff::civil::Time::midnight()));
    }
    jiff::fmt::rfc2822::parse(text)
        .ok()
        .map(|zoned| zoned.timestamp().as_millisecond())
}

/// `±HH`, `±HHMM` or `±HH:MM`, the offset zones `Intl.DateTimeFormat` accepts.
fn utc_offset(name: &str) -> Option<jiff::tz::Offset> {
    let sign = match name.as_bytes().first()? {
        b'+' => 1,
        b'-' => -1,
        _ => return None,
    };
    let digits = name.get(1..).filter(|digits| digits.is_ascii())?;
    let (hours, minutes) = match digits.len() {
        2 => (digits, "00"),
        4 => (&digits[..2], &digits[2..]),
        5 if digits.as_bytes().get(2) == Some(&b':') => (&digits[..2], &digits[3..]),
        _ => return None,
    };
    if !hours
        .bytes()
        .chain(minutes.bytes())
        .all(|b| b.is_ascii_digit())
    {
        return None;
    }
    let (hours, minutes): (i32, i32) = (hours.parse().ok()?, minutes.parse().ok()?);
    if hours > 23 || minutes > 59 {
        return None;
    }
    jiff::tz::Offset::from_seconds(sign * (hours * 3600 + minutes * 60)).ok()
}

/// A `timeZone` as Bun's `Intl` reads it: an IANA name in any case, or a UTC offset.
pub fn time_zone(name: &str) -> Option<jiff::tz::TimeZone> {
    if let Some(offset) = utc_offset(name) {
        return Some(jiff::tz::TimeZone::fixed(offset));
    }
    // jiff also knows `Factory` and `Etc/Unknown`, which JavaScriptCore refuses.
    if name.eq_ignore_ascii_case("factory") || name.eq_ignore_ascii_case("etc/unknown") {
        return None;
    }
    // tzdata dropped this alias in 2020b; ICU, and so Bun, still reads it as Los Angeles time.
    if name.eq_ignore_ascii_case("us/pacific-new") {
        return jiff::tz::db().get("America/Los_Angeles").ok();
    }
    jiff::tz::db().get(name).ok()
}

/// `resolveTimezone`: the trimmed zone, or the calendar default when it is blank.
pub fn resolve_timezone(timezone: Option<&str>) -> String {
    match timezone
        .map(crate::http::zod::js_trim)
        .filter(|zone| !zone.is_empty())
    {
        Some(zone) => zone.to_owned(),
        None => DEFAULT_TIMEZONE.to_owned(),
    }
}

pub const DEFAULT_TIMEZONE: &str = "Europe/Amsterdam";

/// Epoch seconds, as cookie payloads carry them.
pub fn unix_seconds(value: PrimitiveDateTime) -> i64 {
    value.assume_utc().unix_timestamp()
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::datetime;

    #[test]
    fn time_zones_are_trimmed_like_javascript() {
        assert_eq!(
            resolve_timezone(Some("\u{feff} Europe/Berlin ")),
            "Europe/Berlin"
        );
        assert_eq!(resolve_timezone(Some("\u{0085}")), "\u{0085}");
        assert_eq!(resolve_timezone(Some(" \t")), DEFAULT_TIMEZONE);
        assert_eq!(resolve_timezone(None), DEFAULT_TIMEZONE);
    }

    #[test]
    fn dates_keep_three_fraction_digits_like_javascript() {
        assert_eq!(
            parse_js_date("2026-01-01T00:00:00.1234567890Z"),
            Some(1_767_225_600_123)
        );
        assert_eq!(parse_js_date("1969-12-31T23:59:59.9999Z"), Some(-1));
        assert_eq!(parse_js_date("1969-12-31T23:59:59.9991Z"), Some(-1));
        assert_eq!(
            parse_js_date("2026-01-01T00:00:00.5Z"),
            Some(1_767_225_600_500)
        );
    }

    #[test]
    fn the_pacific_new_alias_is_los_angeles() {
        let alias =
            time_zone("US/Pacific-New").map(|zone| zone.to_offset(jiff::Timestamp::UNIX_EPOCH));
        let la = time_zone("America/Los_Angeles")
            .map(|zone| zone.to_offset(jiff::Timestamp::UNIX_EPOCH));
        assert!(alias.is_some());
        assert_eq!(alias, la);
    }

    #[test]
    fn offset_zones_refuse_non_ascii_digits() {
        assert!(time_zone("+💚").is_none());
        assert!(time_zone("+0é0").is_none());
        assert_eq!(
            time_zone("+05:30").map(|zone| zone.to_offset(jiff::Timestamp::UNIX_EPOCH)),
            jiff::tz::Offset::from_seconds(19_800).ok()
        );
    }

    #[test]
    fn instants_render_like_to_iso_string() {
        assert_eq!(
            iso(datetime!(2026-01-02 03:04:05.006)).0,
            "2026-01-02T03:04:05.006Z"
        );
        assert_eq!(
            iso(datetime!(2026-01-02 03:04:05)).0,
            "2026-01-02T03:04:05.000Z"
        );
        assert_eq!(now().nanosecond() % 1_000_000, 0);
    }
}
