//! `RecurrenceEngine` from `calendar-ics/src/recurrence.ts`: the stored JSON rule and its instances, with JavaScript `Date` arithmetic on epoch milliseconds.

use serde_json::Value;

const MS_PER_DAY: f64 = 86_400_000.0;
const MAX_ITERATIONS: usize = 1000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Frequency {
    Daily,
    Weekly,
    Monthly,
    Yearly,
}

impl Frequency {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Daily => "daily",
            Self::Weekly => "weekly",
            Self::Monthly => "monthly",
            Self::Yearly => "yearly",
        }
    }
}

/// A parsed rule; numbers stay `f64` because the stored JSON is read the way JavaScript reads it.
#[derive(Debug, Clone, PartialEq)]
pub struct Rule {
    pub frequency: Frequency,
    pub interval: f64,
    pub count: Option<f64>,
    /// Epoch milliseconds; `NaN` for an unparseable date, as `new Date(rule.until)` gives.
    pub until: Option<f64>,
    pub timezone: Option<String>,
    pub by_week_day: Option<Vec<f64>>,
    pub by_month_day: Option<Vec<f64>>,
    pub by_month: Option<Vec<f64>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExceptionType {
    Modified,
    Deleted,
}

#[derive(Debug, Clone, Copy)]
pub struct Exception {
    pub date_ms: i64,
    pub kind: ExceptionType,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Instance {
    pub date_ms: i64,
    pub is_original: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum RecurrenceError {
    #[error("invalid time zone")]
    TimeZone,
    #[error("invalid date")]
    InvalidDate,
}

/// JavaScript truthiness for the JSON values a rule holds.
fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().is_some_and(|n| n != 0.0 && !n.is_nan()),
        Value::String(s) => !s.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

/// `Number(value)` for the values a rule's numeric fields may hold.
fn to_number(value: &Value) -> f64 {
    match value {
        Value::Number(n) => n.as_f64().unwrap_or(f64::NAN),
        Value::String(s) => crate::http::zod::js_number(s),
        Value::Bool(b) => f64::from(u8::from(*b)),
        Value::Null => 0.0,
        Value::Array(_) | Value::Object(_) => f64::NAN,
    }
}

/// Array fields are only used when they are non-empty arrays; members compare strictly as numbers.
fn number_array(value: Option<&Value>) -> Option<Vec<f64>> {
    let items = value?.as_array()?;
    Some(
        items
            .iter()
            .map(|item| item.as_f64().unwrap_or(f64::NAN))
            .collect(),
    )
}

/// `new Date(value)` for an `until` that is a string or a number.
fn date_value(value: &Value) -> f64 {
    match value {
        Value::Number(n) => n.as_f64().map_or(f64::NAN, time_clip),
        Value::String(s) => crate::instant::parse_js_date(s).map_or(f64::NAN, |ms| ms as f64),
        Value::Bool(b) => f64::from(u8::from(*b)),
        _ => f64::NAN,
    }
}

/// `parseRecurrenceRule`: `None` for anything that is not a usable rule.
pub fn parse_rule(json: &str) -> Option<Rule> {
    let rule: Value = serde_json::from_str(json).ok()?;
    let field = |name: &str| rule.as_object().and_then(|object| object.get(name));
    let frequency = field("frequency")?;
    let interval = field("interval")?;
    if !truthy(frequency) || !truthy(interval) {
        return None;
    }
    let frequency = match frequency.as_str()? {
        "daily" => Frequency::Daily,
        "weekly" => Frequency::Weekly,
        "monthly" => Frequency::Monthly,
        "yearly" => Frequency::Yearly,
        _ => return None,
    };
    let interval = interval.as_f64().filter(|interval| *interval >= 1.0)?;
    let timezone = match field("timezone") {
        Some(value) if truthy(value) => Some(value.as_str()?.to_owned()),
        _ => None,
    };
    Some(Rule {
        frequency,
        interval,
        count: field("count").filter(|v| truthy(v)).map(to_number),
        until: field("until").filter(|v| truthy(v)).map(date_value),
        timezone,
        by_week_day: number_array(field("byWeekDay")),
        by_month_day: number_array(field("byMonthDay")),
        by_month: number_array(field("byMonth")),
    })
}

fn time_clip(time: f64) -> f64 {
    if !time.is_finite() || time.abs() > 8.64e15 {
        return f64::NAN;
    }
    time.trunc() + 0.0
}

fn days_from_civil(year: i64, month: i64, day: i64) -> i64 {
    let y = if month <= 2 { year - 1 } else { year };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = (month + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

/// `MakeDay`: months and days outside their range roll over, as in `Date.UTC` and the setters.
fn make_day(year: f64, month: f64, date: f64) -> f64 {
    if !year.is_finite() || !month.is_finite() || !date.is_finite() {
        return f64::NAN;
    }
    let (year, month, date) = (year.trunc(), month.trunc(), date.trunc());
    let ym = year + (month / 12.0).floor();
    let mn = month.rem_euclid(12.0);
    if ym.abs() > 400_000.0 {
        return f64::NAN;
    }
    days_from_civil(ym as i64, mn as i64 + 1, 1) as f64 + date - 1.0
}

fn make_date(day: f64, time: f64) -> f64 {
    time_clip(day * MS_PER_DAY + time)
}

/// The UTC fields of a time value, months zero-based as in JavaScript.
#[derive(Debug, Clone, Copy, PartialEq)]
struct Fields {
    year: f64,
    month: f64,
    day: f64,
    hour: f64,
    minute: f64,
    second: f64,
}

fn utc_fields(time: f64) -> Fields {
    let day = (time / MS_PER_DAY).floor();
    let within = time.rem_euclid(MS_PER_DAY);
    let (year, month, date) = civil_from_days(day as i64);
    Fields {
        year: year as f64,
        month: (month - 1) as f64,
        day: date as f64,
        hour: (within / 3_600_000.0).floor(),
        minute: (within / 60_000.0).floor() % 60.0,
        second: (within / 1000.0).floor() % 60.0,
    }
}

fn milliseconds(time: f64) -> f64 {
    time.rem_euclid(1000.0)
}

fn weekday(time: f64) -> f64 {
    ((time / MS_PER_DAY).floor() + 4.0).rem_euclid(7.0)
}

/// `Date.UTC(year, month, day, hour, minute, second, ms)`.
fn date_utc(fields: Fields, ms: f64) -> f64 {
    let time = fields.hour * 3_600_000.0 + fields.minute * 60_000.0 + fields.second * 1000.0 + ms;
    make_date(make_day(fields.year, fields.month, fields.day), time)
}

/// `Math.min`: unlike `f64::min`, a `NaN` operand wins.
fn js_min(a: f64, b: f64) -> f64 {
    if a.is_nan() || b.is_nan() {
        f64::NAN
    } else {
        a.min(b)
    }
}

fn add_days(time: f64, days: f64) -> f64 {
    set_utc_date(time, utc_fields(time).day + days.trunc())
}

fn set_utc_date(time: f64, date: f64) -> f64 {
    if time.is_nan() {
        return f64::NAN;
    }
    let fields = utc_fields(time);
    make_date(
        make_day(fields.year, fields.month, date),
        time.rem_euclid(MS_PER_DAY),
    )
}

fn set_utc_month(time: f64, month: f64) -> f64 {
    if time.is_nan() {
        return f64::NAN;
    }
    let fields = utc_fields(time);
    make_date(
        make_day(fields.year, month, fields.day),
        time.rem_euclid(MS_PER_DAY),
    )
}

fn days_in_month(year: f64, month: f64) -> f64 {
    utc_fields(make_date(make_day(year, month + 1.0, 0.0), 0.0)).day
}

fn add_months(time: f64, months: f64) -> f64 {
    if time.is_nan() {
        return f64::NAN;
    }
    let fields = utc_fields(time);
    let target = utc_fields(make_date(
        make_day(fields.year, fields.month + months.trunc(), 1.0),
        0.0,
    ));
    let day = js_min(fields.day, days_in_month(target.year, target.month));
    date_utc(
        Fields {
            year: target.year,
            month: target.month,
            day,
            ..fields
        },
        milliseconds(time),
    )
}

fn add_years(time: f64, years: f64) -> f64 {
    add_months(time, years * 12.0)
}

fn time_zone(name: &str) -> Result<jiff::tz::TimeZone, RecurrenceError> {
    crate::instant::time_zone(name).ok_or(RecurrenceError::TimeZone)
}

/// `parseDateParts`: the wall clock in `zone`, as `Intl.DateTimeFormat` reports it.
fn zoned_fields(time: f64, zone: &jiff::tz::TimeZone) -> Result<Fields, RecurrenceError> {
    if !time.is_finite() {
        return Err(RecurrenceError::InvalidDate);
    }
    let timestamp =
        jiff::Timestamp::from_millisecond(time as i64).map_err(|_| RecurrenceError::InvalidDate)?;
    let civil = zone.to_datetime(timestamp);
    Ok(Fields {
        year: f64::from(civil.year()),
        month: f64::from(civil.month()) - 1.0,
        day: f64::from(civil.day()),
        hour: f64::from(civil.hour()),
        minute: f64::from(civil.minute()),
        second: f64::from(civil.second()),
    })
}

/// The instant as the rule's wall clock written in UTC fields, so UTC arithmetic walks local days.
fn to_rule_context(time: f64, zone: Option<&jiff::tz::TimeZone>) -> Result<f64, RecurrenceError> {
    let Some(zone) = zone else {
        return Ok(time);
    };
    Ok(date_utc(zoned_fields(time, zone)?, milliseconds(time)))
}

/// Back from the rule's wall clock to an instant, with the same two correction passes across DST changes.
fn from_rule_context(time: f64, zone: Option<&jiff::tz::TimeZone>) -> Result<f64, RecurrenceError> {
    let Some(zone) = zone else {
        return Ok(time);
    };
    let ms = milliseconds(time);
    let target = date_utc(utc_fields(time), ms);
    let mut guess = target;
    for _ in 0..2 {
        let actual = date_utc(zoned_fields(guess, zone)?, ms);
        let diff = target - actual;
        if diff == 0.0 {
            break;
        }
        guess += diff;
    }
    Ok(guess)
}

fn same_rule_day(
    left: f64,
    right: f64,
    zone: Option<&jiff::tz::TimeZone>,
) -> Result<bool, RecurrenceError> {
    let (left, right) = (
        utc_fields(to_rule_context(left, zone)?),
        utc_fields(to_rule_context(right, zone)?),
    );
    Ok(left.year == right.year && left.month == right.month && left.day == right.day)
}

fn next_weekday_match(current: f64, week_days: &[f64], max_days: f64) -> Option<f64> {
    let mut next = add_days(current, 1.0);
    let mut checked = 0.0;
    while checked < max_days {
        if week_days.contains(&weekday(next)) {
            return Some(next);
        }
        next = add_days(next, 1.0);
        checked += 1.0;
    }
    None
}

fn next_occurrence(current: f64, rule: &Rule) -> f64 {
    let non_empty = |values: &Option<Vec<f64>>| values.as_ref().filter(|v| !v.is_empty()).cloned();
    match rule.frequency {
        Frequency::Daily => non_empty(&rule.by_week_day)
            .and_then(|days| next_weekday_match(current, &days, 14.0))
            .unwrap_or_else(|| add_days(current, rule.interval)),
        Frequency::Weekly => non_empty(&rule.by_week_day)
            .and_then(|days| next_weekday_match(current, &days, rule.interval * 7.0))
            .unwrap_or_else(|| add_days(current, rule.interval * 7.0)),
        Frequency::Monthly => match non_empty(&rule.by_month_day) {
            Some(days) => {
                let next = add_months(current, rule.interval);
                let fields = utc_fields(next);
                let target = days.first().copied().unwrap_or(1.0);
                set_utc_date(
                    next,
                    js_min(target, days_in_month(fields.year, fields.month)),
                )
            }
            None => add_months(current, rule.interval),
        },
        Frequency::Yearly => match non_empty(&rule.by_month) {
            Some(months) => {
                let next = add_years(current, rule.interval);
                let next = set_utc_month(next, months.first().copied().unwrap_or(1.0) - 1.0);
                match non_empty(&rule.by_month_day) {
                    Some(days) => {
                        let fields = utc_fields(next);
                        let target = days.first().copied().unwrap_or(1.0);
                        set_utc_date(
                            next,
                            js_min(target, days_in_month(fields.year, fields.month)),
                        )
                    }
                    None => next,
                }
            }
            None => add_years(current, rule.interval),
        },
    }
}

/// `generateInstances`: the occurrences inside `[range_start, range_end]` (at most 1000 steps), minus excepted days.
pub fn generate_instances(
    start_ms: i64,
    recurrence: &str,
    range_start_ms: i64,
    range_end_ms: i64,
    exceptions: &[Exception],
) -> Result<Vec<Instance>, RecurrenceError> {
    let Some(rule) = parse_rule(recurrence) else {
        return Ok(Vec::new());
    };
    let zone = rule.timezone.as_deref().map(time_zone).transpose()?;
    let zone = zone.as_ref();
    let (range_start, range_end) = (range_start_ms as f64, range_end_ms as f64);
    let before_until = |instant: f64| rule.until.is_none_or(|until| instant <= until);
    let excepted = |instant: f64| -> Result<bool, RecurrenceError> {
        for exception in exceptions {
            if same_rule_day(exception.date_ms as f64, instant, zone)? {
                return Ok(true);
            }
        }
        Ok(false)
    };
    let mut instances = Vec::new();
    let mut current = to_rule_context(start_ms as f64, zone)?;
    let mut occurrence_count = 1.0;
    let mut instant = from_rule_context(current, zone)?;
    if instant >= range_start
        && instant <= range_end
        && before_until(instant)
        && !excepted(instant)?
    {
        instances.push(Instance {
            date_ms: instant as i64,
            is_original: true,
        });
    }
    for _ in 0..MAX_ITERATIONS {
        if rule.count.is_some_and(|count| occurrence_count >= count) {
            break;
        }
        current = next_occurrence(current, &rule);
        occurrence_count += 1.0;
        instant = from_rule_context(current, zone)?;
        if rule.until.is_some_and(|until| instant > until) || instant > range_end {
            break;
        }
        if instant >= range_start && instant <= range_end && !excepted(instant)? {
            instances.push(Instance {
                date_ms: instant as i64,
                is_original: false,
            });
        }
    }
    Ok(instances)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ms(iso: &str) -> i64 {
        iso.parse::<jiff::Timestamp>().unwrap().as_millisecond()
    }

    fn iso(ms: i64) -> String {
        jiff::Timestamp::from_millisecond(ms)
            .unwrap()
            .strftime("%Y-%m-%dT%H:%M:%S%.3fZ")
            .to_string()
    }

    fn dates(instances: &[Instance]) -> Vec<String> {
        instances.iter().map(|i| iso(i.date_ms)).collect()
    }

    #[test]
    fn the_wall_clock_time_survives_dst_changes() {
        let rule = r#"{"frequency":"weekly","interval":1,"timezone":"America/New_York"}"#;
        let instances = generate_instances(
            ms("2026-03-01T13:00:00Z"),
            rule,
            ms("2026-03-01T00:00:00Z"),
            ms("2026-03-09T00:00:00Z"),
            &[],
        )
        .unwrap();
        assert_eq!(
            dates(&instances),
            ["2026-03-01T13:00:00.000Z", "2026-03-08T12:00:00.000Z"]
        );
    }

    #[test]
    fn exceptions_match_the_rule_zones_calendar_day() {
        let rule = r#"{"frequency":"daily","interval":1,"timezone":"Asia/Tokyo"}"#;
        let instances = generate_instances(
            ms("2026-03-01T15:30:00Z"),
            rule,
            ms("2026-03-01T00:00:00Z"),
            ms("2026-03-03T00:00:00Z"),
            &[Exception {
                date_ms: ms("2026-03-03T02:00:00Z"),
                kind: ExceptionType::Modified,
            }],
        )
        .unwrap();
        assert_eq!(dates(&instances), ["2026-03-01T15:30:00.000Z"]);
    }

    #[test]
    fn modified_exceptions_suppress_their_occurrence() {
        let rule = r#"{"frequency":"weekly","interval":1,"byWeekDay":[2]}"#;
        for excepted in ["2026-05-05T09:00:00.000Z", "2026-05-12T09:00:00.000Z"] {
            let instances = generate_instances(
                ms("2026-05-05T09:00:00Z"),
                rule,
                ms("2026-05-01T00:00:00Z"),
                ms("2026-05-20T00:00:00Z"),
                &[Exception {
                    date_ms: ms(excepted),
                    kind: ExceptionType::Modified,
                }],
            )
            .unwrap();
            assert!(
                !dates(&instances).contains(&excepted.to_owned()),
                "{excepted}"
            );
            assert_eq!(instances.len(), 2, "{excepted}");
        }
    }

    #[test]
    fn a_series_split_at_its_first_occurrence_has_no_instances() {
        let rule = r#"{"frequency":"weekly","interval":1,"until":"2026-05-04T09:00:00.000Z"}"#;
        let instances = generate_instances(
            ms("2026-05-05T09:00:00Z"),
            rule,
            ms("2026-05-01T00:00:00Z"),
            ms("2026-06-01T00:00:00Z"),
            &[],
        )
        .unwrap();
        assert!(instances.is_empty());
    }

    #[test]
    fn months_clamp_to_their_last_day_like_date() {
        let rule = r#"{"frequency":"monthly","interval":1}"#;
        let instances = generate_instances(
            ms("2026-01-31T10:00:00Z"),
            rule,
            ms("2026-01-01T00:00:00Z"),
            ms("2026-04-30T23:59:59Z"),
            &[],
        )
        .unwrap();
        assert_eq!(
            dates(&instances),
            [
                "2026-01-31T10:00:00.000Z",
                "2026-02-28T10:00:00.000Z",
                "2026-03-28T10:00:00.000Z",
                "2026-04-28T10:00:00.000Z"
            ],
            "each step starts from the clamped date"
        );
    }

    #[test]
    fn yearly_months_roll_over_like_set_utc_month() {
        let rule = r#"{"frequency":"yearly","interval":1,"byMonth":[2]}"#;
        let instances = generate_instances(
            ms("2026-01-31T10:00:00Z"),
            rule,
            ms("2026-01-01T00:00:00Z"),
            ms("2027-12-31T00:00:00Z"),
            &[],
        )
        .unwrap();
        assert_eq!(
            dates(&instances),
            ["2026-01-31T10:00:00.000Z", "2027-03-03T10:00:00.000Z"],
            "February 31st rolls into March"
        );
    }

    #[test]
    fn rules_parse_the_way_javascript_reads_them() {
        assert!(parse_rule("{}").is_none());
        assert!(parse_rule("null").is_none());
        assert!(parse_rule("not json").is_none());
        assert!(parse_rule(r#"{"frequency":"hourly","interval":1}"#).is_none());
        assert!(parse_rule(r#"{"frequency":"daily","interval":"1"}"#).is_none());
        assert!(parse_rule(r#"{"frequency":"daily","interval":0}"#).is_none());
        assert!(parse_rule(r#"{"frequency":"daily","interval":1,"timezone":5}"#).is_none());
        let rule =
            parse_rule(r#"{"frequency":"daily","interval":2,"count":0,"until":"nope"}"#).unwrap();
        assert_eq!((rule.interval, rule.count), (2.0, None));
        assert!(rule.until.is_some_and(f64::is_nan));
    }

    #[test]
    fn a_non_numeric_month_day_invalidates_the_series_like_date() {
        let rule = r#"{"frequency":"monthly","interval":1,"byMonthDay":["x"]}"#;
        let instances = generate_instances(
            ms("2026-01-15T10:00:00Z"),
            rule,
            ms("2026-01-01T00:00:00Z"),
            ms("2026-12-31T00:00:00Z"),
            &[],
        )
        .unwrap();
        assert_eq!(dates(&instances), ["2026-01-15T10:00:00.000Z"]);
    }

    #[test]
    fn an_unknown_time_zone_is_an_error() {
        let rule = r#"{"frequency":"daily","interval":1,"timezone":"Mars/Olympus"}"#;
        assert!(generate_instances(0, rule, 0, 1, &[]).is_err());
    }
}
