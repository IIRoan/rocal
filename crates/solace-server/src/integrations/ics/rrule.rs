//! What node-ical runs of rrule-temporal for every RRULE: the rule parser, the constructor's checks (which fail the whole feed), and the options parse-ics reads.

use std::sync::LazyLock;

use jiff::civil::DateTime;
use jiff::tz::TimeZone;
use regex_lite::Regex;

use super::{js, zones};
use crate::http::zod::{is_js_whitespace, js_trim};

static DTSTART_LINE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)DTSTART(?:;VALUE=([^;]+))?(?:;TZID=([^:]+))?:(.+)")
        .unwrap_or_else(|error| panic!("dtstart pattern: {error}"))
});
static BYDAY_TOKEN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$")
        .unwrap_or_else(|error| panic!("byday pattern: {error}"))
});
static ISO_DATE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$")
        .unwrap_or_else(|error| panic!("date pattern: {error}"))
});
static LEAP_MONTH: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)^\d+L$").unwrap_or_else(|error| panic!("leap month pattern: {error}"))
});
static ISO_TIME: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(\d{2})(?:(\d{2})(\d{2})?|:(\d{2})(?::(\d{2}))?)?$")
        .unwrap_or_else(|error| panic!("time pattern: {error}"))
});

const FREQUENCIES: [&str; 7] = [
    "YEARLY", "MONTHLY", "WEEKLY", "DAILY", "HOURLY", "MINUTELY", "SECONDLY",
];
const WEEKDAYS: [&str; 7] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

/// `options()` of the constructed rule, as far as parse-ics reads it.
#[derive(Debug, Clone, PartialEq)]
pub struct Options {
    pub freq: String,
    /// `parseInt` output, so `NaN` is possible.
    pub interval: f64,
    pub count: Option<f64>,
    pub until_ms: Option<i64>,
    pub by_day: Option<Vec<String>>,
    /// `parseInt` of each value; parse-ics keeps the days 1–31.
    pub by_month_day: Option<Vec<f64>>,
    /// `parseInt` of each value but RFC 7529 leap months like `5L`, which stay strings; parse-ics keeps 1–12.
    pub by_month: Option<Vec<f64>>,
    pub tzid: String,
}

/// `new RRuleTemporal({ rruleString: "DTSTART;VALUE=DATE:<ymd>\nRRULE:<rule>" })`, node-ical's all-day form.
pub fn date_only(ymd: &str, rule: &str) -> Result<Options, String> {
    construct(&format!("DTSTART;VALUE=DATE:{ymd}\nRRULE:{rule}"), None)
}

/// `new RRuleTemporal({ rruleString: rule, dtstart })` with the start's Temporal zone id.
pub fn with_start(rule: &str, start_ms: i64, tzid: &str) -> Result<Options, String> {
    construct(rule, Some((start_ms, tzid)))
}

struct Parsed {
    tzid: String,
    freq: Option<String>,
    interval: Option<f64>,
    count: Option<f64>,
    until_ms: Option<i64>,
    by_day: Option<Vec<String>>,
    by_month_day: Option<Vec<f64>>,
    by_month: Option<Vec<f64>>,
    by_set_pos: Option<Vec<f64>>,
    wkst: Option<String>,
}

fn undefined_access(method: &str) -> String {
    format!("undefined is not an object (evaluating 'val.{method}')")
}

fn parse_int(text: &str) -> f64 {
    let trimmed = text.trim_start_matches(is_js_whitespace);
    let (sign, digits) = match trimmed.as_bytes().first() {
        Some(b'-') => (-1.0, &trimmed[1..]),
        Some(b'+') => (1.0, &trimmed[1..]),
        _ => (1.0, trimmed),
    };
    let end = digits
        .bytes()
        .position(|b| !b.is_ascii_digit())
        .unwrap_or(digits.len());
    if end == 0 {
        return f64::NAN;
    }
    sign * digits[..end].parse::<f64>().unwrap_or(f64::NAN)
}

fn parse_rule(input: &str, start: Option<(i64, &str)>) -> Result<Parsed, String> {
    let input = js_trim(input);
    let mut tzid = String::from("UTC");
    let mut dtstart_is_date = false;
    let mut dtstart_has_tzid = false;
    let mut dtstart_is_utc = false;
    let rule_line: Option<&str>;
    if input
        .get(..7)
        .is_some_and(|head| head.eq_ignore_ascii_case("DTSTART"))
    {
        let tokens: Vec<&str> = input
            .split(is_js_whitespace)
            .filter(|t| !t.is_empty())
            .collect();
        let line = tokens
            .iter()
            .find(|t| {
                t.get(..7)
                    .is_some_and(|h| h.eq_ignore_ascii_case("DTSTART"))
            })
            .copied()
            .unwrap_or_default();
        let captures = DTSTART_LINE
            .captures(line)
            .ok_or_else(|| "Invalid DTSTART in ICS snippet".to_owned())?;
        let value = captures.get(3).map_or("", |m| m.as_str());
        let value_type = captures
            .get(1)
            .map(|m| m.as_str().to_owned())
            .unwrap_or_else(|| {
                if value.contains('T') {
                    "DATE-TIME".into()
                } else {
                    "DATE".into()
                }
            });
        dtstart_is_date = value_type.eq_ignore_ascii_case("DATE");
        let dt_tzid = captures.get(2).map(|m| m.as_str());
        dtstart_has_tzid = dt_tzid.is_some();
        dtstart_is_utc = value.ends_with('Z');
        let (_, zone) = ics_date_time(value, dt_tzid.unwrap_or("UTC"), dtstart_is_date)?;
        tzid = dt_tzid.map_or(zone, str::to_owned);
        rule_line = tokens
            .iter()
            .find(|t| t.get(..6).is_some_and(|h| h.eq_ignore_ascii_case("RRULE:")))
            .copied();
    } else {
        rule_line = Some(input);
        if let Some((_, zone)) = start {
            tzid = zone.to_owned();
            dtstart_has_tzid = true;
            dtstart_is_utc = zone == "UTC";
        }
    }
    let mut parsed = Parsed {
        tzid,
        freq: None,
        interval: None,
        count: None,
        until_ms: None,
        by_day: None,
        by_month_day: None,
        by_month: None,
        by_set_pos: None,
        wkst: None,
    };
    let body = rule_line.map(|line| match line.get(..6) {
        Some(head) if head.eq_ignore_ascii_case("RRULE:") => &line[6..],
        _ => line,
    });
    let mut rscale = false;
    let mut pending_skip = false;
    for part in body
        .map(|b| b.split(';').collect::<Vec<_>>())
        .unwrap_or_default()
    {
        let mut pieces = part.split('=');
        let key = pieces.next().unwrap_or_default();
        let val = pieces.next();
        if key.is_empty() {
            continue;
        }
        match key.to_uppercase().as_str() {
            "RSCALE" => rscale |= val.is_some_and(|v| !v.is_empty()),
            "SKIP" => {
                let upper = val.unwrap_or_default().to_uppercase();
                if !["OMIT", "BACKWARD", "FORWARD"].contains(&upper.as_str()) {
                    return Err(format!(
                        "Invalid SKIP value: {}",
                        val.unwrap_or("undefined")
                    ));
                }
                pending_skip |= !rscale;
            }
            "FREQ" => {
                parsed.freq = Some(
                    val.ok_or_else(|| undefined_access("toUpperCase"))?
                        .to_uppercase(),
                );
            }
            "INTERVAL" => parsed.interval = Some(val.map_or(f64::NAN, parse_int)),
            "COUNT" => parsed.count = Some(val.map_or(f64::NAN, parse_int)),
            "UNTIL" => {
                let val = val.ok_or_else(|| undefined_access("includes"))?;
                parsed.until_ms = Some(until(
                    val,
                    &parsed.tzid,
                    dtstart_is_date,
                    dtstart_has_tzid || dtstart_is_utc,
                )?);
            }
            "BYHOUR" | "BYMINUTE" | "BYSECOND" | "BYYEARDAY" | "BYWEEKNO" => {
                val.ok_or_else(|| undefined_access("split"))?;
            }
            "BYMONTHDAY" => {
                let val = val.ok_or_else(|| undefined_access("split"))?;
                parsed.by_month_day = Some(val.split(',').map(parse_int).collect());
            }
            "BYMONTH" => {
                let val = val.ok_or_else(|| undefined_access("split"))?;
                parsed.by_month = Some(
                    val.split(',')
                        .map(js_trim)
                        .filter(|token| !LEAP_MONTH.is_match(token))
                        .map(parse_int)
                        .collect(),
                );
            }
            "BYDAY" => {
                let val = val.ok_or_else(|| undefined_access("split"))?;
                parsed.by_day = Some(val.split(',').map(str::to_uppercase).collect());
            }
            "BYSETPOS" => {
                let val = val.ok_or_else(|| undefined_access("split"))?;
                parsed.by_set_pos = Some(val.split(',').map(parse_int).collect());
            }
            "WKST" => parsed.wkst = val.map(str::to_uppercase),
            _ => {}
        }
    }
    if pending_skip && !rscale {
        return Err("SKIP MUST NOT be present unless RSCALE is present".into());
    }
    Ok(parsed)
}

/// UNTIL as rrule-temporal reads it: a date is the end of that day (or that date in an all-day rule), a time must be UTC.
fn until(val: &str, tzid: &str, date_only: bool, zoned: bool) -> Result<i64, String> {
    let has_time = val.contains('T');
    if date_only {
        if has_time {
            return Err("UNTIL rule part MUST have the same value type as DTSTART".into());
        }
        return ics_date_time(val, tzid, true).map(|(ms, _)| ms);
    }
    if !has_time {
        let date = iso_date(val);
        let (year, month, day) = plain_date(&date, &date)?;
        let tz = zones::lookup(tzid).ok_or_else(|| format!("invalid time zone: {tzid}"))?;
        let civil = DateTime::new(year, month, day, 23, 59, 59, 0).map_err(|e| e.to_string())?;
        return tz
            .to_ambiguous_timestamp(civil)
            .compatible()
            .map(|ts| ts.as_millisecond())
            .map_err(|e| e.to_string());
    }
    if zoned && !val.ends_with('Z') {
        return Err("UNTIL rule part MUST always be specified as a date with UTC time".into());
    }
    ics_date_time(val, tzid, false).map(|(ms, _)| ms)
}

fn slice(text: &str, from: usize, to: usize) -> &str {
    let to = to.min(text.len());
    text.get(from.min(to)..to).unwrap_or_default()
}

fn iso_date(value: &str) -> String {
    format!(
        "{}-{}-{}",
        slice(value, 0, 4),
        slice(value, 4, 6),
        slice(value, 6, 8)
    )
}

fn out_of_range(min: i64, value: i64, max: i64) -> String {
    format!("value out of range: {min} <= {value} <= {max}")
}

/// `Temporal.PlainDate.from("YYYY-MM-DD")` in @js-temporal/polyfill 0.5, the copy rrule-temporal bundles.
fn plain_date(iso: &str, source: &str) -> Result<(i16, i8, i8), String> {
    let captures = ISO_DATE
        .captures(iso)
        .ok_or_else(|| format!("invalid RFC 9557 string: {source}"))?;
    let field = |index: usize| captures[index].parse::<i64>().unwrap_or(0);
    let (year, month, day) = (field(1), field(2), field(3));
    let last = js::days_in_month(year, month);
    if day > last {
        return Err(out_of_range(1, day, last));
    }
    Ok((year as i16, month as i8, day as i8))
}

/// `HH`, `HHMM`, `HHMMSS` or their extended forms; second 60 is constrained to 59.
fn plain_time(time: &str, source: &str) -> Result<(i8, i8, i8), String> {
    let captures = ISO_TIME
        .captures(time)
        .ok_or_else(|| format!("invalid RFC 9557 string: {source}"))?;
    let field = |indexes: [usize; 2]| {
        indexes
            .iter()
            .find_map(|&index| captures.get(index))
            .map_or(0, |m| m.as_str().parse::<i64>().unwrap_or(0))
    };
    let (hour, minute, second) = (field([1, 1]), field([2, 4]), field([3, 5]));
    if hour > 23 {
        return Err(out_of_range(0, hour, 23));
    }
    if minute > 59 {
        return Err(out_of_range(0, minute, 59));
    }
    if second > 60 {
        return Err(out_of_range(0, second, 59));
    }
    Ok((hour as i8, minute as i8, second.min(59) as i8))
}

/// `parseIcsDateTime`: the instant and Temporal zone id of a DTSTART or UNTIL value.
fn ics_date_time(value: &str, tzid: &str, date_only: bool) -> Result<(i64, String), String> {
    let zone_id = zones::temporal_id(tzid).ok_or_else(|| format!("invalid time zone: {tzid}"))?;
    let tz: TimeZone = zones::lookup(tzid).ok_or_else(|| format!("invalid time zone: {tzid}"))?;
    let date = iso_date(value);
    if date_only || !value.contains('T') {
        let (year, month, day) = plain_date(&date, &date)?;
        let midnight = DateTime::new(year, month, day, 0, 0, 0, 0).map_err(|e| e.to_string())?;
        let start = tz
            .to_zoned(midnight)
            .and_then(|zoned| zoned.start_of_day())
            .map_err(|e| e.to_string())?;
        return Ok((start.timestamp().as_millisecond(), zone_id));
    }
    if let Some(stripped) = value.strip_suffix('Z') {
        let time = slice(stripped, 9, 15);
        let iso = format!("{date}T{time}Z");
        let (year, month, day) = plain_date(&date, &iso)?;
        let (hour, minute, second) = plain_time(time, &iso)?;
        let civil =
            DateTime::new(year, month, day, hour, minute, second, 0).map_err(|e| e.to_string())?;
        let ms = TimeZone::UTC
            .to_timestamp(civil)
            .map(|ts| ts.as_millisecond())
            .map_err(|e| e.to_string())?;
        return Ok((ms, zone_id));
    }
    let time = slice(value, 9, value.len());
    let iso = format!("{date}T{time}");
    let (year, month, day) = plain_date(&date, &iso)?;
    let (hour, minute, second) = plain_time(time, &iso)?;
    let civil =
        DateTime::new(year, month, day, hour, minute, second, 0).map_err(|e| e.to_string())?;
    let ms = tz
        .to_ambiguous_timestamp(civil)
        .compatible()
        .map_err(|e| e.to_string())?;
    Ok((ms.as_millisecond(), zone_id))
}

/// The constructor: parsing, then `sanitizeOpts`' checks in their order.
fn construct(input: &str, start: Option<(i64, &str)>) -> Result<Options, String> {
    let parsed = parse_rule(input, start)?;
    let freq = parsed
        .freq
        .filter(|freq| !freq.is_empty())
        .ok_or_else(|| "RRULE must include FREQ".to_owned())?;
    let interval = parsed.interval.unwrap_or(1.0);
    if interval <= 0.0 {
        return Err("Cannot create RRule: interval must be greater than 0".into());
    }
    if !FREQUENCIES.contains(&freq.as_str()) {
        return Err(format!("Invalid FREQ value: {freq}"));
    }
    let mut by_day = Vec::new();
    for day in parsed
        .by_day
        .unwrap_or_default()
        .into_iter()
        .filter(|d| !d.is_empty())
    {
        let token = day.to_uppercase();
        let Some(captures) = BYDAY_TOKEN.captures(&token) else {
            return Err(format!("Invalid BYDAY value: {day}"));
        };
        let ordinal = captures.get(1).map_or(0.0, |m| parse_int(m.as_str()));
        if ordinal == 0.0 && token.starts_with(|c: char| c.is_ascii_digit() || c == '+' || c == '-')
        {
            return Err(format!("Invalid BYDAY value: {day}"));
        }
        by_day.push(token);
    }
    if let Some(wkst) = parsed.wkst.filter(|w| !w.is_empty())
        && !WEEKDAYS.contains(&wkst.as_str())
    {
        return Err(format!("Invalid WKST value: {wkst}"));
    }
    if parsed
        .by_set_pos
        .is_some_and(|positions| positions.contains(&0.0))
    {
        return Err("bySetPos may not contain 0".into());
    }
    Ok(Options {
        freq,
        interval,
        count: parsed.count,
        until_ms: parsed.until_ms,
        by_day: (!by_day.is_empty()).then_some(by_day),
        by_month_day: parsed.by_month_day,
        by_month: parsed.by_month,
        tzid: parsed.tzid,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rules_parse_and_fail_like_rrule_temporal() {
        let weekly = with_start(
            "FREQ=WEEKLY;BYDAY=mo,1FR;UNTIL=20240301T000000Z",
            0,
            "Europe/Amsterdam",
        );
        assert_eq!(
            weekly,
            Ok(Options {
                freq: "WEEKLY".into(),
                interval: 1.0,
                count: None,
                until_ms: Some(1_709_251_200_000),
                by_day: Some(vec!["MO".into(), "1FR".into()]),
                by_month_day: None,
                by_month: None,
                tzid: "Europe/Amsterdam".into(),
            })
        );
        let monthly =
            with_start("FREQ=MONTHLY;BYMONTHDAY=15,-1;BYMONTH= 7,5L,2", 0, "UTC").unwrap();
        assert_eq!(
            (monthly.by_month_day, monthly.by_month),
            (Some(vec![15.0, -1.0]), Some(vec![7.0, 2.0]))
        );
        let yearly = date_only("20240101", "FREQ=YEARLY;COUNT=6;UNTIL=20290101");
        assert_eq!(
            yearly
                .as_ref()
                .map(|o| (o.tzid.as_str(), o.count, o.until_ms)),
            Ok(("UTC", Some(6.0), Some(1_861_920_000_000)))
        );
        assert_eq!(
            with_start("FREQ=FOO", 0, "UTC"),
            Err("Invalid FREQ value: FOO".into())
        );
        assert_eq!(
            with_start("COUNT=2", 0, "UTC"),
            Err("RRULE must include FREQ".into())
        );
        assert_eq!(
            with_start("FREQ=DAILY;INTERVAL=0", 0, "UTC"),
            Err("Cannot create RRule: interval must be greater than 0".into())
        );
        assert_eq!(
            with_start("FREQ=DAILY;BYDAY=XX", 0, "UTC"),
            Err("Invalid BYDAY value: XX".into())
        );
        assert_eq!(
            with_start("FREQ", 0, "UTC"),
            Err("undefined is not an object (evaluating 'val.toUpperCase')".into())
        );
        assert_eq!(
            with_start("FREQ=DAILY;UNTIL=20240101T100000", 0, "UTC"),
            Err("UNTIL rule part MUST always be specified as a date with UTC time".into())
        );
        assert_eq!(
            date_only("20240101", "FREQ=DAILY;UNTIL=20241301"),
            Err("invalid RFC 9557 string: 2024-13-01".into())
        );
        assert_eq!(
            with_start("FREQ=DAILY;INTERVAL=x", 0, "UTC").map(|o| o.interval.is_nan()),
            Ok(true)
        );
    }
}
