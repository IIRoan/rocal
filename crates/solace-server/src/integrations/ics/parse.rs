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
    /// The start of the occurrence an override replaces, as the series' instances start.
    pub occurrence: Option<PrimitiveDateTime>,
    /// EXDATE occurrences, as the series' instances start.
    pub excluded_dates: Vec<PrimitiveDateTime>,
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
    let root = match reader::parse(content, user_timezone) {
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

/// The zone an event or rule is stored in, never a label: `zones::iana_zone`, else `fallback` (the user's zone).
fn storable_zone(zone: Option<&str>, fallback: &str) -> String {
    zone.and_then(zones::iana_zone)
        .unwrap_or_else(|| fallback.to_owned())
}

/// An EXDATE or RECURRENCE-ID as the instance it names starts: a DATE at midnight in the all-day zone, a DATE-TIME as is.
fn occurrence_start(value: &Val, all_day_zone: &str) -> Option<PrimitiveDateTime> {
    let Val::Date(date) = value else {
        return None;
    };
    let ms = date.ms?;
    if !date.date_only {
        return instant::from_unix_millis(ms);
    }
    let day = js::fields(ms);
    instant::from_unix_millis(day_boundary(day.year, day.month, day.day, all_day_zone, false).ok()?)
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

/// `parseNumberArray`: the integers inside `[min, max]`, each once, or none.
fn numbers_within(values: Option<&Vec<f64>>, min: f64, max: f64) -> Option<Vec<i64>> {
    let mut kept: Vec<i64> = Vec::new();
    for value in values.into_iter().flatten() {
        if value.fract() == 0.0 && (min..=max).contains(value) && !kept.contains(&(*value as i64)) {
            kept.push(*value as i64);
        }
    }
    (!kept.is_empty()).then_some(kept)
}

/// `parseRecurrenceRule` over rrule-temporal's options, BYMONTHDAY and BYMONTH included (parse-ics read them under lowercase keys and lost them).
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
        by_month_day: numbers_within(options.by_month_day.as_ref(), 1.0, 31.0),
        by_month: numbers_within(options.by_month.as_ref(), 1.0, 12.0),
        timezone: normalize_timezone(Some(&options.tzid)),
    })
}

/// A DATE rule repeats on calendar days in the zone the all-day range was read in, through midnight of its UNTIL date there.
fn floating_dates(rule: &mut RecurrenceRule, zone: &str) -> Result<(), String> {
    rule.timezone = Some(zone.to_owned());
    if let Some(until) = rule.until.as_deref().and_then(js::parse_date_string) {
        let day = js::fields(until);
        rule.until = Some(js::iso_string(day_boundary(
            day.year, day.month, day.day, zone, false,
        )?));
    }
    Ok(())
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
        Val::Str(text) | Val::Param(_, text) => normalize_email(text),
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
    if let Some(Val::Str(message)) = event.get(reader::RRULE_ERROR) {
        return Err(message.clone());
    }
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
    let written = event_timezone(event).or_else(|| {
        if all_day {
            Some(all_day_timezone.clone())
        } else if let Some(calendar) = calendar_timezone {
            normalize_timezone(Some(calendar))
        } else {
            Some(user_timezone.to_owned())
        }
    });
    let timezone = Some(storable_zone(written.as_deref(), &all_day_timezone));
    let mut recurrence = recurrence_rule(event.get("rrule"));
    if let Some(rule) = recurrence.as_mut() {
        if all_day {
            floating_dates(rule, &all_day_timezone)?;
        } else {
            let zone = rule.timezone.take().or_else(|| timezone.clone());
            rule.timezone = Some(storable_zone(zone.as_deref(), &all_day_timezone));
        }
    }
    let excluded_dates = match event.get("exdate") {
        Some(Val::List(dates)) => dates
            .iter()
            .filter_map(|date| occurrence_start(date, &all_day_timezone))
            .collect(),
        _ => Vec::new(),
    };
    let occurrence = event
        .get("recurrenceid")
        .and_then(|date| occurrence_start(date, &all_day_timezone));
    // ponytail: instants beyond year 9999 (only reachable through field rollover) are skipped; widen if a feed ever needs them.
    let (Some(start), Some(end)) = (
        instant::from_unix_millis(start),
        instant::from_unix_millis(end),
    ) else {
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
        occurrence,
        excluded_dates,
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
            occurrence: None,
            excluded_dates: Vec::new(),
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

    fn feed(lines: &[&str]) -> String {
        let mut all = vec!["BEGIN:VCALENDAR", "VERSION:2.0"];
        all.extend_from_slice(lines);
        all.push("END:VCALENDAR");
        all.join("\r\n")
    }

    fn event<'a>(result: &'a ParseResult, uid: &str) -> &'a ParsedEvent {
        result
            .events
            .iter()
            .find(|event| event.uid == uid)
            .unwrap_or_else(|| panic!("{uid} in {result:?}"))
    }

    #[test]
    fn by_month_day_and_by_month_are_honored() {
        let result = parse(
            &feed(&[
                "BEGIN:VEVENT",
                "UID:yearly",
                "DTSTART:20240715T090000Z",
                "SUMMARY:Yearly",
                "RRULE:FREQ=YEARLY;BYMONTH=7,5L,13;BYMONTHDAY=15,15,-1,0,x",
                "END:VEVENT",
            ]),
            "UTC",
        );
        let rule = event(&result, "yearly").recurrence.as_ref().unwrap();
        assert_eq!(
            (rule.by_month_day.as_deref(), rule.by_month.as_deref()),
            (Some(&[15][..]), Some(&[7][..]))
        );
    }

    #[test]
    fn an_unreadable_rule_fails_only_its_event() {
        let result = parse(
            &feed(&[
                "BEGIN:VEVENT",
                "UID:fine",
                "DTSTART:20240101T080000Z",
                "SUMMARY:Fine",
                "END:VEVENT",
                "BEGIN:VEVENT",
                "UID:broken",
                "DTSTART:20240101T100000Z",
                "SUMMARY:Broken",
                "RRULE:FREQ=FORTNIGHTLY",
                "END:VEVENT",
                "BEGIN:VEVENT",
                "UID:revised",
                "DTSTART:20240102T100000Z",
                "SUMMARY:Revised",
                "RRULE:FREQ=FORTNIGHTLY",
                "SEQUENCE:1",
                "END:VEVENT",
                "BEGIN:VEVENT",
                "UID:revised",
                "DTSTART:20240102T100000Z",
                "SUMMARY:Revised",
                "RRULE:FREQ=WEEKLY",
                "SEQUENCE:2",
                "END:VEVENT",
            ]),
            "UTC",
        );
        let uids: Vec<&str> = result.events.iter().map(|e| e.uid.as_str()).collect();
        assert_eq!(uids, ["fine", "revised"]);
        assert_eq!(
            result.errors,
            ["Failed to parse event broken: Invalid FREQ value: FORTNIGHTLY"]
        );
        assert!(
            event(&result, "revised").recurrence.is_some(),
            "the newer rule wins"
        );
    }

    #[test]
    fn excluded_dates_and_overrides_name_their_instances() {
        let result = parse(
            &feed(&[
                "BEGIN:VEVENT",
                "UID:weekly",
                "DTSTART:20240101T090000Z",
                "SUMMARY:Weekly",
                "RRULE:FREQ=WEEKLY;COUNT=4",
                "EXDATE:20240108T090000Z,nonsense",
                "EXDATE;TZID=Europe/Amsterdam:20240115T100000",
                "END:VEVENT",
                "BEGIN:VEVENT",
                "UID:weekly",
                "RECURRENCE-ID:20240122T090000Z",
                "DTSTART:20240122T140000Z",
                "SUMMARY:Moved",
                "END:VEVENT",
                "BEGIN:VEVENT",
                "UID:daily",
                "DTSTART;VALUE=DATE:20240101",
                "SUMMARY:Daily",
                "RRULE:FREQ=DAILY;COUNT=3",
                "EXDATE;VALUE=DATE:20240102",
                "END:VEVENT",
            ]),
            "Europe/Amsterdam",
        );
        let iso = |dates: &[PrimitiveDateTime]| -> Vec<String> {
            dates.iter().map(|at| instant::iso(*at).0).collect()
        };
        assert_eq!(
            iso(&event(&result, "weekly").excluded_dates),
            ["2024-01-08T09:00:00.000Z", "2024-01-15T09:00:00.000Z"]
        );
        let moved = event(&result, "weekly::RECURRENCE::2024-01-22T09:00:00.000Z");
        assert_eq!(
            moved.occurrence.map(|at| instant::iso(at).0).as_deref(),
            Some("2024-01-22T09:00:00.000Z")
        );
        assert_eq!(
            iso(&event(&result, "daily").excluded_dates),
            ["2024-01-01T23:00:00.000Z"],
            "a DATE names midnight in the user's zone"
        );
    }

    #[test]
    fn a_repeated_dtstart_or_dtend_keeps_the_first() {
        let result = parse(
            &feed(&[
                "BEGIN:VEVENT",
                "UID:twice",
                "DTSTART:20240101T100000Z",
                "DTEND:20240101T110000Z",
                "DTSTART:20240102T100000Z",
                "DTEND:20240102T120000Z",
                "SUMMARY:Twice",
                "END:VEVENT",
            ]),
            "UTC",
        );
        assert!(result.errors.is_empty(), "{:?}", result.errors);
        let twice = event(&result, "twice");
        assert_eq!(
            (instant::iso(twice.start).0, instant::iso(twice.end).0),
            (
                "2024-01-01T10:00:00.000Z".to_owned(),
                "2024-01-01T11:00:00.000Z".to_owned()
            )
        );
    }

    #[test]
    fn an_override_replaces_its_instance_whatever_its_sequence() {
        let result = parse(
            &feed(&[
                "BEGIN:VEVENT",
                "UID:series",
                "DTSTART:20240101T090000Z",
                "SUMMARY:Series",
                "RRULE:FREQ=DAILY;COUNT=5",
                "SEQUENCE:3",
                "END:VEVENT",
                "BEGIN:VEVENT",
                "UID:series",
                "RECURRENCE-ID:20240102T150000Z",
                "DTSTART:20240102T160000Z",
                "SUMMARY:Afternoon",
                "SEQUENCE:2",
                "END:VEVENT",
                "BEGIN:VEVENT",
                "UID:series",
                "RECURRENCE-ID:20240102T090000Z",
                "DTSTART:20240102T100000Z",
                "SUMMARY:Morning without a sequence",
                "END:VEVENT",
                "BEGIN:VEVENT",
                "UID:series",
                "RECURRENCE-ID:20240102T150000Z",
                "DTSTART:20240102T180000Z",
                "SUMMARY:Older afternoon revision",
                "SEQUENCE:1",
                "END:VEVENT",
            ]),
            "UTC",
        );
        let titles: Vec<&str> = result.events.iter().map(|e| e.title.as_str()).collect();
        assert_eq!(
            titles,
            ["Series", "Morning without a sequence", "Afternoon"]
        );
    }

    #[test]
    fn all_day_rules_repeat_on_the_users_calendar_days() {
        let lines = [
            "BEGIN:VEVENT",
            "UID:holiday",
            "DTSTART;VALUE=DATE:20240301",
            "SUMMARY:Holiday",
            "RRULE:FREQ=YEARLY;UNTIL=20280301",
            "END:VEVENT",
        ];
        for (zone, until) in [
            ("UTC", "2028-03-01T00:00:00.000Z"),
            ("Europe/Amsterdam", "2028-02-29T23:00:00.000Z"),
            ("America/Los_Angeles", "2028-03-01T08:00:00.000Z"),
        ] {
            let result = parse(&feed(&lines), zone);
            let rule = event(&result, "holiday").recurrence.clone().unwrap();
            assert_eq!(
                (rule.timezone.as_deref(), rule.until.as_deref()),
                (Some(zone), Some(until)),
                "{zone}"
            );
        }
    }

    #[test]
    fn offset_tzids_are_fixed_offsets() {
        let result = parse(
            &feed(&[
                "BEGIN:VEVENT",
                "UID:plus",
                "DTSTART;TZID=+0100:20240715T090000",
                "SUMMARY:Plus",
                "END:VEVENT",
                "BEGIN:VEVENT",
                "UID:half",
                "DTSTART;TZID=+0530:20240715T090000",
                "SUMMARY:Half",
                "END:VEVENT",
            ]),
            "UTC",
        );
        let at = |uid: &str| {
            let found = event(&result, uid);
            (instant::iso(found.start).0, found.timezone.clone())
        };
        assert_eq!(
            at("plus"),
            ("2024-07-15T08:00:00.000Z".into(), Some("Etc/GMT-1".into()))
        );
        assert_eq!(
            at("half"),
            ("2024-07-15T03:30:00.000Z".into(), Some("UTC".into())),
            "no IANA zone keeps +05:30, so the event is filed in the user's"
        );
    }

    #[test]
    fn custom_tzids_read_by_their_own_vtimezone() {
        // Solace's own feed with the zone renamed: only its VTIMEZONE can say where 09:00 is.
        let ics = super::super::build::build_calendar(
            &super::super::build::Calendar::default(),
            &super::super::build::tests::series_across_dst(),
        )
        .replace("Europe/Amsterdam", "Office time");
        let result = parse(&ics, "America/Los_Angeles");
        let series = event(&result, "series@example.com");
        assert_eq!(instant::iso(series.start).0, "2026-10-19T07:00:00.000Z");
        let moved = event(
            &result,
            "series@example.com::RECURRENCE::2026-11-09T08:00:00.000Z",
        );
        assert_eq!(
            moved.occurrence.map(|at| instant::iso(at).0).as_deref(),
            Some("2026-11-09T08:00:00.000Z"),
            "the override names the post-change instance"
        );
        assert_eq!(
            series
                .excluded_dates
                .iter()
                .map(|at| instant::iso(*at).0)
                .collect::<Vec<_>>(),
            ["2026-11-02T08:00:00.000Z"]
        );
        // A VTIMEZONE defined after the event that uses it still counts.
        let forward = feed(&[
            "BEGIN:VEVENT",
            "UID:forward",
            "DTSTART;TZID=Later:20240715T090000",
            "SUMMARY:Forward",
            "END:VEVENT",
            "BEGIN:VTIMEZONE",
            "TZID:Later",
            "BEGIN:STANDARD",
            "DTSTART:19700101T000000",
            "TZOFFSETFROM:+0530",
            "TZOFFSETTO:+0530",
            "END:STANDARD",
            "END:VTIMEZONE",
        ]);
        let result = parse(&forward, "UTC");
        assert_eq!(
            instant::iso(event(&result, "forward").start).0,
            "2024-07-15T03:30:00.000Z"
        );
    }

    #[test]
    fn zones_are_stored_as_iana_names_never_as_labels() {
        let lines = [
            (
                "windows",
                "DTSTART;TZID=Romance Standard Time:20240715T090000",
            ),
            (
                "label",
                "DTSTART;TZID=\"(UTC+01:00) Brussels, Copenhagen, Madrid, Paris\":20240715T090000",
            ),
            ("lowercase", "DTSTART;TZID=europe/amsterdam:20240715T090000"),
            (
                "hour",
                "DTSTART;TZID=\"(UTC+03:00) Nowhere\":20240715T090000",
            ),
            ("unknown", "DTSTART;TZID=Mars/Olympus_Mons:20240715T090000"),
        ];
        let mut feed_lines = Vec::new();
        for (uid, start) in lines {
            feed_lines.extend([
                "BEGIN:VEVENT",
                start,
                "SUMMARY:Zone",
                "RRULE:FREQ=DAILY;COUNT=2",
            ]);
            feed_lines.push(Box::leak(format!("UID:{uid}").into_boxed_str()));
            feed_lines.push("END:VEVENT");
        }
        let result = parse(&feed(&feed_lines), "America/Los_Angeles");
        let zones = |uid: &str| {
            let found = event(&result, uid);
            (
                found.timezone.clone().unwrap_or_default(),
                found
                    .recurrence
                    .as_ref()
                    .and_then(|rule| rule.timezone.clone())
                    .unwrap_or_default(),
                instant::iso(found.start).0,
            )
        };
        let expect = |zone: &str, start: &str| (zone.to_owned(), zone.to_owned(), start.to_owned());
        assert_eq!(
            zones("windows"),
            expect("Europe/Paris", "2024-07-15T07:00:00.000Z")
        );
        assert_eq!(
            zones("label"),
            expect("Europe/Paris", "2024-07-15T07:00:00.000Z")
        );
        assert_eq!(zones("lowercase").0, "europe/amsterdam");
        assert_eq!(
            zones("hour"),
            expect("Etc/GMT-3", "2024-07-15T06:00:00.000Z")
        );
        assert_eq!(
            zones("unknown"),
            expect("America/Los_Angeles", "2024-07-15T16:00:00.000Z"),
            "an unknown name falls back to the user's zone, which also reads the time"
        );
    }

    #[test]
    fn floating_times_use_the_calendar_zone_or_the_users() {
        let vtimezone = [
            "BEGIN:VTIMEZONE",
            "TZID:Asia/Tokyo",
            "BEGIN:STANDARD",
            "DTSTART:19700101T000000",
            "TZOFFSETFROM:+0900",
            "TZOFFSETTO:+0900",
            "END:STANDARD",
            "END:VTIMEZONE",
        ];
        let floating = [
            "BEGIN:VEVENT",
            "UID:floating",
            "DTSTART:20240715T090000",
            "SUMMARY:Floating",
            "END:VEVENT",
        ];
        let start = |extra: &[&str]| {
            let lines: Vec<&str> = extra
                .iter()
                .chain(&vtimezone)
                .chain(&floating)
                .copied()
                .collect();
            let result = parse(&feed(&lines), "Europe/Amsterdam");
            let found = event(&result, "floating");
            (instant::iso(found.start).0, found.timezone.clone())
        };
        assert_eq!(
            start(&["X-WR-TIMEZONE:America/New_York"]),
            (
                "2024-07-15T13:00:00.000Z".into(),
                Some("America/New_York".into())
            )
        );
        assert_eq!(
            start(&[]),
            (
                "2024-07-15T07:00:00.000Z".into(),
                Some("Europe/Amsterdam".into())
            ),
            "a VTIMEZONE alone does not claim floating times: the user's zone does"
        );
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
