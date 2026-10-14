//! `toIcsBuildEvent` and `toSafeIcsFilename` (`lib/ics-export.ts`): a stored event as the ICS builder's input.

use std::cmp::Ordering;
use std::sync::LazyLock;

use icu_collator::options::{CollatorOptions, Strength};
use icu_collator::{Collator, CollatorBorrowed};
use regex_lite::Regex;
use serde_json::Value;
use time::PrimitiveDateTime;

use super::build;
use super::{
    Frequency, Participant, ParticipantRole, ParticipantStatus, RecurrenceRule, js, normalize_email,
};
use crate::http::zod::js_trim;

/// `localeCompare(…, { sensitivity: "base" })` in the root locale, as Bun's ICU orders names.
static BASE_COLLATOR: LazyLock<Option<CollatorBorrowed<'static>>> = LazyLock::new(|| {
    let mut options = CollatorOptions::default();
    options.strength = Some(Strength::Primary);
    Collator::try_new(Default::default(), options).ok()
});

static UNSAFE_FILENAME: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"[^a-z0-9._-]+").unwrap_or_else(|error| panic!("filename pattern: {error}"))
});
static DASH_RUNS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"-{2,}").unwrap_or_else(|error| panic!("dash pattern: {error}")));

/// A stored event's columns that go into ICS.
#[derive(Debug, Clone)]
pub struct ExportEvent<'a> {
    pub id: &'a str,
    pub external_id: Option<&'a str>,
    pub title: &'a str,
    pub description: Option<&'a str>,
    pub start: PrimitiveDateTime,
    pub end: PrimitiveDateTime,
    pub all_day: bool,
    pub timezone: Option<&'a str>,
    pub location: Option<&'a str>,
    /// The stored recurrence JSON.
    pub recurrence: Option<&'a str>,
    pub created_at: PrimitiveDateTime,
    pub updated_at: PrimitiveDateTime,
    pub participants: &'a [ExportParticipant<'a>],
}

/// An `event_participant` row with its linked user's address and name.
#[derive(Debug, Clone, Copy)]
pub struct ExportParticipant<'a> {
    pub id: &'a str,
    pub email: &'a str,
    pub display_name: Option<&'a str>,
    pub role: &'a str,
    pub status: &'a str,
    pub user_email: Option<&'a str>,
    pub user_name: Option<&'a str>,
}

/// A stored recurrence whose UNTIL is not a date; TypeScript threw on it, so the export fails.
#[derive(Debug, thiserror::Error, PartialEq, Eq)]
#[error("Invalid Date")]
pub struct InvalidUntil;

/// `RecurrenceEngine.parseRecurrenceRule` and `toIcsRecurrenceRule`: unreadable or invalid rules export without RRULE.
fn recurrence(raw: Option<&str>) -> Result<Option<RecurrenceRule>, InvalidUntil> {
    let Some(rule) = raw
        .filter(|raw| !raw.is_empty())
        .and_then(|raw| serde_json::from_str::<Value>(raw).ok())
    else {
        return Ok(None);
    };
    let Some(frequency) = rule
        .get("frequency")
        .and_then(Value::as_str)
        .and_then(Frequency::parse)
    else {
        return Ok(None);
    };
    let Some(interval) = rule
        .get("interval")
        .and_then(Value::as_f64)
        .filter(|i| *i >= 1.0)
    else {
        return Ok(None);
    };
    let timezone = match rule.get("timezone") {
        Some(Value::String(zone)) => Some(zone.clone()),
        Some(other) if truthy(other) => return Ok(None),
        _ => None,
    };
    let until = match rule.get("until").filter(|until| truthy(until)) {
        None => None,
        Some(Value::String(text)) => Some(js::parse_date_string(text).ok_or(InvalidUntil)?),
        Some(Value::Number(n)) => Some(
            n.as_f64()
                .and_then(|ms| js::clip(ms.trunc() as i64))
                .ok_or(InvalidUntil)?,
        ),
        Some(Value::Bool(_)) => Some(1),
        Some(_) => return Err(InvalidUntil),
    };
    let integers = |key: &str| -> Option<Vec<i64>> {
        rule.get(key).and_then(Value::as_array).map(|items| {
            items
                .iter()
                .filter_map(Value::as_f64)
                .filter(|n| n.fract() == 0.0)
                .map(|n| n as i64)
                .collect()
        })
    };
    Ok(Some(RecurrenceRule {
        frequency,
        interval: interval as i64,
        count: rule
            .get("count")
            .and_then(Value::as_f64)
            .filter(|count| *count > 0.0)
            .map(|count| count.floor() as i64),
        until: until.map(js::iso_string),
        by_week_day: integers("byWeekDay"),
        by_month_day: integers("byMonthDay"),
        by_month: integers("byMonth"),
        timezone,
    }))
}

fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(flag) => *flag,
        Value::Number(n) => n.as_f64().is_some_and(|n| n != 0.0),
        Value::String(text) => !text.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

/// `mapEventParticipant`, as far as ICS reads it.
fn mapped<'a>(participant: &ExportParticipant<'a>) -> (Participant, &'a str) {
    let email = Some(normalize_email(participant.email))
        .filter(|email| !email.is_empty())
        .or_else(|| participant.user_email.map(normalize_email))
        .unwrap_or_default();
    let role = if participant.role == "organizer" {
        ParticipantRole::Organizer
    } else {
        ParticipantRole::Attendee
    };
    let display_name = participant
        .display_name
        .map(str::to_owned)
        .or_else(|| participant.user_name.map(|name| js_trim(name).to_owned()))
        .unwrap_or_else(|| email.clone());
    let status = ParticipantStatus::parse(participant.status).unwrap_or(match role {
        ParticipantRole::Organizer => ParticipantStatus::Accepted,
        ParticipantRole::Attendee => ParticipantStatus::Pending,
    });
    (
        Participant {
            email,
            display_name: Some(display_name),
            role: Some(role),
            status: Some(status),
        },
        participant.id,
    )
}

/// `sortEventParticipants`: the organizer first, then by name (or address, or id).
fn sort_participants(participants: &mut [(Participant, &str)]) {
    let label = |(participant, id): &(Participant, &str)| -> String {
        [
            participant.display_name.as_deref().unwrap_or_default(),
            &participant.email,
            id,
        ]
        .into_iter()
        .map(js_trim)
        .find(|label| !label.is_empty())
        .unwrap_or_default()
        .to_owned()
    };
    participants.sort_by(|left, right| {
        let rank = |p: &(Participant, &str)| p.0.role != Some(ParticipantRole::Organizer);
        rank(left)
            .cmp(&rank(right))
            .then_with(|| compare_base(&label(left), &label(right)))
    });
}

/// `toIcsBuildEvent`.
pub fn to_build_event(event: &ExportEvent<'_>) -> Result<build::Event, InvalidUntil> {
    let mut participants: Vec<(Participant, &str)> =
        event.participants.iter().map(mapped).collect();
    sort_participants(&mut participants);
    Ok(build::Event {
        uid: Some(event.external_id.filter(|id| !id.is_empty()).map_or_else(
            || format!("{}@solace-calendar.local", event.id),
            str::to_owned,
        )),
        title: event.title.to_owned(),
        description: event.description.map(str::to_owned),
        start: event.start,
        end: event.end,
        all_day: event.all_day,
        timezone: event.timezone.map(str::to_owned),
        location: event.location.map(str::to_owned),
        recurrence: recurrence(event.recurrence)?,
        created_at: Some(event.created_at),
        updated_at: Some(event.updated_at),
        status: None,
        sequence: None,
        source_url: None,
        participants: (!participants.is_empty()).then(|| {
            participants
                .into_iter()
                .map(|(participant, _)| participant)
                .collect()
        }),
    })
}

/// `toSafeIcsFilename`: lowercase `[a-z0-9._-]`, ending in `.ics`.
pub fn safe_filename(base: &str) -> String {
    let trimmed = js_trim(base);
    let lower = if trimmed.is_empty() {
        "calendar".to_owned()
    } else {
        trimmed.to_lowercase()
    };
    let dashed = UNSAFE_FILENAME.replace_all(&lower, "-");
    let collapsed = DASH_RUNS.replace_all(&dashed, "-");
    let name = collapsed.trim_matches('-');
    let name = if name.is_empty() { "calendar" } else { name };
    if name.ends_with(".ics") {
        name.to_owned()
    } else {
        format!("{name}.ics")
    }
}

/// Orders two labels the way `localeCompare` with base sensitivity does.
fn compare_base(left: &str, right: &str) -> Ordering {
    BASE_COLLATOR
        .as_ref()
        .map_or_else(|| left.cmp(right), |collator| collator.compare(left, right))
}

#[cfg(test)]
mod tests {
    use time::macros::datetime;

    use super::*;

    fn stored_event<'a>(
        participants: &'a [ExportParticipant<'a>],
        recurrence: Option<&'a str>,
    ) -> ExportEvent<'a> {
        ExportEvent {
            id: "event-1",
            external_id: None,
            title: "Planning",
            description: Some("Quarterly review"),
            start: datetime!(2024-02-01 10:00:00),
            end: datetime!(2024-02-01 11:00:00),
            all_day: false,
            timezone: Some("UTC"),
            location: Some("Room A"),
            recurrence,
            created_at: datetime!(2024-01-01 08:00:00),
            updated_at: datetime!(2024-01-02 09:00:00),
            participants,
        }
    }

    fn row<'a>(
        id: &'a str,
        email: &'a str,
        name: Option<&'a str>,
        role: &'a str,
        status: &'a str,
    ) -> ExportParticipant<'a> {
        ExportParticipant {
            id,
            email,
            display_name: name,
            role,
            status,
            user_email: None,
            user_name: None,
        }
    }

    #[test]
    fn unreadable_rules_export_without_rrule() {
        for raw in [
            r#"{"frequency":"weekly","interval":0}"#,
            "not json",
            r#"{"frequency":"hourly","interval":1}"#,
            "null",
        ] {
            let event = to_build_event(&stored_event(&[], Some(raw))).expect("event");
            assert_eq!(event.recurrence, None, "{raw}");
        }
        let full = to_build_event(&stored_event(
            &[],
            Some(r#"{"frequency":"weekly","interval":2,"count":5,"until":"2024-03-01T00:00:00.000Z","timezone":"UTC","byWeekDay":[1,3],"byMonthDay":[1],"byMonth":[2]}"#),
        ))
        .expect("event");
        assert_eq!(
            full.recurrence,
            Some(RecurrenceRule {
                frequency: Frequency::Weekly,
                interval: 2,
                count: Some(5),
                until: Some("2024-03-01T00:00:00.000Z".into()),
                by_week_day: Some(vec![1, 3]),
                by_month_day: Some(vec![1]),
                by_month: Some(vec![2]),
                timezone: Some("UTC".into()),
            })
        );
        assert_eq!(full.uid.as_deref(), Some("event-1@solace-calendar.local"));
        assert_eq!(
            to_build_event(&stored_event(
                &[],
                Some(r#"{"frequency":"daily","interval":1,"until":"soon"}"#)
            )),
            Err(InvalidUntil)
        );
    }

    #[test]
    fn participants_export_sorted_with_roles() {
        let alice = [ExportParticipant {
            user_email: Some("alice@example.com"),
            user_name: Some("Alice"),
            ..row(
                "p-1",
                "alice@example.com",
                Some("Alice"),
                "organizer",
                "accepted",
            )
        }];
        let event = to_build_event(&stored_event(&alice, None)).expect("event");
        assert_eq!(
            event.participants,
            Some(vec![Participant {
                email: "alice@example.com".into(),
                display_name: Some("Alice".into()),
                role: Some(ParticipantRole::Organizer),
                status: Some(ParticipantStatus::Accepted),
            }])
        );
        let rows = [
            row("p-1", "zed@example.com", Some("zed"), "attendee", "maybe"),
            row(
                "p-2",
                "Emile@Example.com",
                Some("Émile"),
                "attendee",
                "declined",
            ),
            row("p-3", "owner@example.com", None, "organizer", "pending"),
            ExportParticipant {
                user_name: Some(" Bob "),
                ..row("p-4", "", None, "attendee", "accepted")
            },
        ];
        let event = to_build_event(&stored_event(&rows, None)).expect("event");
        let order: Vec<(String, Option<String>, Option<ParticipantStatus>)> = event
            .participants
            .unwrap_or_default()
            .into_iter()
            .map(|p| (p.email, p.display_name, p.status))
            .collect();
        assert_eq!(
            order,
            [
                (
                    "owner@example.com".into(),
                    Some("owner@example.com".into()),
                    Some(ParticipantStatus::Pending)
                ),
                (
                    String::new(),
                    Some("Bob".into()),
                    Some(ParticipantStatus::Accepted)
                ),
                (
                    "emile@example.com".into(),
                    Some("Émile".into()),
                    Some(ParticipantStatus::Declined)
                ),
                (
                    "zed@example.com".into(),
                    Some("zed".into()),
                    Some(ParticipantStatus::Pending)
                ),
            ]
        );
        assert_eq!(event.uid.as_deref(), Some("event-1@solace-calendar.local"));
    }

    /// Stored rows through `toIcsBuildEvent` and `buildIcsEventFile` in TypeScript, byte for byte, at a fixed DTSTAMP.
    #[test]
    fn stored_events_export_byte_for_byte_like_typescript() {
        use super::super::build::tests::{calendar_from, date};

        let directory = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/ics/export");
        let cases: Value = serde_json::from_str(
            &std::fs::read_to_string(format!("{directory}/cases.json")).expect("cases"),
        )
        .expect("cases json");
        let stamp = date(&cases["dtstamp"]).expect("dtstamp");
        for case in cases["cases"].as_array().expect("cases") {
            let name = case["name"].as_str().expect("name");
            let row = &case["event"];
            let participants: Vec<ExportParticipant<'_>> = row["participants"]
                .as_array()
                .expect("participants")
                .iter()
                .map(|p| ExportParticipant {
                    id: p["id"].as_str().unwrap_or_default(),
                    email: p["email"].as_str().unwrap_or_default(),
                    display_name: p["displayName"].as_str(),
                    role: p["role"].as_str().unwrap_or_default(),
                    status: p["status"].as_str().unwrap_or_default(),
                    user_email: p["user"]["email"].as_str(),
                    user_name: p["user"]["name"].as_str(),
                })
                .collect();
            let event = ExportEvent {
                id: row["id"].as_str().unwrap_or_default(),
                external_id: row["externalId"].as_str(),
                title: row["title"].as_str().unwrap_or_default(),
                description: row["description"].as_str(),
                start: date(&row["start"]).expect("start"),
                end: date(&row["end"]).expect("end"),
                all_day: row["allDay"].as_bool().unwrap_or(false),
                timezone: row["timezone"].as_str(),
                location: row["location"].as_str(),
                recurrence: row["recurrence"].as_str(),
                created_at: date(&row["createdAt"]).expect("created"),
                updated_at: date(&row["updatedAt"]).expect("updated"),
                participants: &participants,
            };
            let built = to_build_event(&event).expect("exportable");
            let actual =
                build::build_calendar_at(&calendar_from(&case["calendar"]), &[built], stamp);
            let expected =
                std::fs::read_to_string(format!("{directory}/{name}.ics")).expect("golden");
            assert_eq!(actual, expected, "{name}");
        }
    }

    #[test]
    fn filenames_are_safe() {
        assert_eq!(safe_filename("  Team Calendar  "), "team-calendar.ics");
        assert_eq!(safe_filename("Roadmap: Q1/Q2"), "roadmap-q1-q2.ics");
        assert_eq!(safe_filename("already.ics"), "already.ics");
        assert_eq!(safe_filename("   "), "calendar.ics");
        assert_eq!(safe_filename("!!!"), "calendar.ics");
        assert_eq!(compare_base("alice", "Bob"), Ordering::Less);
        assert_eq!(compare_base("émile", "Emile"), Ordering::Equal);
    }
}
