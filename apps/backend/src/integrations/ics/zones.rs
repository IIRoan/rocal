//! node-ical's `tz-utils`: TZIDs as IANA names, Windows labels or UTC offsets, answered from jiff's bundled tzdb the way Bun's `Intl` answers.

use std::collections::HashMap;
use std::sync::LazyLock;

use jiff::Timestamp;
use jiff::civil::DateTime;
use jiff::tz::{Offset, TimeZone};
use regex_lite::Regex;

use super::{js, pattern};
use crate::http::zod::{is_js_whitespace, js_trim};

/// Bun 1.4's `Intl.supportedValuesOf('timeZone')`, in its order: VTIMEZONE rules resolve to the first zone that fits.
const BUN_TIME_ZONES: &str = include_str!("bun_time_zones.txt");

/// Windows zone ids and display labels to IANA, shared with the on-device import: node-ical 0.26.1's table from CLDR windowsZones.xml, plus CLDR's ids up to c4bb2c19 (2026-10-09).
const WINDOWS_ZONES: &str =
    include_str!("../../../../../packages/calendar-ics/src/windows-zones.json");

static OFFSET_LABEL: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^([+\-])(\d{1,2})(?::?(\d{2}))?$"));
static OFFSET_PREFIX: LazyLock<Regex> = LazyLock::new(|| pattern(r"(?i)^\(?(?:utc|gmt)\)?"));
static PAREN_OFFSET: LazyLock<Regex> = LazyLock::new(|| pattern(r"([+\-]\d{1,2}:\d{2})"));
static INTL_OFFSET: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^([+\-])([01]\d|2[0-3])(?::?([0-5]\d))?$"));
static EXTENDED_DATE_TIME: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$"));
static BASIC_DATE_TIME: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?$"));

struct WindowsZones {
    exact: HashMap<String, String>,
    index: HashMap<String, String>,
}

static WINDOWS: LazyLock<WindowsZones> = LazyLock::new(|| {
    let source: serde_json::Map<String, serde_json::Value> = serde_json::from_str(WINDOWS_ZONES)
        .unwrap_or_else(|error| panic!("windows-zones.json: {error}"));
    let mut zones = WindowsZones {
        exact: HashMap::new(),
        index: HashMap::new(),
    };
    for (label, data) in source {
        let Some(iana) = data["iana"][0].as_str() else {
            continue;
        };
        let mut add_variant = |variant: &str| {
            let normalized = normalize_windows_label(variant);
            if !normalized.is_empty() {
                zones
                    .index
                    .entry(normalized)
                    .or_insert_with(|| iana.to_owned());
            }
        };
        add_variant(&label);
        let without_offset = strip_offset_prefix(strip_offset_prefix(&label, "(utc"), "(gmt");
        if without_offset != label {
            add_variant(without_offset);
            if without_offset.contains(',') {
                without_offset.split(',').for_each(&mut add_variant);
            }
        }
        zones.exact.insert(label, iana.to_owned());
    }
    zones
});

/// `/^\(utc[^)]*\)\s*/i`.
fn strip_offset_prefix<'a>(label: &'a str, head: &str) -> &'a str {
    let starts = label
        .get(..head.len())
        .is_some_and(|start| start.eq_ignore_ascii_case(head));
    match label.find(')') {
        Some(close) if starts => label[close + 1..].trim_start_matches(is_js_whitespace),
        _ => label,
    }
}

fn normalize_windows_label(label: &str) -> String {
    label
        .split(is_js_whitespace)
        .filter(|word| !word.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

/// A Windows name or "(UTC±hh:mm) City" label as the tz database zone CLDR maps it to.
pub fn windows_zone(label: &str) -> Option<String> {
    map_windows_zone(label).filter(|zone| is_named_zone(zone))
}

fn map_windows_zone(label: &str) -> Option<String> {
    let zones = &*WINDOWS;
    zones
        .exact
        .get(label)
        .or_else(|| zones.index.get(&normalize_windows_label(label)))
        .or_else(|| {
            label
                .split(',')
                .find_map(|segment| zones.index.get(&normalize_windows_label(segment)))
        })
        .cloned()
}

/// `"+05:30"`, `"UTC-4"` and `"(UTC+02:00)"` as signed minutes, within ±14:00.
pub fn offset_label_to_minutes(offset: &str) -> Option<i64> {
    let trimmed = js_trim(offset);
    let trimmed = match OFFSET_PREFIX.find(trimmed) {
        Some(prefix) => &trimmed[prefix.end()..],
        None => trimmed,
    };
    let trimmed = js_trim(trimmed.strip_suffix(')').unwrap_or(trimmed));
    let captures = OFFSET_LABEL.captures(trimmed)?;
    let hours: i64 = captures[2].parse().ok()?;
    let minutes: i64 = captures
        .get(3)
        .map_or(Some(0), |m| m.as_str().parse().ok())?;
    if minutes >= 60 || hours > 14 || (hours == 14 && minutes != 0) {
        return None;
    }
    let total = hours * 60 + minutes;
    Some(if &captures[1] == "-" { -total } else { total })
}

pub fn minutes_to_offset(total: i64) -> String {
    let sign = if total < 0 { '-' } else { '+' };
    let absolute = total.abs();
    format!("{sign}{:02}:{:02}", absolute / 60, absolute % 60)
}

fn minutes_to_etc_zone(total: i64) -> Option<String> {
    if total == 0 {
        return Some("Etc/GMT".into());
    }
    if total % 60 != 0 {
        return None;
    }
    let sign = if total > 0 { '-' } else { '+' };
    Some(format!("Etc/GMT{sign}{}", total.abs() / 60))
}

/// A zone `Intl` accepts: an IANA name in any case, or a `±HH[:MM]` offset.
pub fn lookup(zone: &str) -> Option<TimeZone> {
    if let Some(captures) = INTL_OFFSET.captures(zone) {
        let hours: i32 = captures[2].parse().ok()?;
        let minutes: i32 = captures
            .get(3)
            .map_or(Some(0), |m| m.as_str().parse().ok())?;
        let seconds = (hours * 3600 + minutes * 60) * if &captures[1] == "-" { -1 } else { 1 };
        return Offset::from_seconds(seconds).ok().map(TimeZone::fixed);
    }
    jiff::tz::db().get(zone).ok().filter(|tz| !tz.is_unknown())
}

/// A zone of the tz database (any case), not a bare offset.
pub fn is_named_zone(zone: &str) -> bool {
    lookup(zone).is_some_and(|tz| tz.iana_name().is_some())
}

/// A label as a tz database zone: an IANA name as written, a Windows name or "(UTC±hh:mm) City" label through CLDR's table, a whole-hour offset as `Etc/GMT±N`.
pub fn iana_zone(label: &str) -> Option<String> {
    let label = js_trim(label);
    if label.is_empty() {
        return None;
    }
    if is_named_zone(label) {
        return Some(label.to_owned());
    }
    let info = resolve_tzid(label);
    info.iana.filter(|iana| is_named_zone(iana)).or(info.etc)
}

pub fn is_valid_iana(zone: &str) -> bool {
    !zone.is_empty() && lookup(zone).is_some()
}

/// Temporal's `timeZoneId` for a zone `Intl` accepts: IANA names case-normalized, offsets as `±HH:MM`.
pub fn temporal_id(zone: &str) -> Option<String> {
    let tz = lookup(zone)?;
    Some(match tz.iana_name() {
        Some(name) => name.to_owned(),
        None => minutes_to_offset(i64::from(tz.to_offset(Timestamp::UNIX_EPOCH).seconds()) / 60),
    })
}

/// The host zone, which is UTC on Vercel.
pub const LOCAL_ZONE: &str = "UTC";

/// `resolveTZID`'s answer for a TZID value.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TzInfo {
    pub original: Option<String>,
    pub iana: Option<String>,
    pub offset: Option<String>,
    pub offset_minutes: Option<i64>,
    pub etc: Option<String>,
}

/// Strips one pair of surrounding quotes, as `/^"(.*)"$/` does.
pub fn strip_quotes(value: &str) -> &str {
    match value
        .strip_prefix('"')
        .and_then(|rest| rest.strip_suffix('"'))
    {
        Some(inner) if !inner.contains(['\n', '\r', '\u{2028}', '\u{2029}']) => inner,
        _ => value,
    }
}

pub fn resolve_tzid(value: &str) -> TzInfo {
    if value.is_empty() {
        return TzInfo::default();
    }
    let custom = value == "tzone://Microsoft/Custom"
        || value.starts_with("Customized Time Zone")
        || value.starts_with("tzone://Microsoft/");
    let original = strip_quotes(if custom { LOCAL_ZONE } else { value }).to_owned();
    let mut tz = Some(original.clone());
    if original.contains([' ', ','])
        && let Some(mapped) = map_windows_zone(&original)
    {
        tz = Some(mapped);
    }
    let mut offset_minutes = None;
    if let Some(current) = tz.clone() {
        if current.starts_with('(') {
            offset_minutes = PAREN_OFFSET
                .captures(&current)
                .and_then(|c| offset_label_to_minutes(&c[1]));
            tz = None;
        } else if let Some(minutes) = offset_label_to_minutes(&current) {
            offset_minutes = Some(minutes);
            tz = None;
        }
    }
    TzInfo {
        original: Some(original),
        iana: tz.filter(|zone| is_valid_iana(zone)),
        offset: offset_minutes.map(minutes_to_offset),
        offset_minutes,
        etc: offset_minutes.and_then(minutes_to_etc_zone),
    }
}

struct WallClock {
    year: i64,
    month: i64,
    day: i64,
    hour: i64,
    minute: i64,
    second: i64,
}

fn wall_clock(value: &str) -> Option<WallClock> {
    let captures = EXTENDED_DATE_TIME
        .captures(value)
        .or_else(|| BASIC_DATE_TIME.captures(value))?;
    let number = |index: usize| {
        captures
            .get(index)
            .map_or(Some(0), |m| m.as_str().parse::<i64>().ok())
    };
    Some(WallClock {
        year: number(1)?,
        month: number(2)?,
        day: number(3)?,
        hour: number(4)?,
        minute: number(5)?,
        second: number(6)?,
    })
}

/// `parseDateTimeInZone`: the wall time in `zone` (fields constrained as Temporal does), later instant in a fold.
pub fn parse_date_time_in_zone(value: &str, zone: &str) -> Option<i64> {
    let wall = wall_clock(value)?;
    let tz = lookup(zone)?;
    let month = wall.month.clamp(1, 12);
    let day = wall.day.clamp(1, js::days_in_month(wall.year, month));
    let civil = DateTime::new(
        i16::try_from(wall.year).ok()?,
        i8::try_from(month).ok()?,
        i8::try_from(day).ok()?,
        i8::try_from(wall.hour.clamp(0, 23)).ok()?,
        i8::try_from(wall.minute.clamp(0, 59)).ok()?,
        i8::try_from(wall.second.clamp(0, 59)).ok()?,
        0,
    )
    .ok()?;
    let instant = tz.to_ambiguous_timestamp(civil).later().ok()?;
    Some(instant.as_millisecond())
}

/// `parseWithOffset`: the wall time at a fixed offset, with `Date.UTC`'s rollover.
pub fn parse_with_offset(value: &str, offset: &str) -> Result<Option<i64>, String> {
    let Some(wall) = wall_clock(value) else {
        return Ok(None);
    };
    let Some(minutes) = offset_label_to_minutes(offset) else {
        return Err(format!("Invalid offset string: {offset}"));
    };
    Ok(js::date_utc(
        wall.year,
        wall.month - 1,
        wall.day,
        wall.hour,
        wall.minute,
        wall.second,
    )
    .and_then(|utc| js::clip(utc - minutes * 60_000)))
}

/// The offset of `zone` at `ms`, in milliseconds.
pub fn offset_ms(zone: &TimeZone, ms: i64) -> Option<i64> {
    let instant = Timestamp::from_millisecond(ms).ok()?;
    Some(i64::from(zone.to_offset(instant).seconds()) * 1000)
}

/// The calendar date of `ms` in `zone`, as Temporal's `PlainDate.toString()` writes it.
pub fn plain_date_in(zone: &TimeZone, ms: i64) -> Option<String> {
    let (year, month, day) = date_in(zone, ms)?;
    let year = if (0..=9999).contains(&year) {
        format!("{year:04}")
    } else {
        format!("{}{:06}", if year < 0 { '-' } else { '+' }, year.abs())
    };
    Some(format!("{year}-{month:02}-{day:02}"))
}

/// The calendar date of `ms` in `zone`.
pub fn date_in(zone: &TimeZone, ms: i64) -> Option<(i64, i8, i8)> {
    let date = Timestamp::from_millisecond(ms)
        .ok()?
        .to_zoned(zone.clone())
        .date();
    Some((i64::from(date.year()), date.month(), date.day()))
}

/// The first zone in Bun's list whose mid-January and mid-July offsets are exactly the two given ones.
pub fn zone_with_offsets(standard: i64, daylight: i64, year: i64) -> Option<&'static str> {
    let probe_year = i16::try_from(year.max(1970)).ok()?;
    let probe = |month| {
        DateTime::new(probe_year, month, 15, 12, 0, 0, 0)
            .ok()
            .and_then(|dt| TimeZone::UTC.to_timestamp(dt).ok())
    };
    let (january, july) = (probe(1)?, probe(7)?);
    BUN_TIME_ZONES.lines().find(|name| {
        let Some(tz) = lookup(name) else {
            return false;
        };
        let jan = i64::from(tz.to_offset(january).seconds());
        let jul = i64::from(tz.to_offset(july).seconds());
        let matches = |seconds: i64| seconds == standard * 60 || seconds == daylight * 60;
        matches(jan) && matches(jul) && jan != jul
    })
}

/// `resolveVTimezoneToIana` once the applicable STANDARD and DAYLIGHT offsets are known: `(iana, offset)`.
pub fn vtimezone_zone(
    standard_minutes: Option<i64>,
    daylight_minutes: Option<i64>,
    year: i64,
) -> (Option<String>, Option<String>) {
    let Some(standard) = standard_minutes else {
        return (None, None);
    };
    let standard_offset = minutes_to_offset(standard);
    let Some(daylight) = daylight_minutes else {
        return (minutes_to_etc_zone(standard), Some(standard_offset));
    };
    match zone_with_offsets(standard, daylight, year) {
        Some(zone) => (Some(zone.to_owned()), Some(standard_offset)),
        None => (None, None),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tzids_resolve_like_node_ical() {
        let bangkok = resolve_tzid("(UTC+07:00) Bangkok, Hanoi, Jakarta");
        assert_eq!(bangkok.iana.as_deref(), Some("Asia/Bangkok"));
        assert_eq!(
            bangkok.original.as_deref(),
            Some("(UTC+07:00) Bangkok, Hanoi, Jakarta")
        );
        let unknown_label = resolve_tzid("(UTC+01:00) Somewhere");
        assert_eq!(
            (unknown_label.iana, unknown_label.offset.as_deref()),
            (None, Some("+01:00"))
        );
        assert_eq!(
            resolve_tzid("W. Europe Standard Time").iana.as_deref(),
            Some("Europe/Berlin")
        );
        assert_eq!(resolve_tzid("GMT-4").offset.as_deref(), Some("-04:00"));
        assert_eq!(resolve_tzid("+0530").offset_minutes, Some(330));
        assert_eq!(
            resolve_tzid("europe/amsterdam").iana.as_deref(),
            Some("europe/amsterdam")
        );
        assert_eq!(
            temporal_id("europe/amsterdam").as_deref(),
            Some("Europe/Amsterdam")
        );
        assert_eq!(
            resolve_tzid("Customized Time Zone").iana.as_deref(),
            Some("UTC")
        );
        assert_eq!(resolve_tzid("Foo/Bar").iana, None);
        assert_eq!(temporal_id("+0100").as_deref(), Some("+01:00"));
    }

    #[test]
    fn labels_become_tz_database_zones() {
        assert_eq!(
            iana_zone("Romance Standard Time").as_deref(),
            Some("Europe/Paris")
        );
        assert_eq!(
            iana_zone("Manitoba Standard Time").as_deref(),
            Some("America/Winnipeg"),
            "CLDR's newer ids are in the table"
        );
        assert_eq!(
            iana_zone("(UTC+01:00) Brussels, Copenhagen, Madrid, Paris").as_deref(),
            Some("Europe/Paris")
        );
        assert_eq!(iana_zone("UTC+11").as_deref(), Some("Etc/GMT-11"));
        assert_eq!(iana_zone("(UTC+05:45) Somewhere new"), None);
        assert_eq!(iana_zone("custom_Pacific/Fiji"), None);
    }

    #[test]
    fn vtimezone_offsets_match_the_first_zone_in_bun_order() {
        assert_eq!(zone_with_offsets(60, 120, 2025), Some("Africa/Ceuta"));
        assert_eq!(zone_with_offsets(-300, -240, 2025), Some("America/Detroit"));
        assert_eq!(
            vtimezone_zone(Some(420), None, 2019),
            (Some("Etc/GMT-7".into()), Some("+07:00".into()))
        );
    }

    #[test]
    fn wall_times_resolve_in_zones() {
        let amsterdam = parse_date_time_in_zone("20240331T023000", "Europe/Amsterdam");
        assert_eq!(
            amsterdam.map(js::iso_string).as_deref(),
            Some("2024-03-31T01:30:00.000Z")
        );
        let clamped = parse_date_time_in_zone("20241399T250000", "UTC");
        assert_eq!(
            clamped.map(js::iso_string).as_deref(),
            Some("2024-12-31T23:00:00.000Z")
        );
        assert_eq!(
            parse_with_offset("20240101T100000", "+01:00")
                .ok()
                .flatten()
                .map(js::iso_string)
                .as_deref(),
            Some("2024-01-01T09:00:00.000Z")
        );
    }
}
