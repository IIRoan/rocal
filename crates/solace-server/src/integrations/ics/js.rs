//! The JavaScript `Date` semantics node-ical relies on, with the host time zone pinned to UTC as on Vercel.

pub const MS_PER_DAY: i64 = 86_400_000;
/// `Date` values are clipped to ±8.64e15 ms.
const MAX_TIME: i64 = 8_640_000_000_000_000;

/// Days since 1970-01-01 of a proleptic Gregorian date (month 1-12).
pub fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = year.div_euclid(400);
    let year_of_era = year - era * 400;
    let month_index = (month + 9) % 12;
    let day_of_year = (153 * month_index + 2) / 5 + day - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era * 146_097 + day_of_era - 719_468
}

fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let days = days + 719_468;
    let era = days.div_euclid(146_097);
    let day_of_era = days - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_index = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_index + 2) / 5 + 1;
    let month = if month_index < 10 {
        month_index + 3
    } else {
        month_index - 9
    };
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

/// `MakeDate(MakeDay(..), MakeTime(..))` with `TimeClip`: out-of-range fields roll over, out-of-range results are `NaN`.
pub fn make_date(
    year: i64,
    month_index: i64,
    day: i64,
    hour: i64,
    minute: i64,
    second: i64,
    millisecond: i64,
) -> Option<i64> {
    let year = year.checked_add(month_index.div_euclid(12))?;
    let month = month_index.rem_euclid(12) + 1;
    let days = days_from_civil(year, month, 1).checked_add(day - 1)?;
    let time = hour * 3_600_000 + minute * 60_000 + second * 1000 + millisecond;
    clip(days.checked_mul(MS_PER_DAY)?.checked_add(time)?)
}

pub fn clip(ms: i64) -> Option<i64> {
    (ms.abs() <= MAX_TIME).then_some(ms)
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

pub fn fields(ms: i64) -> Fields {
    let days = ms.div_euclid(MS_PER_DAY);
    let time = ms.rem_euclid(MS_PER_DAY);
    let (year, month, day) = civil_from_days(days);
    Fields {
        year,
        month,
        day,
        hour: time / 3_600_000,
        minute: time / 60_000 % 60,
        second: time / 1000 % 60,
        millisecond: time % 1000,
    }
}

/// `toISOString()`, including the six-digit years JavaScript writes outside 0000-9999.
pub fn iso_string(ms: i64) -> String {
    let f = fields(ms);
    let year = if (0..=9999).contains(&f.year) {
        format!("{:04}", f.year)
    } else if f.year < 0 {
        format!("-{:06}", -f.year)
    } else {
        format!("+{:06}", f.year)
    };
    format!(
        "{year}-{:02}-{:02}T{:02}:{:02}:{:02}.{:03}Z",
        f.month, f.day, f.hour, f.minute, f.second, f.millisecond
    )
}

/// `new Date(string)` for the ECMAScript date-time string format; other shapes are `NaN`.
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

pub fn days_in_month(year: i64, month: i64) -> i64 {
    days_from_civil(year + i64::from(month == 12), month % 12 + 1, 1)
        - days_from_civil(year, month, 1)
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
    }
}
