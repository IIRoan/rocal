//! `buildIcsCalendar` and `buildIcsEventFile`: the ICS Solace writes for exports, public feeds, invitations and RSVP replies.

use jiff::Timestamp;
use jiff::tz::TimeZone;
use time::PrimitiveDateTime;

use super::{
    DEFAULT_METHOD, Participant, ParticipantRole, ParticipantStatus, RecurrenceRule, js,
    normalize_timezone, trimmed_text, vtimezone, zones,
};
use crate::http::zod::js_trim;
use crate::instant;

const DEFAULT_PRODUCT_ID: &str = "-//Solace Calendar//Calendar Export//EN";
const WEEKDAY_CODES: [&str; 7] = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/// `IcsCalendarMetadata`.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Calendar {
    pub name: Option<String>,
    pub description: Option<String>,
    pub timezone: Option<String>,
    pub method: Option<&'static str>,
    pub product_id: Option<String>,
    pub source_url: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EventStatus {
    Confirmed,
    Tentative,
    Cancelled,
}

/// `IcsBuildEventInput`; instants are UTC.
#[derive(Debug, Clone, PartialEq)]
pub struct Event {
    /// A random `…@solace-calendar.local` UID when blank.
    pub uid: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub start: PrimitiveDateTime,
    pub end: PrimitiveDateTime,
    pub all_day: bool,
    pub timezone: Option<String>,
    pub location: Option<String>,
    pub recurrence: Option<RecurrenceRule>,
    pub created_at: Option<PrimitiveDateTime>,
    pub updated_at: Option<PrimitiveDateTime>,
    pub status: Option<EventStatus>,
    pub sequence: Option<i64>,
    pub source_url: Option<String>,
    pub participants: Option<Vec<Participant>>,
    /// The original start of the occurrence this VEVENT overrides.
    pub recurrence_id: Option<PrimitiveDateTime>,
    /// The series rule's zone, which a RECURRENCE-ID is written in like the series' DTSTART.
    pub recurrence_zone: Option<String>,
    /// Occurrence starts the series skips (EXDATE).
    pub excluded_dates: Vec<PrimitiveDateTime>,
}

/// `buildIcsEventFile`.
pub fn event_file(calendar: &Calendar, event: Event) -> String {
    build_calendar(calendar, &[event])
}

/// `buildIcsCalendar`, stamped now.
pub fn build_calendar(calendar: &Calendar, events: &[Event]) -> String {
    build_calendar_at(calendar, events, instant::now())
}

/// `buildIcsCalendar` with an explicit DTSTAMP.
pub fn build_calendar_at(
    calendar: &Calendar,
    events: &[Event],
    stamp: PrimitiveDateTime,
) -> String {
    let mut lines = vec![
        "BEGIN:VCALENDAR".to_owned(),
        "VERSION:2.0".into(),
        format!(
            "PRODID:{}",
            trimmed_text(calendar.product_id.as_deref())
                .as_deref()
                .unwrap_or(DEFAULT_PRODUCT_ID)
        ),
        "CALSCALE:GREGORIAN".into(),
        format!(
            "METHOD:{}",
            calendar
                .method
                .filter(|m| !m.is_empty())
                .unwrap_or(DEFAULT_METHOD)
        ),
        format!(
            "X-WR-CALNAME:{}",
            escape_text(
                trimmed_text(calendar.name.as_deref())
                    .as_deref()
                    .unwrap_or("Calendar")
            )
        ),
    ];
    if let Some(description) = trimmed_text(calendar.description.as_deref()) {
        lines.push(format!("X-WR-CALDESC:{}", escape_text(&description)));
    }
    if let Some(timezone) = trimmed_text(calendar.timezone.as_deref()) {
        lines.push(format!("X-WR-TIMEZONE:{}", escape_text(&timezone)));
    }
    if let Some(url) = trimmed_text(calendar.source_url.as_deref()) {
        lines.push(format!("URL:{}", sanitize_uri(&url)));
    }
    let mut zones: std::collections::BTreeMap<String, (TimeZone, i64)> =
        std::collections::BTreeMap::new();
    for event in events {
        for (name, tz, earliest) in wall_clock_zones(event) {
            let entry = zones.entry(name).or_insert((tz, earliest));
            entry.1 = entry.1.min(earliest);
        }
    }
    for (name, (tz, earliest)) in &zones {
        let earliest = Timestamp::from_millisecond(*earliest).unwrap_or(Timestamp::UNIX_EPOCH);
        lines.extend(vtimezone::component(name, tz, earliest));
    }
    for event in events {
        event_lines(&mut lines, event, stamp, calendar.timezone.as_deref());
    }
    lines.push("END:VCALENDAR".into());
    let mut out = String::new();
    for line in &lines {
        for segment in fold(line) {
            out.push_str(&segment);
            out.push_str("\r\n");
        }
    }
    out
}

/// `\r?\n` replaced, as the TEXT and parameter escapes do.
fn replace_newlines(value: &str, with: &str) -> String {
    value.replace("\r\n", "\n").replace('\n', with)
}

fn escape_text(value: &str) -> String {
    replace_newlines(&value.replace('\\', "\\\\"), "\\n")
        .replace(',', "\\,")
        .replace(';', "\\;")
}

fn escape_param(value: &str) -> String {
    replace_newlines(&value.replace('\\', "\\\\"), " ")
        .replace('"', "\\\"")
        .replace(',', "\\,")
        .replace(';', "\\;")
}

/// URIs are not TEXT: only line breaks go.
fn sanitize_uri(value: &str) -> String {
    js_trim(&replace_newlines(value, "")).to_owned()
}

/// RFC 5545 §3.1: 75 octets on the first line, a space and 74 on each continuation.
fn fold(line: &str) -> Vec<String> {
    let mut segments: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut limit = 75;
    for character in line.chars() {
        if !current.is_empty() && current.len() + character.len_utf8() > limit {
            segments.push(std::mem::take(&mut current));
            limit = 74;
        }
        current.push(character);
    }
    if !current.is_empty() || segments.is_empty() {
        segments.push(current);
    }
    for segment in segments.iter_mut().skip(1) {
        segment.insert(0, ' ');
    }
    segments
}

fn ms(value: PrimitiveDateTime) -> i64 {
    let nanos = value.assume_utc().unix_timestamp_nanos();
    i64::try_from(nanos / 1_000_000).unwrap_or_default()
}

fn date_stamp(ms: i64) -> String {
    let f = js::fields(ms);
    format!("{}{:02}{:02}", f.year, f.month, f.day)
}

fn date_time_stamp(ms: i64) -> String {
    let f = js::fields(ms);
    format!(
        "{}T{:02}{:02}{:02}Z",
        date_stamp(ms),
        f.hour,
        f.minute,
        f.second
    )
}

/// The calendar date in `zone` (UTC when the zone is unusable).
fn date_stamp_in(ms: i64, zone: &str) -> String {
    let resolved = normalize_timezone(Some(zone)).unwrap_or_else(|| "UTC".into());
    zones::lookup(&resolved)
        .and_then(|tz| zones::date_in(&tz, ms))
        .map_or_else(
            || date_stamp(ms),
            |(year, month, day)| format!("{year}{month:02}{day:02}"),
        )
}

fn next_day(stamp: &str) -> String {
    let digits = stamp.len() == 8 && stamp.bytes().all(|b| b.is_ascii_digit());
    let field = |from: usize, to: usize| stamp[from..to].parse::<i64>().unwrap_or(0);
    match digits
        .then(|| js::date_utc(field(0, 4), field(4, 6) - 1, field(6, 8), 0, 0, 0))
        .flatten()
    {
        Some(day) => date_stamp(day + js::MS_PER_DAY),
        None => stamp.to_owned(),
    }
}

/// A timed series in its rule's zone, so subscribers expand it on wall-clock time as the owner's calendar does.
fn series_zone(event: &Event) -> Option<(String, TimeZone)> {
    let rule = event.recurrence.as_ref().filter(|_| !event.all_day)?;
    vtimezone::wall_clock_zone(rule.timezone.as_deref())
}

fn override_zone(event: &Event) -> Option<(String, TimeZone)> {
    event.recurrence_id.filter(|_| !event.all_day)?;
    vtimezone::wall_clock_zone(event.recurrence_zone.as_deref())
}

/// The zones an event writes with `TZID`, and the earliest instant each must cover.
fn wall_clock_zones(event: &Event) -> Vec<(String, TimeZone, i64)> {
    let mut used = Vec::new();
    if let Some((name, tz)) = series_zone(event) {
        let earliest = event
            .excluded_dates
            .iter()
            .map(|at| ms(*at))
            .fold(ms(event.start), i64::min);
        used.push((name, tz, earliest));
    }
    if let (Some((name, tz)), Some(at)) = (override_zone(event), event.recurrence_id) {
        used.push((name, tz, ms(at)));
    }
    used
}

/// A DATE-TIME's parameters and value: `;TZID=<zone>` with the wall time in a wall-clock zone, else UTC.
fn date_time_parts(zone: Option<&(String, TimeZone)>, at: i64) -> (String, String) {
    match (zone, Timestamp::from_millisecond(at)) {
        (Some((name, tz)), Ok(at)) => (format!(";TZID={name}"), vtimezone::local_stamp(tz, at)),
        _ => (String::new(), date_time_stamp(at)),
    }
}

fn rrule(rule: &RecurrenceRule) -> String {
    let mut segments = vec![format!("FREQ={}", rule.frequency.as_str().to_uppercase())];
    if rule.interval > 1 {
        segments.push(format!("INTERVAL={}", rule.interval));
    }
    if let Some(count) = rule.count.filter(|count| *count > 0) {
        segments.push(format!("COUNT={count}"));
    }
    if let Some(until) = rule.until.as_deref().and_then(js::parse_date_string) {
        segments.push(format!("UNTIL={}", date_time_stamp(until)));
    }
    let list = |values: &Option<Vec<i64>>,
                range: std::ops::RangeInclusive<i64>,
                render: &dyn Fn(i64) -> String| {
        let mut out: Vec<String> = Vec::new();
        for value in values
            .iter()
            .flatten()
            .filter(|value| range.contains(value))
        {
            let rendered = render(*value);
            if !out.contains(&rendered) {
                out.push(rendered);
            }
        }
        (!out.is_empty()).then(|| out.join(","))
    };
    let weekday = |day: i64| WEEKDAY_CODES[day as usize].to_owned();
    if let Some(days) = list(&rule.by_week_day, 0..=6, &weekday) {
        segments.push(format!("BYDAY={days}"));
    }
    if let Some(days) = list(&rule.by_month_day, 1..=31, &|day| day.to_string()) {
        segments.push(format!("BYMONTHDAY={days}"));
    }
    if let Some(months) = list(&rule.by_month, 1..=12, &|month| month.to_string()) {
        segments.push(format!("BYMONTH={months}"));
    }
    segments.join(";")
}

fn event_lines(
    lines: &mut Vec<String>,
    event: &Event,
    stamp: PrimitiveDateTime,
    calendar_timezone: Option<&str>,
) {
    let start = ms(event.start);
    let mut end = ms(event.end);
    if event.all_day {
        end = end.max(start);
    } else if end <= start {
        end = start + 3_600_000;
    }
    let uid = event
        .uid
        .as_deref()
        .map(js_trim)
        .filter(|uid| !uid.is_empty())
        .map_or_else(
            || format!("{}@solace-calendar.local", uuid::Uuid::new_v4()),
            str::to_owned,
        );
    let stamp = ms(stamp);
    let title = js_trim(&event.title);
    lines.extend([
        "BEGIN:VEVENT".to_owned(),
        format!("UID:{}", escape_text(&uid)),
        format!("DTSTAMP:{}", date_time_stamp(stamp)),
        format!(
            "CREATED:{}",
            date_time_stamp(event.created_at.map_or(stamp, ms))
        ),
        format!(
            "LAST-MODIFIED:{}",
            date_time_stamp(event.updated_at.map_or(stamp, ms))
        ),
        format!(
            "SUMMARY:{}",
            escape_text(if title.is_empty() {
                "Untitled Event"
            } else {
                title
            })
        ),
    ]);
    let zone = normalize_timezone(event.timezone.as_deref().or(calendar_timezone))
        .unwrap_or_else(|| "UTC".into());
    let series_zone = series_zone(event);
    let occurrence = |at: PrimitiveDateTime, wall: Option<&(String, TimeZone)>| {
        if event.all_day {
            (";VALUE=DATE".to_owned(), date_stamp_in(ms(at), &zone))
        } else {
            date_time_parts(wall, ms(at))
        }
    };
    if event.all_day {
        lines.push(format!(
            "DTSTART;VALUE=DATE:{}",
            date_stamp_in(start, &zone)
        ));
        lines.push(format!(
            "DTEND;VALUE=DATE:{}",
            next_day(&date_stamp_in(end, &zone))
        ));
    } else {
        let (params, value) = date_time_parts(series_zone.as_ref(), start);
        lines.push(format!("DTSTART{params}:{value}"));
        let (params, value) = date_time_parts(series_zone.as_ref(), end);
        lines.push(format!("DTEND{params}:{value}"));
    }
    if let Some(at) = event.recurrence_id {
        let (params, value) = occurrence(at, override_zone(event).as_ref());
        lines.push(format!("RECURRENCE-ID{params}:{value}"));
    }
    if let Some(description) = trimmed_text(event.description.as_deref()) {
        lines.push(format!("DESCRIPTION:{}", escape_text(&description)));
    }
    if let Some(location) = trimmed_text(event.location.as_deref()) {
        lines.push(format!("LOCATION:{}", escape_text(&location)));
    }
    let participants = event.participants.as_deref().unwrap_or_default();
    let organizer = participants
        .iter()
        .find(|p| p.role == Some(ParticipantRole::Organizer) && !js_trim(&p.email).is_empty());
    if let Some(organizer) = organizer {
        let name = trimmed_text(organizer.display_name.as_deref())
            .map_or_else(String::new, |name| format!(";CN={}", escape_param(&name)));
        lines.push(format!(
            "ORGANIZER{name}:mailto:{}",
            sanitize_uri(js_trim(&organizer.email))
        ));
    }
    for participant in participants {
        let email = js_trim(&participant.email);
        if email.is_empty() || participant.role == Some(ParticipantRole::Organizer) {
            continue;
        }
        let mut params = Vec::new();
        if let Some(name) = trimmed_text(participant.display_name.as_deref()) {
            params.push(format!("CN={}", escape_param(&name)));
        }
        match participant.status {
            Some(ParticipantStatus::Accepted) => params.push("PARTSTAT=ACCEPTED".into()),
            Some(ParticipantStatus::Declined) => params.push("PARTSTAT=DECLINED".into()),
            Some(ParticipantStatus::Tentative) => params.push("PARTSTAT=TENTATIVE".into()),
            _ => params.extend(["PARTSTAT=NEEDS-ACTION".to_owned(), "RSVP=TRUE".to_owned()]),
        }
        lines.push(format!(
            "ATTENDEE;{}:mailto:{}",
            params.join(";"),
            sanitize_uri(email)
        ));
    }
    if let Some(status) = event.status {
        let status = match status {
            EventStatus::Confirmed => "CONFIRMED",
            EventStatus::Tentative => "TENTATIVE",
            EventStatus::Cancelled => "CANCELLED",
        };
        lines.push(format!("STATUS:{status}"));
    }
    if let Some(sequence) = event.sequence {
        lines.push(format!("SEQUENCE:{}", sequence.max(0)));
    }
    if let Some(url) = trimmed_text(event.source_url.as_deref()) {
        lines.push(format!("URL:{}", sanitize_uri(&url)));
    }
    if let Some(rule) = &event.recurrence {
        lines.push(format!("RRULE:{}", rrule(rule)));
        if let Some(first) = event.excluded_dates.first() {
            let (params, _) = occurrence(*first, series_zone.as_ref());
            let dates: Vec<String> = event
                .excluded_dates
                .iter()
                .map(|at| occurrence(*at, series_zone.as_ref()).1)
                .collect();
            lines.push(format!("EXDATE{params}:{}", dates.join(",")));
        }
    }
    lines.push("END:VEVENT".into());
}

#[cfg(test)]
pub(super) mod tests {
    use serde_json::Value;
    use time::macros::datetime;

    use super::*;
    use crate::integrations::ics::Frequency;

    fn event(title: &str) -> Event {
        Event {
            uid: Some("event-1@example.com".into()),
            title: title.into(),
            description: None,
            start: datetime!(2024-02-01 10:00:00),
            end: datetime!(2024-02-01 11:00:00),
            all_day: false,
            timezone: None,
            location: None,
            recurrence: None,
            created_at: None,
            updated_at: None,
            status: None,
            sequence: None,
            source_url: None,
            participants: None,
            recurrence_id: None,
            recurrence_zone: None,
            excluded_dates: Vec::new(),
        }
    }

    #[test]
    fn overrides_and_excluded_dates_follow_the_start_value_type() {
        let weekly = Some(RecurrenceRule {
            frequency: Frequency::Weekly,
            interval: 1,
            count: None,
            until: None,
            by_week_day: None,
            by_month_day: None,
            by_month: None,
            timezone: None,
        });
        let timed = Event {
            recurrence: weekly.clone(),
            excluded_dates: vec![
                datetime!(2024-02-08 10:00:00),
                datetime!(2024-02-15 10:00:00),
            ],
            ..event("Weekly")
        };
        let moved = Event {
            recurrence_id: Some(datetime!(2024-02-22 10:00:00)),
            ..event("Moved")
        };
        let all_day = Event {
            all_day: true,
            timezone: Some("Europe/Amsterdam".into()),
            start: datetime!(2024-01-31 23:00:00),
            end: datetime!(2024-02-01 22:59:59),
            recurrence: weekly,
            excluded_dates: vec![datetime!(2024-02-07 23:00:00)],
            ..event("All day")
        };
        let undated = Event {
            excluded_dates: vec![datetime!(2024-02-08 10:00:00)],
            ..event("Single")
        };
        let ics = build_calendar(&Calendar::default(), &[timed, moved, all_day, undated]);
        assert!(ics.contains("RRULE:FREQ=WEEKLY\r\nEXDATE:20240208T100000Z,20240215T100000Z\r\n"));
        assert!(ics.contains("DTEND:20240201T110000Z\r\nRECURRENCE-ID:20240222T100000Z\r\n"));
        assert!(ics.contains("EXDATE;VALUE=DATE:20240208\r\n"));
        assert_eq!(ics.matches("EXDATE").count(), 2, "only series carry EXDATE");
    }

    /// A weekly Amsterdam series that crosses the end of summer time.
    pub(crate) fn series_across_dst() -> Vec<Event> {
        let weekly = RecurrenceRule {
            frequency: Frequency::Weekly,
            interval: 1,
            count: Some(6),
            until: None,
            by_week_day: None,
            by_month_day: None,
            by_month: None,
            timezone: Some("Europe/Amsterdam".into()),
        };
        vec![
            Event {
                uid: Some("series@example.com".into()),
                start: datetime!(2026-10-19 07:00:00),
                end: datetime!(2026-10-19 08:00:00),
                timezone: Some("Europe/Amsterdam".into()),
                recurrence: Some(weekly),
                excluded_dates: vec![datetime!(2026-11-02 08:00:00)],
                ..event("Weekly")
            },
            Event {
                uid: Some("series@example.com".into()),
                start: datetime!(2026-11-09 13:00:00),
                end: datetime!(2026-11-09 14:00:00),
                timezone: Some("Europe/Amsterdam".into()),
                recurrence_id: Some(datetime!(2026-11-09 08:00:00)),
                recurrence_zone: Some("Europe/Amsterdam".into()),
                ..event("Moved")
            },
        ]
    }

    #[test]
    fn zoned_series_keep_wall_clock_time_across_dst() {
        let ics = build_calendar(&Calendar::default(), &series_across_dst());
        for line in [
            "DTSTART;TZID=Europe/Amsterdam:20261019T090000\r\nDTEND;TZID=Europe/Amsterdam:20261019T100000\r\n",
            "EXDATE;TZID=Europe/Amsterdam:20261102T090000\r\n",
            "DTSTART:20261109T130000Z\r\nDTEND:20261109T140000Z\r\nRECURRENCE-ID;TZID=Europe/Amsterdam:20261109T090000\r\n",
        ] {
            assert!(ics.contains(line), "{line} in {ics}");
        }
        assert_eq!(
            ics.matches("BEGIN:VTIMEZONE\r\nTZID:Europe/Amsterdam\r\n")
                .count(),
            1
        );
        assert!(
            ics.find("END:VTIMEZONE") < ics.find("BEGIN:VEVENT"),
            "{ics}"
        );
        let utc = build_calendar(
            &Calendar::default(),
            &[Event {
                timezone: Some("Europe/Amsterdam".into()),
                ..event("Rule without a zone")
            }],
        );
        assert!(!utc.contains("VTIMEZONE") && utc.contains("DTSTART:20240201T100000Z"));
    }

    #[test]
    fn url_properties_keep_uri_characters_unescaped() {
        let url = "https://example.com/calendar?tag=a,b;value=1";
        let calendar = Calendar {
            name: Some("Linked Calendar".into()),
            source_url: Some(url.into()),
            ..Calendar::default()
        };
        let ics = build_calendar(
            &calendar,
            &[Event {
                source_url: Some(url.into()),
                ..event("Linked Event")
            }],
        )
        .replace("\r\n ", "");
        assert!(ics.contains(&format!("URL:{url}\r\n")));
        assert!(!ics.contains("URL:https://example.com/calendar?tag=a\\,b\\;value=1"));
    }

    #[test]
    fn long_lines_fold_at_octets_and_missing_uids_are_generated() {
        let ics = build_calendar(
            &Calendar::default(),
            &[Event {
                uid: None,
                description: Some("é".repeat(100)),
                ..event("Planning")
            }],
        );
        assert!(ics.split("\r\n").all(|line| line.len() <= 75), "{ics}");
        assert!(ics.contains("@solace-calendar.local\r\n"));
        assert!(ics.ends_with("END:VEVENT\r\nEND:VCALENDAR\r\n"));
    }

    pub(crate) fn date(value: &Value) -> Option<PrimitiveDateTime> {
        let ms = js::parse_date_string(value.as_str()?)?;
        let moment =
            time::OffsetDateTime::from_unix_timestamp_nanos(i128::from(ms) * 1_000_000).ok()?;
        Some(PrimitiveDateTime::new(moment.date(), moment.time()))
    }

    fn text(value: &Value) -> Option<String> {
        value.as_str().map(str::to_owned)
    }

    fn numbers(value: &Value) -> Option<Vec<i64>> {
        value
            .as_array()
            .map(|items| items.iter().filter_map(Value::as_i64).collect())
    }

    pub(crate) fn participants_from(value: &Value) -> Option<Vec<Participant>> {
        value.as_array().map(|items| {
            items
                .iter()
                .map(|p| Participant {
                    email: text(&p["email"]).unwrap_or_default(),
                    display_name: text(&p["displayName"]),
                    role: match p["role"].as_str() {
                        Some("organizer") => Some(ParticipantRole::Organizer),
                        Some("attendee") => Some(ParticipantRole::Attendee),
                        _ => None,
                    },
                    status: p["status"].as_str().and_then(ParticipantStatus::parse),
                })
                .collect()
        })
    }

    fn event_from(value: &Value) -> Event {
        let rule = &value["recurrence"];
        Event {
            uid: text(&value["uid"]),
            title: text(&value["title"]).unwrap_or_default(),
            description: text(&value["description"]),
            start: date(&value["start"]).expect("start"),
            end: date(&value["end"]).expect("end"),
            all_day: value["allDay"].as_bool().unwrap_or(false),
            timezone: text(&value["timezone"]),
            location: text(&value["location"]),
            recurrence: rule["frequency"]
                .as_str()
                .and_then(Frequency::parse)
                .map(|frequency| RecurrenceRule {
                    frequency,
                    interval: rule["interval"].as_i64().unwrap_or(1),
                    count: rule["count"].as_i64(),
                    until: text(&rule["until"]),
                    by_week_day: numbers(&rule["byWeekDay"]),
                    by_month_day: numbers(&rule["byMonthDay"]),
                    by_month: numbers(&rule["byMonth"]),
                    timezone: text(&rule["timezone"]),
                }),
            created_at: date(&value["createdAt"]),
            updated_at: date(&value["updatedAt"]),
            status: match value["status"].as_str() {
                Some("CONFIRMED") => Some(EventStatus::Confirmed),
                Some("TENTATIVE") => Some(EventStatus::Tentative),
                Some("CANCELLED") => Some(EventStatus::Cancelled),
                _ => None,
            },
            sequence: value["sequence"].as_i64(),
            source_url: text(&value["sourceUrl"]),
            participants: participants_from(&value["participants"]),
            recurrence_id: None,
            recurrence_zone: None,
            excluded_dates: Vec::new(),
        }
    }

    pub(crate) fn calendar_from(value: &Value) -> Calendar {
        Calendar {
            name: text(&value["name"]),
            description: text(&value["description"]),
            timezone: text(&value["timezone"]),
            method: value["method"].as_str().and_then(|method| {
                ["PUBLISH", "REQUEST", "REPLY", "CANCEL"]
                    .into_iter()
                    .find(|m| *m == method)
            }),
            product_id: text(&value["productId"]),
            source_url: text(&value["sourceUrl"]),
        }
    }

    /// `buildIcsCalendar` outputs from the TypeScript package, byte for byte, at a fixed DTSTAMP.
    #[test]
    fn calendars_build_byte_for_byte_like_typescript() {
        let directory = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/ics/builder");
        let cases: Value = serde_json::from_str(
            &std::fs::read_to_string(format!("{directory}/cases.json")).expect("cases"),
        )
        .expect("cases json");
        let stamp = date(&cases["dtstamp"]).expect("dtstamp");
        for case in cases["cases"].as_array().expect("cases") {
            let name = case["name"].as_str().expect("name");
            let events: Vec<Event> = case["events"]
                .as_array()
                .expect("events")
                .iter()
                .map(event_from)
                .collect();
            let actual = build_calendar_at(&calendar_from(&case["calendar"]), &events, stamp);
            let expected =
                std::fs::read_to_string(format!("{directory}/{name}.ics")).expect("golden");
            assert_eq!(actual, expected, "{name}");
        }
    }
}
