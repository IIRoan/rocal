//! VTIMEZONE components: written from jiff's tz database so a series keeps its wall-clock time, and read by their own rules.

use jiff::civil::{Date, DateTime, Weekday};
use jiff::tz::{Offset, TimeZone};
use jiff::{SignedDuration, Timestamp};

use super::zones;

/// Observances run through 2099; a pattern still going then repeats forever.
const HORIZON_YEAR: i16 = 2100;

/// A zone a timed series can be written in: a tz database zone that has changed offset since 1970, under its canonical name.
pub fn wall_clock_zone(zone: Option<&str>) -> Option<(String, TimeZone)> {
    let tz = zones::lookup(zone?)?;
    let name = tz.iana_name()?.to_owned();
    tz.following(Timestamp::UNIX_EPOCH).next()?;
    Some((name, tz))
}

/// `YYYYMMDDTHHMMSS`, the wall-clock time of `at` in `tz`.
pub fn local_stamp(tz: &TimeZone, at: Timestamp) -> String {
    stamp(tz.to_datetime(at))
}

fn stamp(at: DateTime) -> String {
    at.strftime("%Y%m%dT%H%M%S").to_string()
}

fn offset_text(offset: Offset) -> String {
    let seconds = offset.seconds();
    let sign = if seconds < 0 { '-' } else { '+' };
    let seconds = seconds.unsigned_abs();
    let (hours, minutes, rest) = (seconds / 3600, seconds / 60 % 60, seconds % 60);
    if rest == 0 {
        format!("{sign}{hours:02}{minutes:02}")
    } else {
        format!("{sign}{hours:02}{minutes:02}{rest:02}")
    }
}

fn weekday_code(day: Weekday) -> &'static str {
    match day {
        Weekday::Monday => "MO",
        Weekday::Tuesday => "TU",
        Weekday::Wednesday => "WE",
        Weekday::Thursday => "TH",
        Weekday::Friday => "FR",
        Weekday::Saturday => "SA",
        Weekday::Sunday => "SU",
    }
}

/// Transitions that recur yearly on the same weekday rule, local time and offsets.
#[derive(PartialEq)]
struct Pattern {
    daylight: bool,
    from: Offset,
    to: Offset,
    name: String,
    month: i8,
    /// `-1` for the month's last such weekday.
    week: i8,
    weekday: Weekday,
    time: jiff::civil::Time,
}

struct Run {
    pattern: Pattern,
    first: DateTime,
    last_year: i16,
    last: Timestamp,
    count: usize,
}

fn pattern(daylight: bool, from: Offset, to: Offset, name: &str, onset: DateTime) -> Pattern {
    let day = onset.day();
    let last = i16::from(day) + 7 > i16::from(onset.date().days_in_month());
    Pattern {
        daylight,
        from,
        to,
        name: name.to_owned(),
        month: onset.month(),
        week: if last { -1 } else { (day - 1) / 7 + 1 },
        weekday: onset.weekday(),
        time: onset.time(),
    }
}

fn observance(lines: &mut Vec<String>, run: &Run, open_ended: bool) {
    let kind = if run.pattern.daylight {
        "DAYLIGHT"
    } else {
        "STANDARD"
    };
    lines.push(format!("BEGIN:{kind}"));
    lines.push(format!("TZOFFSETFROM:{}", offset_text(run.pattern.from)));
    lines.push(format!("TZOFFSETTO:{}", offset_text(run.pattern.to)));
    if !run.pattern.name.is_empty() {
        lines.push(format!("TZNAME:{}", run.pattern.name));
    }
    lines.push(format!("DTSTART:{}", stamp(run.first)));
    if run.count > 1 || open_ended {
        let until = if open_ended {
            String::new()
        } else {
            format!(";UNTIL={}Z", stamp(TimeZone::UTC.to_datetime(run.last)))
        };
        lines.push(format!(
            "RRULE:FREQ=YEARLY;BYMONTH={};BYDAY={}{}{until}",
            run.pattern.month,
            run.pattern.week,
            weekday_code(run.pattern.weekday)
        ));
    }
    lines.push(format!("END:{kind}"));
}

/// The VTIMEZONE of `tz` from a year before `earliest` on: the offset then, and each later transition, yearly patterns folded into RRULEs.
pub fn component(name: &str, tz: &TimeZone, earliest: Timestamp) -> Vec<String> {
    let from = earliest
        .checked_sub(SignedDuration::from_hours(366 * 24))
        .unwrap_or(earliest);
    let horizon = DateTime::new(HORIZON_YEAR, 1, 1, 0, 0, 0, 0)
        .ok()
        .and_then(|at| TimeZone::UTC.to_timestamp(at).ok())
        .unwrap_or(Timestamp::MAX);
    let mut lines = vec!["BEGIN:VTIMEZONE".to_owned(), format!("TZID:{name}")];
    let info = tz.to_offset_info(from);
    let mut offset = info.offset();
    let start = offset.to_datetime(from);
    observance(
        &mut lines,
        &Run {
            pattern: pattern(
                info.dst().is_dst(),
                offset,
                offset,
                info.abbreviation(),
                start,
            ),
            first: start,
            last_year: start.year(),
            last: from,
            count: 1,
        },
        false,
    );
    let mut runs: [Option<Run>; 2] = [None, None];
    for transition in tz.following(from) {
        let at = transition.timestamp();
        if at >= horizon {
            break;
        }
        let onset = offset.to_datetime(at);
        let daylight = transition.dst().is_dst();
        let next = pattern(
            daylight,
            offset,
            transition.offset(),
            transition.abbreviation(),
            onset,
        );
        let slot = &mut runs[usize::from(daylight)];
        match slot {
            Some(run) if run.pattern == next && onset.year() == run.last_year + 1 => {
                run.last_year = onset.year();
                run.last = at;
                run.count += 1;
            }
            _ => {
                if let Some(run) = slot.take() {
                    observance(&mut lines, &run, false);
                }
                *slot = Some(Run {
                    pattern: next,
                    first: onset,
                    last_year: onset.year(),
                    last: at,
                    count: 1,
                });
            }
        }
        offset = transition.offset();
    }
    for run in runs.into_iter().flatten() {
        // A pattern that ran into the horizon is still in force; one that stopped earlier ends where it stopped.
        let open_ended = run.count > 1 && run.last_year >= HORIZON_YEAR - 1;
        observance(&mut lines, &run, open_ended);
    }
    lines.push("END:VTIMEZONE".into());
    lines
}

/// A STANDARD or DAYLIGHT part as a file defines it: its first onset (wall time before the change), offsets, RRULE and RDATEs.
#[derive(Debug, Clone)]
pub struct Observance {
    pub daylight: bool,
    pub start: DateTime,
    pub from: Offset,
    pub to: Offset,
    /// The RRULE value, without `RRULE:`.
    pub rule: Option<String>,
    pub dates: Vec<DateTime>,
}

struct YearlyRule {
    interval: i16,
    count: Option<i16>,
    /// `(wall time, written in UTC)`.
    until: Option<(DateTime, bool)>,
    month: Option<i8>,
    /// `(ordinal, weekday)`; 0 for any.
    weekday: Option<(i8, Weekday)>,
    month_days: Vec<i8>,
}

fn weekday_of(code: &str) -> Option<Weekday> {
    Some(match code {
        "MO" => Weekday::Monday,
        "TU" => Weekday::Tuesday,
        "WE" => Weekday::Wednesday,
        "TH" => Weekday::Thursday,
        "FR" => Weekday::Friday,
        "SA" => Weekday::Saturday,
        "SU" => Weekday::Sunday,
        _ => return None,
    })
}

/// `YYYYMMDDTHHMMSS`, a trailing `Z` reported.
pub fn basic_date_time(value: &str) -> Option<(DateTime, bool)> {
    let value = value.trim();
    let (value, utc) = match value.strip_suffix('Z') {
        Some(rest) => (rest, true),
        None => (value, false),
    };
    let number = |range: std::ops::Range<usize>| value.get(range)?.parse::<i16>().ok();
    let (hour, minute, second) = match value.len() {
        8 => (0, 0, 0),
        15 if value.as_bytes()[8] == b'T' => (number(9..11)?, number(11..13)?, number(13..15)?),
        _ => return None,
    };
    let civil = DateTime::new(
        number(0..4)?,
        number(4..6)? as i8,
        number(6..8)? as i8,
        hour as i8,
        minute as i8,
        second as i8,
        0,
    );
    Some((civil.ok()?, utc))
}

/// The yearly rules VTIMEZONEs use; anything else reads as no rule.
fn yearly_rule(text: &str) -> Option<YearlyRule> {
    let mut rule = YearlyRule {
        interval: 1,
        count: None,
        until: None,
        month: None,
        weekday: None,
        month_days: Vec::new(),
    };
    let mut yearly = false;
    for part in text.split(';') {
        let (key, value) = part.split_once('=')?;
        match key.to_uppercase().as_str() {
            "FREQ" => yearly = value.eq_ignore_ascii_case("YEARLY"),
            "INTERVAL" => rule.interval = value.parse().ok().filter(|n| *n > 0)?,
            "COUNT" => rule.count = value.parse().ok(),
            "UNTIL" => rule.until = basic_date_time(value),
            "BYMONTH" => rule.month = value.split(',').next()?.parse().ok(),
            "BYMONTHDAY" => {
                rule.month_days = value
                    .split(',')
                    .filter_map(|day| day.parse().ok())
                    .collect();
            }
            "BYDAY" => {
                let token = value.split(',').next()?.to_uppercase();
                let (ordinal, code) = token.split_at_checked(token.len().checked_sub(2)?)?;
                let ordinal = if ordinal.is_empty() {
                    0
                } else {
                    ordinal.parse().ok()?
                };
                rule.weekday = Some((ordinal, weekday_of(code)?));
            }
            _ => {}
        }
    }
    yearly.then_some(rule)
}

/// The day a yearly rule falls on in `year` and `month`.
fn rule_day(rule: &YearlyRule, year: i16, month: i8, fallback: i8) -> Option<Date> {
    let first = Date::new(year, month, 1).ok()?;
    let last = first.days_in_month();
    let on = |day: i8| Date::new(year, month, day).ok();
    match (rule.weekday, rule.month_days.as_slice()) {
        (Some((ordinal, weekday)), _) if ordinal != 0 => {
            if ordinal > 0 {
                let mut day = 1;
                while on(day)?.weekday() != weekday {
                    day += 1;
                }
                on(day + 7 * (ordinal - 1)).filter(|date| date.month() == month)
            } else {
                let mut day = last;
                while on(day)?.weekday() != weekday {
                    day -= 1;
                }
                on(day - 7 * (-ordinal - 1))
            }
        }
        (Some((_, weekday)), days) if !days.is_empty() => days
            .iter()
            .filter_map(|day| on(*day))
            .find(|date| date.weekday() == weekday),
        (Some((_, weekday)), _) => (1..=last)
            .filter_map(on)
            .find(|date| date.weekday() == weekday),
        (None, [day, ..]) => on(*day),
        (None, []) => on(fallback),
    }
}

/// An observance's RRULE onset in `year`; a later observance of the same kind with its own rule ends an earlier rule (Exchange writes eras that way).
fn rule_onset(part: &Observance, year: i16, ends: Option<DateTime>) -> Option<DateTime> {
    let rule = yearly_rule(part.rule.as_deref()?)?;
    let since = year - part.start.year();
    if since < 0
        || since % rule.interval != 0
        || rule
            .count
            .is_some_and(|count| since / rule.interval >= count)
    {
        return None;
    }
    let month = rule.month.unwrap_or(part.start.month());
    let onset = rule_day(&rule, year, month, part.start.day())?.to_datetime(part.start.time());
    let within_until = match rule.until {
        None => true,
        Some((until, false)) => onset <= until,
        Some((until, true)) => part
            .from
            .to_timestamp(onset)
            .ok()
            .zip(TimeZone::UTC.to_timestamp(until).ok())
            .is_some_and(|(onset, until)| onset <= until),
    };
    (onset >= part.start && within_until && ends.is_none_or(|end| onset < end)).then_some(onset)
}

/// The UTC instant of a wall time under a file's observances; `None` when they only sketch a pattern (differing offsets, onsets in one year, no RRULE or RDATE), which node-ical matches to a zone instead.
pub fn instant(parts: &[Observance], local: DateTime) -> Option<Timestamp> {
    let first = parts.iter().min_by_key(|part| part.start)?;
    let recurring = parts
        .iter()
        .any(|part| part.rule.is_some() || !part.dates.is_empty());
    let single_offset = parts.iter().all(|part| part.to == first.to);
    let one_year = parts
        .iter()
        .all(|part| part.start.year() == first.start.year());
    if !recurring && !single_offset && one_year {
        return None;
    }
    let mut best: Option<(DateTime, &Observance)> = None;
    for part in parts {
        let ends = parts
            .iter()
            .filter(|other| {
                other.daylight == part.daylight && other.rule.is_some() && other.start > part.start
            })
            .map(|other| other.start)
            .min();
        let fixed = std::iter::once(part.start).chain(part.dates.iter().copied());
        let ruled = [local.year() - 1, local.year()]
            .into_iter()
            .filter_map(|year| rule_onset(part, year, ends));
        for onset in fixed.chain(ruled) {
            if onset <= local && best.is_none_or(|(at, _)| onset > at) {
                best = Some((onset, part));
            }
        }
    }
    let offset = match best {
        None => first.from,
        // A wall time a spring-forward skips keeps the offset before the jump, as RFC 5545 and node-ical read it.
        Some((onset, part))
            if onset
                .checked_add(part.to - part.from)
                .is_ok_and(|end| local < end) =>
        {
            part.from
        }
        Some((_, part)) => part.to,
    };
    offset.to_timestamp(local).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(iso: &str) -> Timestamp {
        iso.parse().unwrap()
    }

    #[test]
    fn european_rules_fold_into_two_open_ended_observances() {
        let (name, tz) = wall_clock_zone(Some("europe/amsterdam")).unwrap();
        assert_eq!(name, "Europe/Amsterdam");
        let lines = component(&name, &tz, at("2026-10-19T07:00:00Z"));
        assert_eq!(
            lines,
            [
                "BEGIN:VTIMEZONE",
                "TZID:Europe/Amsterdam",
                "BEGIN:DAYLIGHT",
                "TZOFFSETFROM:+0200",
                "TZOFFSETTO:+0200",
                "TZNAME:CEST",
                "DTSTART:20251018T090000",
                "END:DAYLIGHT",
                "BEGIN:STANDARD",
                "TZOFFSETFROM:+0200",
                "TZOFFSETTO:+0100",
                "TZNAME:CET",
                "DTSTART:20251026T030000",
                "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
                "END:STANDARD",
                "BEGIN:DAYLIGHT",
                "TZOFFSETFROM:+0100",
                "TZOFFSETTO:+0200",
                "TZNAME:CEST",
                "DTSTART:20260329T020000",
                "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
                "END:DAYLIGHT",
                "END:VTIMEZONE",
            ]
        );
    }

    /// Reads `component`'s own output back, as a file's VTIMEZONE.
    fn read_back(lines: &[String]) -> Vec<Observance> {
        let mut parts = Vec::new();
        let mut current: Option<Observance> = None;
        for line in lines {
            let (key, value) = line.split_once(':').unwrap();
            match key {
                "BEGIN" if value != "VTIMEZONE" => {
                    current = Some(Observance {
                        daylight: value == "DAYLIGHT",
                        start: DateTime::default(),
                        from: Offset::UTC,
                        to: Offset::UTC,
                        rule: None,
                        dates: Vec::new(),
                    })
                }
                "END" if value != "VTIMEZONE" => parts.push(current.take().unwrap()),
                "DTSTART" => current.as_mut().unwrap().start = basic_date_time(value).unwrap().0,
                "TZOFFSETFROM" | "TZOFFSETTO" => {
                    let minutes =
                        crate::integrations::ics::zones::offset_label_to_minutes(value).unwrap();
                    let offset = Offset::from_seconds(minutes as i32 * 60).unwrap();
                    let part = current.as_mut().unwrap();
                    if key == "TZOFFSETFROM" {
                        part.from = offset;
                    } else {
                        part.to = offset;
                    }
                }
                "RRULE" => current.as_mut().unwrap().rule = Some(value.to_owned()),
                _ => {}
            }
        }
        parts
    }

    #[test]
    fn generated_components_read_back_to_the_tz_database() {
        for zone in [
            "Europe/Amsterdam",
            "America/New_York",
            "Australia/Sydney",
            "Europe/Moscow",
        ] {
            let (name, tz) = wall_clock_zone(Some(zone)).unwrap();
            let parts = read_back(&component(&name, &tz, at("2011-01-15T12:00:00Z")));
            let mut probe = at("2011-01-01T00:00:00Z");
            while probe < at("2040-01-01T00:00:00Z") {
                let local = tz.to_datetime(probe);
                assert_eq!(instant(&parts, local), Some(probe), "{zone} {local}");
                probe = probe
                    .checked_add(SignedDuration::from_hours(24 * 17 + 5))
                    .unwrap();
            }
        }
    }

    #[test]
    fn rules_bymonthday_rdates_and_eras_resolve() {
        let offset = |hours: i8| Offset::constant(hours);
        let wall = |text: &str| basic_date_time(text).unwrap().0;
        // Fiji's tzurl.org rules: the Sunday among given month days, and RDATEs before them.
        let fiji = [
            Observance {
                daylight: true,
                start: wall("20101024T020000"),
                from: offset(12),
                to: offset(13),
                rule: Some(
                    "FREQ=YEARLY;BYMONTH=10;BYMONTHDAY=21,22,23,24,25,26,27;BYDAY=SU".into(),
                ),
                dates: Vec::new(),
            },
            Observance {
                daylight: false,
                start: wall("20140119T020000"),
                from: offset(13),
                to: offset(12),
                rule: Some("FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=18,19,20,21,22,23,24;BYDAY=SU".into()),
                dates: Vec::new(),
            },
            Observance {
                daylight: false,
                start: wall("19990228T030000"),
                from: offset(13),
                to: offset(12),
                rule: None,
                dates: vec![wall("20130120T030000")],
            },
        ];
        assert_eq!(
            instant(&fiji, wall("20140829T100000")),
            Some(at("2014-08-28T22:00:00Z"))
        );
        assert_eq!(
            instant(&fiji, wall("20131201T100000")),
            Some(at("2013-11-30T21:00:00Z"))
        );
        assert_eq!(
            instant(&fiji, wall("20130301T100000")),
            Some(at("2013-02-28T22:00:00Z"))
        );
        // Exchange's multi-era custom zones: the 2007 rules end the 1671 ones.
        let era = |daylight: bool, start: &str, rule: &str| Observance {
            daylight,
            start: wall(start),
            from: offset(if daylight { -5 } else { -4 }),
            to: offset(if daylight { -4 } else { -5 }),
            rule: Some(rule.into()),
            dates: Vec::new(),
        };
        let eras = [
            era(
                false,
                "16711029T020000",
                "FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10",
            ),
            era(true, "16710404T020000", "FREQ=YEARLY;BYDAY=1SU;BYMONTH=4"),
            era(false, "20071104T020000", "FREQ=YEARLY;BYDAY=1SU;BYMONTH=11"),
            era(true, "20070311T020000", "FREQ=YEARLY;BYDAY=2SU;BYMONTH=3"),
        ];
        assert_eq!(
            instant(&eras, wall("20241101T090000")),
            Some(at("2024-11-01T13:00:00Z"))
        );
        assert_eq!(
            instant(&eras, wall("20060415T090000")),
            Some(at("2006-04-15T13:00:00Z"))
        );
        // Two offsets in one year without any rule only sketch a pattern.
        let bare = [
            Observance {
                rule: None,
                ..eras[0].clone()
            },
            Observance {
                rule: None,
                ..eras[1].clone()
            },
        ];
        assert_eq!(instant(&bare, wall("20240715T090000")), None);
    }

    #[test]
    fn skipped_wall_times_keep_the_offset_before_the_jump() {
        let offset = |hours: i8| Offset::constant(hours);
        let wall = |text: &str| basic_date_time(text).unwrap().0;
        let europe = [
            Observance {
                daylight: false,
                start: wall("19701025T030000"),
                from: offset(2),
                to: offset(1),
                rule: Some("FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU".into()),
                dates: Vec::new(),
            },
            Observance {
                daylight: true,
                start: wall("19700329T020000"),
                from: offset(1),
                to: offset(2),
                rule: Some("FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU".into()),
                dates: Vec::new(),
            },
        ];
        for (local, utc) in [
            ("20260329T013000", "2026-03-29T00:30:00Z"),
            ("20260329T020000", "2026-03-29T01:00:00Z"),
            ("20260329T023000", "2026-03-29T01:30:00Z"),
            ("20260329T030000", "2026-03-29T01:00:00Z"),
            ("20261025T023000", "2026-10-25T00:30:00Z"),
            ("20261025T030000", "2026-10-25T02:00:00Z"),
        ] {
            assert_eq!(instant(&europe, wall(local)), Some(at(utc)), "{local}");
        }
    }

    #[test]
    fn malformed_weekdays_read_as_no_rule() {
        for byday in ["☃", "1☃", "€", "-1ŞU"] {
            assert!(yearly_rule(&format!("FREQ=YEARLY;BYDAY={byday}")).is_none());
        }
    }

    #[test]
    fn a_zone_that_stopped_changing_ends_its_patterns() {
        let (name, tz) = wall_clock_zone(Some("Europe/Moscow")).unwrap();
        let lines = component(&name, &tz, at("2012-06-01T00:00:00Z")).join("\n");
        assert!(lines.contains("TZOFFSETTO:+0300"), "{lines}");
        assert!(
            !lines.contains("RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU\n"),
            "{lines}"
        );
        assert!(
            wall_clock_zone(Some("Asia/Tokyo")).is_none(),
            "no change since 1970"
        );
        assert!(wall_clock_zone(Some("UTC")).is_none());
        assert!(wall_clock_zone(Some("+01:00")).is_none());
    }
}
