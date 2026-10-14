//! ICS for feeds, exports and invitation mail: `@workspace/calendar-ics` and `lib/ics-*.ts`, with node-ical's behavior reproduced.

pub mod build;
pub mod export;
mod js;
pub mod parse;
mod reader;
mod rrule;
mod zones;

use serde::Serialize;

use crate::http::zod::js_trim;

const METHODS: [&str; 8] = [
    "PUBLISH",
    "REQUEST",
    "REPLY",
    "ADD",
    "CANCEL",
    "REFRESH",
    "COUNTER",
    "DECLINECOUNTER",
];

pub const DEFAULT_METHOD: &str = "PUBLISH";

/// `parseCalendarMethod`: the first `METHOD:` line anywhere in the file, if it is an iTIP method.
pub fn calendar_method(content: &str) -> &'static str {
    let name = |at: usize| -> String {
        content[at + 7..]
            .chars()
            .take_while(char::is_ascii_uppercase)
            .collect()
    };
    let Some(name) = content
        .match_indices("METHOD:")
        .map(|(at, _)| at)
        .filter(|&at| at == 0 || content[..at].ends_with(['\n', '\r', '\u{2028}', '\u{2029}']))
        .map(name)
        .find(|name| !name.is_empty())
    else {
        return DEFAULT_METHOD;
    };
    METHODS
        .iter()
        .find(|method| **method == name)
        .copied()
        .unwrap_or(DEFAULT_METHOD)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Frequency {
    Daily,
    Weekly,
    Monthly,
    Yearly,
}

impl Frequency {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "daily" => Some(Self::Daily),
            "weekly" => Some(Self::Weekly),
            "monthly" => Some(Self::Monthly),
            "yearly" => Some(Self::Yearly),
            _ => None,
        }
    }
}

/// `IcsRecurrenceRule`; serializes with parse-ics' key order, which is the JSON stored in `calendar_event.recurrence`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecurrenceRule {
    pub frequency: Frequency,
    pub interval: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub count: Option<i64>,
    /// UTC, as `toISOString()` writes it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub until: Option<String>,
    /// Sunday is 0.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub by_week_day: Option<Vec<i64>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub by_month_day: Option<Vec<i64>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub by_month: Option<Vec<i64>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timezone: Option<String>,
}

impl RecurrenceRule {
    /// `JSON.stringify(rule)`.
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_default()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ParticipantRole {
    Organizer,
    Attendee,
}

impl ParticipantRole {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Organizer => "organizer",
            Self::Attendee => "attendee",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ParticipantStatus {
    Pending,
    Accepted,
    Declined,
    Tentative,
}

impl ParticipantStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Accepted => "accepted",
            Self::Declined => "declined",
            Self::Tentative => "tentative",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "pending" => Some(Self::Pending),
            "accepted" => Some(Self::Accepted),
            "declined" => Some(Self::Declined),
            "tentative" => Some(Self::Tentative),
            _ => None,
        }
    }
}

/// `IcsParticipant`: an ORGANIZER or ATTENDEE.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Participant {
    pub email: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<ParticipantRole>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<ParticipantStatus>,
}

/// `normalizeParticipantEmail`.
pub fn normalize_email(email: &str) -> String {
    let trimmed = js_trim(email);
    let without_scheme = match trimmed.get(..7) {
        Some(scheme) if scheme.eq_ignore_ascii_case("mailto:") => &trimmed[7..],
        _ => trimmed,
    };
    without_scheme.to_lowercase()
}

/// `normalizeIcsTimezone`: Windows and Exchange names of a few common zones mapped to IANA.
pub fn normalize_timezone(timezone: Option<&str>) -> Option<String> {
    let trimmed = zones::strip_quotes(js_trim(timezone?));
    if trimmed.is_empty() {
        return None;
    }
    if trimmed == "tzone://Microsoft/Utc" {
        return Some("UTC".into());
    }
    let mapped = match trimmed {
        "W. Europe Standard Time" => "Europe/Amsterdam",
        "Central European Standard Time" => "Europe/Paris",
        "Eastern Standard Time" => "America/New_York",
        "Pacific Standard Time" => "America/Los_Angeles",
        "Central Standard Time" => "America/Chicago",
        "Mountain Standard Time" => "America/Denver",
        "GMT Standard Time" => "Europe/London",
        "UTC" | "Greenwich Standard Time" => "UTC",
        other => other,
    };
    Some(mapped.to_owned())
}

/// `buildIcsExternalId`: the UID, plus the RECURRENCE-ID instant for an override.
pub fn external_id(uid: &str, recurrence_id: Option<&str>) -> String {
    let uid = js_trim(uid);
    match recurrence_id {
        Some(recurrence_id) if !uid.is_empty() && !recurrence_id.is_empty() => {
            format!("{uid}::RECURRENCE::{recurrence_id}")
        }
        _ => uid.to_owned(),
    }
}

/// `resolveTimezone` in `@workspace/calendar-core`: the trimmed zone, or the product default.
pub fn resolve_timezone(timezone: Option<&str>) -> String {
    match timezone.map(js_trim) {
        Some(trimmed) if !trimmed.is_empty() => trimmed.to_owned(),
        _ => "Europe/Amsterdam".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn methods_come_from_the_first_method_line() {
        assert_eq!(
            calendar_method("BEGIN:VCALENDAR\r\nMETHOD:REQUEST\r\n"),
            "REQUEST"
        );
        assert_eq!(calendar_method("METHOD:FOO\r\nMETHOD:REPLY"), "PUBLISH");
        assert_eq!(calendar_method("X-METHOD:REPLY"), "PUBLISH");
        assert_eq!(calendar_method(""), "PUBLISH");
    }

    #[test]
    fn timezones_and_ids_normalize() {
        assert_eq!(
            normalize_timezone(Some(" \"W. Europe Standard Time\" ")).as_deref(),
            Some("Europe/Amsterdam")
        );
        assert_eq!(
            normalize_timezone(Some("tzone://Microsoft/Utc")).as_deref(),
            Some("UTC")
        );
        assert_eq!(normalize_timezone(Some("  ")), None);
        assert_eq!(
            external_id(" uid ", Some("2024-01-01T00:00:00.000Z")),
            "uid::RECURRENCE::2024-01-01T00:00:00.000Z"
        );
        assert_eq!(
            normalize_email(" MAILTO:Ann@Example.com "),
            "ann@example.com"
        );
    }
}
