//! The JavaScript `Date` rules node-ical relies on, over jiff's calendar, with the host time zone pinned to UTC as on Vercel.

use jiff::civil::{Date, DateTime};
use jiff::tz::TimeZone;
use jiff::{Span, Timestamp};

pub const MS_PER_DAY: i64 = 86_400_000;

/// `MakeDate(MakeDay(..), MakeTime(..))`: out-of-range fields roll over; instants beyond jiff's ±9999 years are `NaN`.
pub fn make_date(
    year: i64,
    month_index: i64,
    day: i64,
    hour: i64,
    minute: i64,
    second: i64,
    millisecond: i64,
) -> Option<i64> {
    let start = Date::new(i16::try_from(year).ok()?, 1, 1)
        .ok()?
        .at(0, 0, 0, 0);
    let time = Span::new()
        .try_hours(hour)
        .and_then(|span| span.try_minutes(minute))
        .and_then(|span| span.try_seconds(second))
        .and_then(|span| span.try_milliseconds(millisecond))
        .ok()?;
    // Spans carry one sign, and month 00 or day 00 step backwards, so each part is added on its own.
    let civil = start
        .checked_add(Span::new().try_months(month_index).ok()?)
        .and_then(|civil| civil.checked_add(Span::new().try_days(day - 1)?))
        .and_then(|civil| civil.checked_add(time))
        .ok()?;
    let instant = TimeZone::UTC.to_timestamp(civil).ok()?;
    Some(instant.as_millisecond())
}

/// `TimeClip`, bounded by the instants jiff represents.
pub fn clip(ms: i64) -> Option<i64> {
    Timestamp::from_millisecond(ms).ok().map(|_| ms)
}

/// `Date.UTC(...)` and, with the host in UTC, `new Date(y, m, d, ...)`: years 0-99 mean 1900-1999.
pub fn date_utc(
    year: i64,
    month_index: i64,
    day: i64,
    hour: i64,
    minute: i64,
    second: i64,
) -> Option<i64> {
    let year = if (0..=99).contains(&year) {
        1900 + year
    } else {
        year
    };
    make_date(year, month_index, day, hour, minute, second, 0)
}

/// The UTC (and host-local) fields of a time value.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Fields {
    pub year: i64,
    /// 1-12.
    pub month: i64,
    pub day: i64,
    pub hour: i64,
    pub minute: i64,
    pub second: i64,
    pub millisecond: i64,
}

/// The UTC wall time, saturating at jiff's bounds (time values come from [`make_date`] and [`clip`], so only arithmetic on their edge reaches them).
fn civil(ms: i64) -> DateTime {
    let instant = Timestamp::from_millisecond(ms).unwrap_or(if ms < 0 {
        Timestamp::MIN
    } else {
        Timestamp::MAX
    });
    TimeZone::UTC.to_datetime(instant)
}

pub fn fields(ms: i64) -> Fields {
    let civil = civil(ms);
    Fields {
        year: i64::from(civil.year()),
        month: i64::from(civil.month()),
        day: i64::from(civil.day()),
        hour: i64::from(civil.hour()),
        minute: i64::from(civil.minute()),
        second: i64::from(civil.second()),
        millisecond: i64::from(civil.millisecond()),
    }
}

/// `toISOString()`.
pub fn iso_string(ms: i64) -> String {
    civil(ms).strftime("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

/// `new Date(string)` for the ECMAScript date-time string format, which is narrower than jiff's ISO 8601 parser; other shapes are `NaN`.
pub fn parse_date_string(text: &str) -> Option<i64> {
    let bytes = text.as_bytes();
    let digits = |from: usize, len: usize| -> Option<i64> {
        let part = bytes.get(from..from + len)?;
        part.iter()
            .all(u8::is_ascii_digit)
            .then(|| part.iter().fold(0, |acc, b| acc * 10 + i64::from(b - b'0')))
    };
    let (year, mut at) = match bytes.first() {
        Some(b'+') => (digits(1, 6)?, 7),
        Some(b'-') => (-digits(1, 6)?, 7),
        _ => (digits(0, 4)?, 4),
    };
    let mut month = 1;
    let mut day = 1;
    if bytes.get(at) == Some(&b'-') {
        month = digits(at + 1, 2)?;
        at += 3;
        if bytes.get(at) == Some(&b'-') {
            day = digits(at + 1, 2)?;
            at += 3;
        }
    }
    let date_only = at == bytes.len();
    let (mut hour, mut minute, mut second, mut millisecond) = (0, 0, 0, 0);
    if !date_only {
        if bytes.get(at) != Some(&b'T') {
            return None;
        }
        hour = digits(at + 1, 2)?;
        if bytes.get(at + 3) != Some(&b':') {
            return None;
        }
        minute = digits(at + 4, 2)?;
        at += 6;
        if bytes.get(at) == Some(&b':') {
            second = digits(at + 1, 2)?;
            at += 3;
            if bytes.get(at) == Some(&b'.') {
                let start = at + 1;
                let end = bytes[start..]
                    .iter()
                    .position(|b| !b.is_ascii_digit())
                    .map_or(bytes.len(), |p| start + p);
                if end == start {
                    return None;
                }
                let fraction = &text[start..end.min(start + 3)];
                millisecond = format!("{fraction:0<3}").parse().ok()?;
                at = end;
            }
        }
    }
    let mut offset_minutes = 0;
    match &text[at..] {
        "" | "Z" => {}
        zone => {
            let sign = match zone.as_bytes()[0] {
                b'+' => 1,
                b'-' => -1,
                _ => return None,
            };
            let zone_bytes = zone.as_bytes();
            if zone.len() != 6 || zone_bytes[3] != b':' {
                return None;
            }
            let hours: i64 = zone[1..3].parse().ok()?;
            let minutes: i64 = zone[4..6].parse().ok()?;
            if hours > 23 || minutes > 59 {
                return None;
            }
            offset_minutes = sign * (hours * 60 + minutes);
        }
    }
    let valid = (1..=12).contains(&month)
        && (1..=31).contains(&day)
        && (hour < 24 || (hour == 24 && minute == 0 && second == 0 && millisecond == 0))
        && minute < 60
        && second < 60
        && day <= days_in_month(year, month);
    if !valid {
        return None;
    }
    let ms = make_date(year, month - 1, day, hour, minute, second, millisecond)?;
    clip(ms - offset_minutes * 60_000)
}

/// Days in a month; 0 for years jiff cannot represent.
pub fn days_in_month(year: i64, month: i64) -> i64 {
    let (Ok(year), Ok(month)) = (i16::try_from(year), i8::try_from(month)) else {
        return 0;
    };
    Date::new(year, month, 1).map_or(0, |date| i64::from(date.days_in_month()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dates_behave_like_javascript() {
        assert_eq!(iso_string(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(
            date_utc(2024, 12, 1, 0, 0, 0).map(iso_string).as_deref(),
            Some("2025-01-01T00:00:00.000Z")
        );
        assert_eq!(
            date_utc(2024, -1, 0, 25, 61, 61).map(iso_string).as_deref(),
            Some("2023-12-01T02:02:01.000Z")
        );
        assert_eq!(
            date_utc(1, 0, 1, 0, 0, 0).map(iso_string).as_deref(),
            Some("1901-01-01T00:00:00.000Z")
        );
        assert_eq!(
            make_date(1, 0, 1, 0, 0, 0, 0).map(iso_string).as_deref(),
            Some("0001-01-01T00:00:00.000Z")
        );
        assert_eq!(iso_string(-1), "1969-12-31T23:59:59.999Z");
        assert_eq!(
            parse_date_string("2024-02-01").map(iso_string).as_deref(),
            Some("2024-02-01T00:00:00.000Z")
        );
        assert_eq!(
            parse_date_string("2024-02-01T10:30:00.5+01:00")
                .map(iso_string)
                .as_deref(),
            Some("2024-02-01T09:30:00.500Z")
        );
        assert_eq!(parse_date_string("20240201T103000"), None);
        assert_eq!(parse_date_string("2024-02-30"), None);
        assert_eq!(fields(-1).millisecond, 999);
        assert_eq!((days_in_month(2024, 2), days_in_month(2023, 2)), (29, 28));
    }
}
