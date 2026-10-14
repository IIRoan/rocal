//! `buildIcsCalendar` and `buildIcsEventFile`: the ICS Solace writes for exports, public feeds, invitations and RSVP replies.

use time::PrimitiveDateTime;

use super::{
    DEFAULT_METHOD, Participant, ParticipantRole, ParticipantStatus, RecurrenceRule, js,
    normalize_timezone, zones,
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
    let trimmed = |value: &Option<String>| {
        value
            .as_deref()
            .map(js_trim)
            .filter(|v| !v.is_empty())
            .map(str::to_owned)
    };
    let mut lines = vec![
        "BEGIN:VCALENDAR".to_owned(),
        "VERSION:2.0".into(),
        format!(
            "PRODID:{}",
            trimmed(&calendar.product_id)
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
            escape_text(trimmed(&calendar.name).as_deref().unwrap_or("Calendar"))
        ),
    ];
    if let Some(description) = trimmed(&calendar.description) {
        lines.push(format!("X-WR-CALDESC:{}", escape_text(&description)));
    }
    if let Some(timezone) = trimmed(&calendar.timezone) {
        lines.push(format!("X-WR-TIMEZONE:{}", escape_text(&timezone)));
    }
    if let Some(url) = trimmed(&calendar.source_url) {
        lines.push(format!("URL:{}", sanitize_uri(&url)));
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
    if event.all_day {
        let zone = event.timezone.as_deref().or(calendar_timezone);
        let zone = normalize_timezone(zone).unwrap_or_else(|| "UTC".into());
        lines.push(format!(
            "DTSTART;VALUE=DATE:{}",
            date_stamp_in(start, &zone)
        ));
        lines.push(format!(
            "DTEND;VALUE=DATE:{}",
            next_day(&date_stamp_in(end, &zone))
        ));
    } else {
        lines.push(format!("DTSTART:{}", date_time_stamp(start)));
        lines.push(format!("DTEND:{}", date_time_stamp(end)));
    }
    let present = |value: &Option<String>| {
        value
            .as_deref()
            .map(js_trim)
            .filter(|v| !v.is_empty())
            .map(str::to_owned)
    };
    if let Some(description) = present(&event.description) {
        lines.push(format!("DESCRIPTION:{}", escape_text(&description)));
    }
    if let Some(location) = present(&event.location) {
        lines.push(format!("LOCATION:{}", escape_text(&location)));
    }
    let participants = event.participants.as_deref().unwrap_or_default();
    let organizer = participants
        .iter()
        .find(|p| p.role == Some(ParticipantRole::Organizer) && !js_trim(&p.email).is_empty());
    if let Some(organizer) = organizer {
        let name = present(&organizer.display_name)
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
        if let Some(name) = present(&participant.display_name) {
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
    if let Some(url) = present(&event.source_url) {
        lines.push(format!("URL:{}", sanitize_uri(&url)));
    }
    if let Some(rule) = &event.recurrence {
        lines.push(format!("RRULE:{}", rrule(rule)));
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
        }
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
