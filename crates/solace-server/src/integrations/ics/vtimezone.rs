//! VTIMEZONE components from jiff's tz database, so a series written with `TZID` keeps its wall-clock time wherever it is read.

use jiff::civil::{DateTime, Weekday};
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
