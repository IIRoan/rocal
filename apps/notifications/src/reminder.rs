//! The reminder email: generic by design (time and lead only, never title, location or description).

use jiff::Timestamp;
use solace_server::email::{Message, escape_html};
use solace_server::mail::webhook::REMINDER_MESSAGE_ID_PREFIX;

use crate::jobs::{Reminder, zone};
use crate::settings::Settings;

const TEMPLATE: &str = include_str!("event_reminder.html");
const TITLE: &str = "Event reminder";
const LOGO_URL: &str = "https://solace.onl/favicon-192x192.png";

/// "15 minutes", "1 hour 5 minutes" or "starting now".
fn lead(minutes: i64) -> String {
    let unit = |count: i64, one: &str, many: &str| {
        if count == 1 {
            format!("1 {one}")
        } else {
            format!("{count} {many}")
        }
    };
    match (minutes / 60, minutes % 60) {
        _ if minutes <= 0 => "starting now".into(),
        (0, rest) => unit(rest, "minute", "minutes"),
        (hours, 0) => unit(hours, "hour", "hours"),
        (hours, rest) => format!(
            "{} {}",
            unit(hours, "hour", "hours"),
            unit(rest, "minute", "minutes")
        ),
    }
}

pub fn subject(minutes: i64) -> String {
    if minutes <= 0 {
        format!("{TITLE} starting now")
    } else {
        format!("{TITLE} in {}", lead(minutes))
    }
}

/// "Your event starts in 1h 5m" and its shorter forms.
fn reminder_text(minutes: i64) -> String {
    match (minutes / 60, minutes % 60) {
        _ if minutes <= 0 => "Your event is starting now".into(),
        (0, 1) => "Your event starts in 1 minute".into(),
        (0, rest) => format!("Your event starts in {rest} minutes"),
        (1, 0) => "Your event starts in 1 hour".into(),
        (hours, 0) => format!("Your event starts in {hours} hours"),
        (hours, rest) => format!("Your event starts in {hours}h {rest}m"),
    }
}

fn duration(start: Timestamp, end: Timestamp, all_day: bool) -> String {
    if all_day {
        return String::new();
    }
    let minutes = (end.as_second() - start.as_second()) / 60;
    match (minutes / 60, minutes % 60) {
        _ if minutes <= 0 => String::new(),
        (0, rest) => format!("{rest}m"),
        (hours, 0) => format!("{hours}h"),
        (hours, rest) => format!("{hours}h {rest}m"),
    }
}

/// The values the template and the plain-text part show.
pub struct Content {
    pub event_id: String,
    pub summary: String,
    pub event_date: String,
    pub event_time: String,
    pub time_until: String,
    pub duration: String,
    pub event_url: String,
    pub calendar_url: String,
    pub settings_url: String,
    pub privacy_url: String,
}

pub fn content(reminder: &Reminder, minutes: i64, event_id: &str, settings: &Settings) -> Content {
    let tz = zone(&reminder.timezone);
    let start = reminder.start.to_zoned(tz.clone());
    let end = reminder.end.to_zoned(tz);
    let clock = |at: &jiff::Zoned| at.strftime("%-I:%M %p").to_string();
    let event_date = start.strftime("%A, %b %-d").to_string();
    let event_time = match () {
        _ if reminder.all_day => "All day".to_owned(),
        _ if end > start => format!("{} – {}", clock(&start), clock(&end)),
        _ => clock(&start),
    };
    let summary = if reminder.all_day {
        format!("You have an all-day event on {event_date}. Open Solace to view the details.")
    } else {
        format!(
            "You have an event at {}. Open Solace to view the details.",
            clock(&start)
        )
    };
    Content {
        event_id: event_id.to_owned(),
        summary,
        time_until: reminder_text(minutes),
        duration: duration(reminder.start, reminder.end, reminder.all_day),
        event_date,
        event_time,
        event_url: settings.frontend_url("/calendar", &[("eventId", event_id)]),
        calendar_url: settings.frontend_url("/calendar", &[]),
        settings_url: settings.frontend_url("/settings", &[]),
        privacy_url: settings.frontend_url("/privacy", &[]),
    }
}

impl Content {
    fn field(&self, name: &str) -> &str {
        match name {
            "EventTitle" => TITLE,
            "Summary" => &self.summary,
            "EventDate" => &self.event_date,
            "EventTime" => &self.event_time,
            "TimeUntilEvent" => &self.time_until,
            "Duration" => &self.duration,
            "EventUrl" => &self.event_url,
            "CalendarUrl" => &self.calendar_url,
            "SettingsUrl" => &self.settings_url,
            "PrivacyUrl" => &self.privacy_url,
            "LogoUrl" => LOGO_URL,
            _ => "",
        }
    }

    /// The rendered template: `{{if .X}}…{{end}}` blocks kept only when X is set, then `{{.X}}` escaped.
    pub fn html(&self) -> String {
        let mut html = String::with_capacity(TEMPLATE.len() + 512);
        let mut rest = TEMPLATE;
        while let Some(start) = rest.find("{{") {
            html.push_str(&rest[..start]);
            let Some(close) = rest[start..].find("}}") else {
                break;
            };
            let tag = &rest[start + 2..start + close];
            rest = &rest[start + close + 2..];
            if let Some(name) = tag.strip_prefix("if .") {
                if self.field(name).is_empty() {
                    rest = rest.find("{{end}}").map_or("", |end| &rest[end + 7..]);
                }
            } else if let Some(name) = tag.strip_prefix('.') {
                html.push_str(&escape_html(self.field(name)));
            }
        }
        html.push_str(rest);
        html
    }

    pub fn text(&self) -> String {
        let mut text = String::new();
        if !self.time_until.is_empty() {
            text.push_str(&format!("{}\n\n", self.time_until));
        }
        if !self.summary.is_empty() {
            text.push_str(&format!("{}\n\n", self.summary));
        }
        text.push_str(&format!(
            "Details:\nDate: {}\nTime: {}\n",
            self.event_date, self.event_time
        ));
        if !self.duration.is_empty() {
            text.push_str(&format!("Duration: {}\n", self.duration));
        }
        if !self.event_id.is_empty() {
            text.push_str(&format!("Event ID: {}\n", self.event_id));
        }
        text.push_str(&format!(
            "Open event: {}\n\nThis reminder was sent because email notifications are enabled for your account.\nSettings: {}\nPrivacy: {}\nCalendar: {}\n",
            self.event_url, self.settings_url, self.privacy_url, self.calendar_url
        ));
        text
    }
}

/// The reminder mail, its Message-ID tagged so the Stalwart webhook does not also push it as new mail.
pub fn message(content: &Content, minutes: i64, from: &str) -> Message {
    let domain = from
        .rsplit_once('@')
        .map_or("", |(_, domain)| domain.trim());
    Message {
        subject: subject(minutes),
        text: content.text(),
        html: content.html(),
        attachments: Vec::new(),
        message_id: Some(format!(
            "{REMINDER_MESSAGE_ID_PREFIX}{}@{domain}",
            hex::encode(rand::random::<[u8; 16]>())
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reminder(start: &str, end: &str, timezone: &str, all_day: bool) -> Reminder {
        Reminder {
            encrypted_title: "ciphertext".into(),
            start: start.parse().unwrap(),
            end: end.parse().unwrap(),
            all_day,
            user_email: "ann@example.com".into(),
            timezone: timezone.into(),
            time_format: "24h".into(),
        }
    }

    fn settings() -> Settings {
        Settings::from_pairs(&[("FRONTEND_URL", "https://solace.onl")])
    }

    #[test]
    fn lead_times_read_naturally() {
        assert_eq!(subject(0), "Event reminder starting now");
        assert_eq!(subject(-5), "Event reminder starting now");
        assert_eq!(subject(1), "Event reminder in 1 minute");
        assert_eq!(subject(45), "Event reminder in 45 minutes");
        assert_eq!(subject(60), "Event reminder in 1 hour");
        assert_eq!(subject(120), "Event reminder in 2 hours");
        assert_eq!(subject(61), "Event reminder in 1 hour 1 minute");
        assert_eq!(subject(125), "Event reminder in 2 hours 5 minutes");
        assert_eq!(reminder_text(0), "Your event is starting now");
        assert_eq!(reminder_text(1), "Your event starts in 1 minute");
        assert_eq!(reminder_text(60), "Your event starts in 1 hour");
        assert_eq!(reminder_text(90), "Your event starts in 1h 30m");
    }

    #[test]
    fn durations_round_to_minutes() {
        let at = |value: &str| value.parse::<Timestamp>().unwrap();
        assert_eq!(
            duration(
                at("2026-01-01T10:00:00Z"),
                at("2026-01-01T11:30:00Z"),
                false
            ),
            "1h 30m"
        );
        assert_eq!(
            duration(
                at("2026-01-01T10:00:00Z"),
                at("2026-01-01T12:00:00Z"),
                false
            ),
            "2h"
        );
        assert_eq!(
            duration(
                at("2026-01-01T10:00:00Z"),
                at("2026-01-01T10:45:00Z"),
                false
            ),
            "45m"
        );
        assert_eq!(
            duration(
                at("2026-01-01T10:00:00Z"),
                at("2026-01-01T10:00:00Z"),
                false
            ),
            ""
        );
        assert_eq!(
            duration(
                at("2026-01-01T10:00:00Z"),
                at("2026-01-01T09:00:00Z"),
                false
            ),
            ""
        );
        assert_eq!(
            duration(at("2026-01-01T10:00:00Z"), at("2026-01-02T10:00:00Z"), true),
            "",
            "the time already says all day"
        );
    }

    #[test]
    fn details_follow_the_users_zone() {
        let timed = content(
            &reminder(
                "2026-07-15T13:30:00Z",
                "2026-07-15T14:15:00Z",
                "Europe/Amsterdam",
                false,
            ),
            30,
            "evt1",
            &settings(),
        );
        assert_eq!(timed.event_date, "Wednesday, Jul 15");
        assert_eq!(timed.event_time, "3:30 PM – 4:15 PM");
        assert_eq!(timed.time_until, "Your event starts in 30 minutes");
        assert_eq!(timed.duration, "45m");
        assert_eq!(
            timed.summary,
            "You have an event at 3:30 PM. Open Solace to view the details."
        );
        assert_eq!(timed.event_url, "https://solace.onl/calendar?eventId=evt1");
        let unknown_zone = content(
            &reminder(
                "2026-07-15T13:30:00Z",
                "2026-07-15T13:30:00Z",
                "Mars/Base",
                false,
            ),
            5,
            "evt1",
            &settings(),
        );
        assert_eq!(unknown_zone.event_time, "1:30 PM");
        let all_day = content(
            &reminder("2026-07-15T00:00:00Z", "2026-07-16T00:00:00Z", "UTC", true),
            0,
            "evt1",
            &settings(),
        );
        assert_eq!(all_day.event_time, "All day");
        assert_eq!(
            all_day.summary,
            "You have an all-day event on Wednesday, Jul 15. Open Solace to view the details."
        );
        assert_eq!(all_day.time_until, "Your event is starting now");
    }

    #[test]
    fn the_template_renders_fields_and_drops_empty_blocks() {
        let mut timed = content(
            &reminder("2026-07-15T13:30:00Z", "2026-07-15T14:30:00Z", "UTC", false),
            15,
            "evt<1>",
            &settings(),
        );
        let html = timed.html();
        assert!(!html.contains("{{"), "unrendered placeholder");
        assert!(html.contains("<title>Event reminder</title>"));
        assert!(html.contains(">Your event starts in 15 minutes</h1>"));
        assert!(
            !html.contains("evt&lt;1&gt;"),
            "the event id stays out of the body"
        );
        assert!(html.contains(LOGO_URL));
        assert!(html.contains(">Wednesday, Jul 15 &middot; 1:30 PM – 2:30 PM &middot; 1h</p>"));
        assert!(html.starts_with("<!DOCTYPE") || html.contains("<html"));
        timed.duration.clear();
        let html = timed.html();
        assert!(html.contains(">Wednesday, Jul 15 &middot; 1:30 PM – 2:30 PM</p>"));
        assert!(!html.contains("{{"));
        assert!(html.trim_end().ends_with("</html>"));
    }

    #[test]
    fn plain_text_lists_only_what_is_set() {
        let mut timed = content(
            &reminder("2026-07-15T13:30:00Z", "2026-07-15T14:30:00Z", "UTC", false),
            15,
            "evt1",
            &settings(),
        );
        let text = timed.text();
        assert!(
            text.starts_with("Your event starts in 15 minutes\n\nYou have an event at 1:30 PM.")
        );
        assert!(text.contains("Duration: 1h\n"));
        assert!(text.contains("Event ID: evt1\n"));
        assert!(text.contains("Settings: https://solace.onl/settings\n"));
        timed.duration.clear();
        timed.event_id.clear();
        let text = timed.text();
        assert!(!text.contains("Duration:"));
        assert!(!text.contains("Event ID:"));
    }

    #[test]
    fn reminder_mail_is_tagged_for_the_webhook_and_never_names_the_event() {
        let reminder = reminder("2026-07-15T13:30:00Z", "2026-07-15T14:30:00Z", "UTC", false);
        let mail = message(
            &content(&reminder, 15, "evt1", &settings()),
            15,
            "noreply@solace.onl",
        );
        let id = mail.message_id.unwrap();
        assert!(id.starts_with("solace-reminder."));
        assert!(id.ends_with("@solace.onl"));
        assert_eq!(mail.subject, "Event reminder in 15 minutes");
        assert!(!mail.html.contains("ciphertext") && !mail.text.contains("ciphertext"));
    }
}
