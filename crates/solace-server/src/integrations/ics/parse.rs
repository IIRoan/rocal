//! Feed and invitation parsing: `parseICSFile` (`@workspace/calendar-ics/parse-ics` behind `lib/ics-parser.ts`) and the sync comparisons.

use std::collections::HashMap;
use std::sync::LazyLock;

use regex_lite::Regex;
use time::PrimitiveDateTime;

use super::reader::{self, Obj, Val};
use super::{
    Frequency, Participant, ParticipantRole, ParticipantStatus, RecurrenceRule, external_id, js,
    normalize_email, normalize_timezone, resolve_timezone, zones,
};
use crate::http::zod::js_trim;
use crate::instant;

const HOUR_MS: i64 = 3_600_000;
const NAME_KEYS: [&str; 5] = [
    "WR-CALNAME",
    "X-WR-CALNAME",
    "x-wr-calname",
    "name",
    "title",
];
const DESCRIPTION_KEYS: [&str; 4] = ["WR-CALDESC", "X-WR-CALDESC", "x-wr-caldesc", "description"];
const TIMEZONE_KEYS: [&str; 3] = ["WR-TIMEZONE", "X-WR-TIMEZONE", "x-wr-timezone"];

static GOOGLE_SEPARATOR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^-[-:~]{10,}$").unwrap_or_else(|error| panic!("separator pattern: {error}"))
});
static BLANK_RUNS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\n{3,}").unwrap_or_else(|error| panic!("blank pattern: {error}"))
});

/// `IcsParseResult`.
#[derive(Debug, Clone, PartialEq)]
pub struct ParseResult {
    pub events: Vec<ParsedEvent>,
    pub errors: Vec<String>,
    pub method: &'static str,
    pub calendar_name: Option<String>,
    pub calendar_description: Option<String>,
    pub calendar_timezone: Option<String>,
}

/// `ParsedIcsEvent`; instants are UTC with millisecond precision.
#[derive(Debug, Clone, PartialEq)]
pub struct ParsedEvent {
    /// The UID, plus `::RECURRENCE::<instant>` for an override.
    pub uid: String,
    pub source_uid: String,
    pub recurrence_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub start: PrimitiveDateTime,
    pub end: PrimitiveDateTime,
    pub all_day: bool,
    pub location: Option<String>,
    pub recurrence: Option<RecurrenceRule>,
    pub timezone: Option<String>,
    pub participants: Option<Vec<Participant>>,
}

/// `parseICSFile` in `lib/ics-parser.ts`: the package parser, with Google's invite boilerplate removed from descriptions.
pub fn parse(content: &str, user_timezone: &str) -> ParseResult {
    let mut result = ParseResult {
        events: Vec::new(),
        errors: Vec::new(),
        method: super::calendar_method(content),
        calendar_name: None,
        calendar_description: None,
        calendar_timezone: None,
    };
    let root = match reader::parse(content) {
        Ok(root) => root,
        Err(message) => {
            result
                .errors
                .push(format!("Failed to parse ICS file: {message}"));
            return result;
        }
    };
    for calendar in root.values().filter_map(Val::as_obj) {
        if calendar.kind() != Some("VCALENDAR") {
            continue;
        }
        let first = |keys: &[&str]| {
            keys.iter().find_map(|key| match calendar.get(key) {
                Some(Val::Str(text)) if !js_trim(text).is_empty() => Some(js_trim(text).to_owned()),
                _ => None,
            })
        };
        result.calendar_name = result.calendar_name.or_else(|| first(&NAME_KEYS));
        result.calendar_description = result
            .calendar_description
            .or_else(|| first(&DESCRIPTION_KEYS));
        result.calendar_timezone = result
            .calendar_timezone
            .or_else(|| normalize_timezone(first(&TIMEZONE_KEYS).as_deref()));
    }
    let mut positions: HashMap<String, usize> = HashMap::new();
    for event in root.values().filter_map(Val::as_obj) {
        if event.kind() != Some("VEVENT") {
            continue;
        }
        let overrides = match event.get("recurrences") {
            Some(Val::Obj(recurrences)) => recurrences.values().filter_map(Val::as_obj).collect(),
            _ => Vec::new(),
        };
        for candidate in std::iter::once(event).chain(overrides) {
            match parse_event(
                candidate,
                user_timezone,
                result.calendar_timezone.as_deref(),
            ) {
                Ok(Some(mut parsed)) => {
                    parsed.description = clean_invite_description(parsed.description.as_deref());
                    match positions.get(&parsed.uid) {
                        Some(&at) => result.events[at] = parsed,
                        None => {
                            positions.insert(parsed.uid.clone(), result.events.len());
                            result.events.push(parsed);
                        }
                    }
                }
                Ok(None) => {}
                Err(message) => {
                    let uid = candidate
                        .get("uid")
                        .filter(|uid| uid.truthy())
                        .map_or_else(|| "unknown".into(), Val::js_string);
                    let recurrence_id =
                        date_value(candidate.get("recurrenceid")).map(js::iso_string);
                    let id = external_id(&uid, recurrence_id.as_deref());
                    result
                        .errors
                        .push(format!("Failed to parse event {id}: {message}"));
                }
            }
        }
    }
    result
}

/// `getTextValue`: a trimmed, non-empty string or `{ val }`.
fn text_value(value: Option<&Val>) -> Option<String> {
    let text = match value? {
        Val::Str(text) | Val::Param(_, text) => js_trim(text),
        _ => return None,
    };
    (!text.is_empty()).then(|| text.to_owned())
}

/// `coerceDate`: a valid `Date`, or a string `new Date` accepts.
fn date_value(value: Option<&Val>) -> Option<i64> {
    match value? {
        Val::Date(date) => date.ms,
        Val::Str(text) => js::parse_date_string(text),
        _ => None,
    }
}

fn utc(ms: i64) -> Option<PrimitiveDateTime> {
    let moment =
        time::OffsetDateTime::from_unix_timestamp_nanos(i128::from(ms) * 1_000_000).ok()?;
    Some(PrimitiveDateTime::new(moment.date(), moment.time()))
}

/// `getEventTimezone`: the start's (else the end's) TZID; floating times have none.
fn event_timezone(event: &Obj) -> Option<String> {
    let zone = |key| match event.get(key) {
        Some(Val::Date(date)) => date.tz.as_deref().filter(|tz| !js_trim(tz).is_empty()),
        _ => None,
    };
    zone("start")
        .or_else(|| zone("end"))
        .and_then(|tz| normalize_timezone(Some(tz)))
}

/// `buildUtcDateFromTimeZoneDateParts`: the first (or last) millisecond of a calendar day in `zone`.
fn day_boundary(
    year: i64,
    month: i64,
    day: i64,
    zone: &str,
    end_of_day: bool,
) -> Result<i64, String> {
    let resolved = normalize_timezone(Some(zone)).unwrap_or_else(|| "UTC".into());
    let tz = zones::lookup(&resolved).ok_or_else(|| format!("invalid time zone: {resolved}"))?;
    let (hour, minute, second, millisecond) = if end_of_day {
        (23, 59, 59, 999)
    } else {
        (0, 0, 0, 0)
    };
    let guess = js::date_utc(year, month - 1, day, hour, minute, second)
        .map(|ms| ms + millisecond)
        .ok_or("Invalid Date")?;
    let offset = |ms: i64| zones::offset_ms(&tz, ms).ok_or_else(|| "Invalid Date".to_owned());
    let initial = offset(guess)?;
    let mut normalized = guess - initial;
    let adjusted = offset(normalized)?;
    if adjusted != initial {
        normalized = guess - adjusted;
    }
    if end_of_day {
        normalized = normalized - normalized.rem_euclid(1000) + 999;
    }
    Ok(normalized)
}

/// `normalizeAllDayRange`: DATE values span whole days in the user's zone; DTEND is exclusive.
fn all_day_range(start: i64, end: i64, zone: &str) -> Result<(i64, i64), String> {
    let first = js::fields(start);
    let last = if end > start {
        js::fields(end - js::MS_PER_DAY)
    } else {
        first
    };
    Ok((
        day_boundary(first.year, first.month, first.day, zone, false)?,
        day_boundary(last.year, last.month, last.day, zone, true)?,
    ))
}

fn positive_int(value: f64) -> Option<i64> {
    (value.is_finite() && value > 0.0).then(|| value.floor() as i64)
}

/// `parseRecurrenceRule`: only what node-ical's options expose under the names parse-ics reads (BYMONTH and BYMONTHDAY never are).
fn recurrence_rule(value: Option<&Val>) -> Option<RecurrenceRule> {
    let Some(Val::Rrule(options)) = value else {
        return None;
    };
    let frequency = match options.freq.as_str() {
        "YEARLY" => Frequency::Yearly,
        "MONTHLY" => Frequency::Monthly,
        "WEEKLY" => Frequency::Weekly,
        "DAILY" => Frequency::Daily,
        _ => return None,
    };
    let mut by_week_day: Vec<i64> = Vec::new();
    for token in options.by_day.iter().flatten() {
        let code = if token.len() >= 2 {
            &token[token.len() - 2..]
        } else {
            token.as_str()
        };
        let index = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"]
            .iter()
            .position(|day| day.eq_ignore_ascii_case(code));
        if let Some(index) = index.map(|i| i as i64)
            && !by_week_day.contains(&index)
        {
            by_week_day.push(index);
        }
    }
    Some(RecurrenceRule {
        frequency,
        interval: positive_int(options.interval).unwrap_or(1),
        count: options.count.and_then(positive_int),
        until: options.until_ms.map(js::iso_string),
        by_week_day: (!by_week_day.is_empty()).then_some(by_week_day),
        by_month_day: None,
        by_month: None,
        timezone: normalize_timezone(Some(&options.tzid)),
    })
}

/// `getParameterValue`: a parameter of an ORGANIZER/ATTENDEE value, read from the value itself or its `params`.
fn parameter(value: &Val, keys: &[&str]) -> Option<String> {
    let sources: Vec<&Obj> = match value {
        Val::Param(params, _) => vec![params],
        Val::Obj(obj) => std::iter::once(&**obj)
            .chain(
                ["params", "parameters"]
                    .iter()
                    .filter_map(|key| obj.get(key).and_then(Val::as_obj)),
            )
            .collect(),
        _ => return None,
    };
    sources.iter().find_map(|source| {
        keys.iter().find_map(|key| {
            text_value(source.get(key)).or_else(|| text_value(source.get(&key.to_lowercase())))
        })
    })
}

/// `parseParticipantValue`.
fn participant(value: &Val, organizer: bool) -> Option<Participant> {
    if !value.truthy() {
        return None;
    }
    let email = match value {
        Val::Str(text) => normalize_email(text),
        Val::Param(_, text) => normalize_email(js_trim(text)),
        Val::Obj(obj) => text_value(obj.get("val").or(obj.get("email")))
            .map(|text| normalize_email(&text))
            .unwrap_or_default(),
        _ => String::new(),
    };
    if email.is_empty() {
        return None;
    }
    let display_name = parameter(value, &["CN", "name"]);
    let part_stat = parameter(value, &["PARTSTAT", "status"]).map(|s| s.to_uppercase());
    let role =
        if organizer || parameter(value, &["ROLE"]).is_some_and(|r| r.to_uppercase() == "CHAIR") {
            ParticipantRole::Organizer
        } else {
            ParticipantRole::Attendee
        };
    let status = match (role, part_stat.as_deref()) {
        (ParticipantRole::Organizer, _) | (_, Some("ACCEPTED")) => ParticipantStatus::Accepted,
        (_, Some("DECLINED")) => ParticipantStatus::Declined,
        (_, Some("TENTATIVE")) => ParticipantStatus::Tentative,
        _ => ParticipantStatus::Pending,
    };
    Some(Participant {
        email,
        display_name,
        role: Some(role),
        status: Some(status),
    })
}

/// `collectParticipants`: the organizer and attendees, one per address, an organizer anywhere winning.
fn participants(event: &Obj) -> Option<Vec<Participant>> {
    let mut found: Vec<Participant> = Vec::new();
    let mut add = |next: Option<Participant>| {
        let Some(next) = next else {
            return;
        };
        let Some(existing) = found.iter_mut().find(|p| p.email == next.email) else {
            found.push(next);
            return;
        };
        let organizer = existing.role == Some(ParticipantRole::Organizer)
            || next.role == Some(ParticipantRole::Organizer);
        *existing = Participant {
            display_name: next.display_name.or(existing.display_name.take()),
            role: Some(if organizer {
                ParticipantRole::Organizer
            } else {
                ParticipantRole::Attendee
            }),
            status: if organizer {
                Some(ParticipantStatus::Accepted)
            } else {
                next.status.or(existing.status)
            },
            email: next.email,
        };
    };
    if let Some(organizer) = event.get("organizer") {
        add(participant(organizer, true));
    }
    let attendees: Vec<&Val> = match event.get("attendee") {
        Some(Val::List(items)) => items.iter().collect(),
        Some(Val::Obj(obj)) if obj.get("val").is_none() => obj.values().collect(),
        Some(value) if value.truthy() => vec![value],
        _ => Vec::new(),
    };
    for attendee in attendees {
        add(participant(attendee, false));
    }
    (!found.is_empty()).then_some(found)
}

/// `parseVEvent`: `None` when the UID, SUMMARY or DTSTART is missing or unreadable.
fn parse_event(
    event: &Obj,
    user_timezone: &str,
    calendar_timezone: Option<&str>,
) -> Result<Option<ParsedEvent>, String> {
    let Some(source_uid) = text_value(event.get("uid")) else {
        return Ok(None);
    };
    let Some(title) = text_value(event.get("summary")) else {
        return Ok(None);
    };
    let Some(mut start) = date_value(event.get("start")) else {
        return Ok(None);
    };
    let date_only_start = matches!(event.get("start"), Some(Val::Date(date)) if date.date_only);
    let all_day =
        matches!(event.get("datetype"), Some(Val::Str(kind)) if kind == "date") || date_only_start;
    let all_day_timezone = normalize_timezone(Some(user_timezone)).unwrap_or_else(|| "UTC".into());
    let mut end = date_value(event.get("end"))
        .unwrap_or(start + if all_day { js::MS_PER_DAY } else { HOUR_MS });
    if all_day {
        (start, end) = all_day_range(start, end, &all_day_timezone)?;
    }
    let recurrence_id = date_value(event.get("recurrenceid")).map(js::iso_string);
    let timezone = event_timezone(event).or_else(|| {
        if all_day {
            Some(all_day_timezone.clone())
        } else if let Some(calendar) = calendar_timezone {
            normalize_timezone(Some(calendar))
        } else {
            Some(user_timezone.to_owned())
        }
    });
    let mut recurrence = recurrence_rule(event.get("rrule"));
    if let Some(rule) = recurrence.as_mut().filter(|rule| rule.timezone.is_none()) {
        rule.timezone = timezone.clone().filter(|tz| !tz.is_empty());
    }
    // ponytail: instants beyond year 9999 (only reachable through field rollover) are skipped; widen if a feed ever needs them.
    let (Some(start), Some(end)) = (utc(start), utc(end)) else {
        return Ok(None);
    };
    Ok(Some(ParsedEvent {
        uid: external_id(&source_uid, recurrence_id.as_deref()),
        source_uid,
        recurrence_id,
        title,
        description: text_value(event.get("description")),
        start,
        end,
        all_day,
        location: text_value(event.get("location")),
        recurrence,
        timezone,
        participants: participants(event),
    }))
}

/// `cleanInviteDescriptionText`: Google's separator lines and "Please do not edit this section." go; the rest stays.
fn clean_invite_description(value: Option<&str>) -> Option<String> {
    let value = value.filter(|value| !value.is_empty())?;
    let normalized = value.replace("\r\n", "\n").replace('\r', "\n");
    let kept: Vec<&str> = normalized
        .split('\n')
        .filter(|line| {
            let line = js_trim(line);
            line.is_empty()
                || !(GOOGLE_SEPARATOR.is_match(line)
                    || line.get(..32).is_some_and(|head| {
                        head.eq_ignore_ascii_case("Please do not edit this section.")
                    }))
        })
        .collect();
    let joined = BLANK_RUNS
        .replace_all(&kept.join("\n"), "\n\n")
        .into_owned();
    let cleaned = js_trim(&joined);
    (!cleaned.is_empty()).then(|| cleaned.to_owned())
}

/// `convertParsedEventToCalendarEvent`: the plaintext row a feed sync creates.
#[derive(Debug, Clone, PartialEq)]
pub struct NewEvent {
    pub title: String,
    pub description: Option<String>,
    pub start: PrimitiveDateTime,
    pub end: PrimitiveDateTime,
    pub all_day: bool,
    pub location: Option<String>,
    /// `JSON.stringify` of the rule.
    pub recurrence: Option<String>,
    pub timezone: String,
    pub is_synced: bool,
    pub external_id: String,
    pub subscription_id: Option<String>,
    pub synced_at: Option<PrimitiveDateTime>,
    pub user_id: String,
    pub calendar_id: String,
}

pub fn to_new_event(
    parsed: &ParsedEvent,
    user_id: &str,
    calendar_id: &str,
    subscription_id: Option<&str>,
) -> NewEvent {
    NewEvent {
        title: parsed.title.clone(),
        description: parsed.description.clone(),
        start: parsed.start,
        end: parsed.end,
        all_day: parsed.all_day,
        location: parsed.location.clone(),
        recurrence: parsed.recurrence.as_ref().map(RecurrenceRule::to_json),
        timezone: resolve_timezone(parsed.timezone.as_deref()),
        is_synced: subscription_id.is_some(),
        external_id: parsed.uid.clone(),
        subscription_id: subscription_id.map(str::to_owned),
        synced_at: subscription_id.map(|_| instant::now()),
        user_id: user_id.to_owned(),
        calendar_id: calendar_id.to_owned(),
    }
}

/// The stored columns `isEventModified` compares.
#[derive(Debug, Clone, Copy)]
pub struct StoredEvent<'a> {
    pub title: &'a str,
    pub description: Option<&'a str>,
    pub start: PrimitiveDateTime,
    pub end: PrimitiveDateTime,
    pub all_day: bool,
    pub location: Option<&'a str>,
    pub recurrence: Option<&'a str>,
    pub timezone: &'a str,
}

/// `isEventModified`: a feed without a zone for the event never counts as a zone change.
pub fn is_modified(existing: &StoredEvent<'_>, parsed: &ParsedEvent) -> bool {
    let recurrence = parsed.recurrence.as_ref().map(RecurrenceRule::to_json);
    let non_empty = |value: &Option<String>| value.clone().filter(|v| !v.is_empty());
    existing.title != parsed.title
        || existing.description.map(str::to_owned) != non_empty(&parsed.description)
        || existing.start != parsed.start
        || existing.end != parsed.end
        || existing.all_day != parsed.all_day
        || existing.location.map(str::to_owned) != non_empty(&parsed.location)
        || existing.recurrence.map(str::to_owned) != recurrence
        || parsed.timezone.as_deref().is_some_and(|tz| {
            !js_trim(tz).is_empty() && existing.timezone != resolve_timezone(Some(tz))
        })
}

/// A stored `event_participant` row as `areParsedEventParticipantsDifferent` reads it.
#[derive(Debug, Clone, Copy)]
pub struct StoredParticipant<'a> {
    pub email: &'a str,
    pub display_name: Option<&'a str>,
    pub role: &'a str,
    pub status: &'a str,
}

/// `areParsedEventParticipantsDifferent`; both lists sort by the same key, so only their contents decide.
pub fn participants_differ(
    existing: &[StoredParticipant<'_>],
    parsed: Option<&[Participant]>,
) -> bool {
    let name = |name: Option<&str>| name.map(js_trim).unwrap_or_default().to_owned();
    let mut stored: Vec<(String, String, String, String)> = existing
        .iter()
        .map(|p| {
            (
                normalize_email(p.email),
                name(p.display_name),
                p.role.to_owned(),
                p.status.to_owned(),
            )
        })
        .collect();
    let mut incoming: Vec<(String, String, String, String)> = parsed
        .unwrap_or_default()
        .iter()
        .map(|p| {
            let role = p.role.unwrap_or(ParticipantRole::Attendee);
            let status = if p.role == Some(ParticipantRole::Organizer) {
                ParticipantStatus::Accepted
            } else {
                p.status.unwrap_or(ParticipantStatus::Pending)
            };
            (
                normalize_email(&p.email),
                name(p.display_name.as_deref()),
                role.as_str().to_owned(),
                status.as_str().to_owned(),
            )
        })
        .collect();
    stored.sort_by(|a, b| a.0.cmp(&b.0));
    incoming.sort_by(|a, b| a.0.cmp(&b.0));
    stored != incoming
}

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};
    use time::macros::datetime;

    use super::*;

    fn parsed_event() -> ParsedEvent {
        ParsedEvent {
            uid: "uid-1".into(),
            source_uid: "uid-1".into(),
            recurrence_id: None,
            title: "Imported event".into(),
            description: None,
            start: datetime!(2024-02-01 10:00:00),
            end: datetime!(2024-02-01 11:00:00),
            all_day: false,
            location: None,
            recurrence: None,
            timezone: None,
            participants: None,
        }
    }

    fn stored() -> StoredEvent<'static> {
        StoredEvent {
            title: "Imported event",
            description: None,
            start: datetime!(2024-02-01 10:00:00),
            end: datetime!(2024-02-01 11:00:00),
            all_day: false,
            location: None,
            recurrence: None,
            timezone: "UTC",
        }
    }

    fn weekly() -> RecurrenceRule {
        RecurrenceRule {
            frequency: Frequency::Weekly,
            interval: 1,
            count: None,
            until: None,
            by_week_day: None,
            by_month_day: None,
            by_month: None,
            timezone: None,
        }
    }

    #[test]
    fn google_invite_boilerplate_is_stripped() {
        let ics = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "BEGIN:VEVENT",
            "UID:event-2",
            "DTSTART:20240201T100000Z",
            "DTEND:20240201T110000Z",
            "SUMMARY:Imported event",
            "DESCRIPTION:Planning sync\\n-::~:~::~:~:~:~:~:~:~:~:~:~\\nJoin with Google Meet: https://meet.google.com/jvo-kwba-ijs\\nPlease do not edit this section.",
            "END:VEVENT",
            "END:VCALENDAR",
        ]
        .join("\r\n");
        let result = parse(&ics, "UTC");
        assert_eq!(
            result.events[0].description.as_deref(),
            Some("Planning sync\nJoin with Google Meet: https://meet.google.com/jvo-kwba-ijs")
        );
    }

    #[test]
    fn create_input_without_subscription_uses_default_timezone() {
        let event = ParsedEvent {
            uid: "uid-2".into(),
            source_uid: "uid-2".into(),
            all_day: true,
            ..parsed_event()
        };
        let input = to_new_event(&event, "user-1", "calendar-1", None);
        assert_eq!(
            input,
            NewEvent {
                title: "Imported event".into(),
                description: None,
                start: datetime!(2024-02-01 10:00:00),
                end: datetime!(2024-02-01 11:00:00),
                all_day: true,
                location: None,
                recurrence: None,
                timezone: "Europe/Amsterdam".into(),
                is_synced: false,
                external_id: "uid-2".into(),
                subscription_id: None,
                synced_at: None,
                user_id: "user-1".into(),
                calendar_id: "calendar-1".into(),
            }
        );
        let synced = to_new_event(
            &ParsedEvent {
                recurrence: Some(RecurrenceRule {
                    by_week_day: Some(vec![1, 3]),
                    ..weekly()
                }),
                timezone: Some("Europe/Amsterdam".into()),
                ..event
            },
            "user-1",
            "calendar-1",
            Some("subscription-1"),
        );
        assert_eq!(
            synced.recurrence.as_deref(),
            Some(r#"{"frequency":"weekly","interval":1,"byWeekDay":[1,3]}"#)
        );
        assert!(synced.is_synced && synced.synced_at.is_some());
        assert_eq!(synced.subscription_id.as_deref(), Some("subscription-1"));
    }

    #[test]
    fn missing_timezone_is_not_a_modification() {
        assert!(!is_modified(&stored(), &parsed_event()));
        let matching = ParsedEvent {
            description: Some("Imported description".into()),
            location: Some("HQ".into()),
            recurrence: Some(weekly()),
            timezone: Some("UTC".into()),
            ..parsed_event()
        };
        let existing = StoredEvent {
            description: Some("Imported description"),
            location: Some("HQ"),
            recurrence: Some(r#"{"frequency":"weekly","interval":1}"#),
            ..stored()
        };
        assert!(!is_modified(&existing, &matching));
    }

    #[test]
    fn modification_check_compares_nullable_fields_and_timezone() {
        let changed = ParsedEvent {
            description: Some("Changed".into()),
            location: Some("HQ".into()),
            recurrence: Some(weekly()),
            timezone: Some("Europe/Amsterdam".into()),
            ..parsed_event()
        };
        assert!(is_modified(&stored(), &changed));
        let zone_only = ParsedEvent {
            timezone: Some("Europe/Amsterdam".into()),
            ..parsed_event()
        };
        assert!(is_modified(&stored(), &zone_only));
        let blank = ParsedEvent {
            description: Some(String::new()),
            ..parsed_event()
        };
        assert!(
            !is_modified(&stored(), &blank),
            "an empty description is null"
        );
    }

    #[test]
    fn participant_lists_compare_normalized_and_unordered() {
        let existing = [
            StoredParticipant {
                email: "bob@example.com",
                display_name: None,
                role: "attendee",
                status: "pending",
            },
            StoredParticipant {
                email: "alice@example.com",
                display_name: Some("Alice"),
                role: "organizer",
                status: "accepted",
            },
        ];
        let parsed = [
            Participant {
                email: "alice@example.com".into(),
                display_name: Some("Alice".into()),
                role: Some(ParticipantRole::Organizer),
                status: None,
            },
            Participant {
                email: "bob@example.com".into(),
                display_name: None,
                role: Some(ParticipantRole::Attendee),
                status: Some(ParticipantStatus::Pending),
            },
        ];
        assert!(!participants_differ(&existing, Some(&parsed)));
    }

    #[test]
    fn participant_lists_differ_by_email() {
        let existing = [StoredParticipant {
            email: "alice@example.com",
            display_name: None,
            role: "attendee",
            status: "pending",
        }];
        let parsed = [Participant {
            email: "bob@example.com".into(),
            display_name: None,
            role: Some(ParticipantRole::Attendee),
            status: None,
        }];
        assert!(participants_differ(&existing, Some(&parsed)));
        assert!(participants_differ(&existing, None));
    }

    /// `JSON.stringify` of a result, as the golden files hold it.
    fn result_json(result: &ParseResult) -> Value {
        let mut out = json!({
            "events": result.events.iter().map(event_json).collect::<Vec<_>>(),
            "errors": result.errors,
            "method": result.method,
        });
        for (key, value) in [
            ("calendarName", &result.calendar_name),
            ("calendarDescription", &result.calendar_description),
            ("calendarTimezone", &result.calendar_timezone),
        ] {
            if let Some(value) = value {
                out[key] = json!(value);
            }
        }
        out
    }

    fn event_json(event: &ParsedEvent) -> Value {
        let mut out = json!({
            "uid": event.uid,
            "sourceUid": event.source_uid,
            "title": event.title,
            "start": instant::iso(event.start).0,
            "end": instant::iso(event.end).0,
            "allDay": event.all_day,
        });
        let optional = [
            (
                "recurrenceId",
                event.recurrence_id.as_ref().map(|v| json!(v)),
            ),
            ("description", event.description.as_ref().map(|v| json!(v))),
            ("location", event.location.as_ref().map(|v| json!(v))),
            ("recurrence", event.recurrence.as_ref().map(|v| json!(v))),
            (
                "recurrenceJson",
                event.recurrence.as_ref().map(|v| json!(v.to_json())),
            ),
            ("timezone", event.timezone.as_ref().map(|v| json!(v))),
            (
                "participants",
                event.participants.as_ref().map(|v| json!(v)),
            ),
        ];
        for (key, value) in optional {
            if let Some(value) = value {
                out[key] = value;
            }
        }
        out
    }

    /// Real feeds and node-ical/icalendar regression samples, parsed by the TypeScript backend under Bun 1.4 in UTC.
    #[test]
    fn real_feeds_parse_like_the_typescript_backend() {
        let directory = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/ics");
        let mut fixtures: Vec<_> = std::fs::read_dir(directory)
            .expect("fixture directory")
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| path.extension().is_some_and(|ext| ext == "ics"))
            .collect();
        fixtures.sort();
        assert!(fixtures.len() > 40, "fixtures: {}", fixtures.len());
        let mut failures = Vec::new();
        for path in fixtures {
            let content = std::fs::read_to_string(&path).expect("fixture");
            let golden: Value = serde_json::from_str(
                &std::fs::read_to_string(path.with_extension("parsed.json")).expect("golden"),
            )
            .expect("golden json");
            for (zone, expected) in golden.as_object().expect("zones") {
                let actual = result_json(&parse(&content, zone));
                if &actual != expected {
                    failures.push(format!(
                        "{} [{zone}]\n  expected: {expected}\n  actual:   {actual}",
                        path.display()
                    ));
                }
            }
        }
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }
}
