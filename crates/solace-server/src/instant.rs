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

/// Epoch seconds, as cookie payloads carry them.
pub fn unix_seconds(value: PrimitiveDateTime) -> i64 {
    value.assume_utc().unix_timestamp()
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::datetime;

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
