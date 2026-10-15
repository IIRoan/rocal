//! `lib/event-rsvp-reply.ts`: the iTIP REPLY an attendee's answer sends the organizer, as noreply mail.

use time::PrimitiveDateTime;

use crate::addresses::is_reserved_system_email;
use crate::email::{self, Message, escape_html};
use crate::http::zod::js_trim;
use crate::integrations::ics::build::{self, Calendar};
use crate::integrations::ics::{
    Participant, ParticipantRole, ParticipantStatus, normalize_email, resolve_timezone,
};
use crate::integrations::stalwart::mailer::Attachment;
use crate::state::AppState;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RsvpStatus {
    Accepted,
    Declined,
    Tentative,
}

impl RsvpStatus {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "accepted" => Some(Self::Accepted),
            "declined" => Some(Self::Declined),
            "tentative" => Some(Self::Tentative),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Accepted => "accepted",
            Self::Declined => "declined",
            Self::Tentative => "tentative",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Accepted => "Accepted",
            Self::Declined => "Declined",
            Self::Tentative => "Tentative",
        }
    }

    fn partstat(self) -> ParticipantStatus {
        match self {
            Self::Accepted => ParticipantStatus::Accepted,
            Self::Declined => ParticipantStatus::Declined,
            Self::Tentative => ParticipantStatus::Tentative,
        }
    }
}

/// What the reply is about; `uid` is the invitation's UID, so the organizer can match it.
#[derive(Debug, Clone)]
pub struct Reply<'a> {
    pub organizer_email: &'a str,
    pub attendee_email: &'a str,
    pub attendee_display_name: Option<&'a str>,
    pub title: &'a str,
    pub uid: &'a str,
    pub start: PrimitiveDateTime,
    pub end: PrimitiveDateTime,
    pub all_day: bool,
    pub timezone: Option<&'a str>,
    pub status: RsvpStatus,
}

/// `buildEventRsvpReplyIcs`: organizers match a reply by UID and PARTSTAT, so a sealed title stays opaque.
fn reply_ics(reply: &Reply<'_>, organizer: &str, attendee: &str) -> String {
    build::event_file(
        &Calendar {
            name: Some("Solace".into()),
            timezone: Some(resolve_timezone(reply.timezone)),
            method: Some("REPLY"),
            ..Calendar::default()
        },
        build::Event {
            uid: Some(reply.uid.to_owned()),
            title: reply.title.to_owned(),
            description: None,
            start: reply.start,
            end: reply.end,
            all_day: reply.all_day,
            timezone: reply.timezone.map(str::to_owned),
            location: None,
            recurrence: None,
            created_at: None,
            updated_at: None,
            status: None,
            sequence: None,
            source_url: None,
            participants: Some(vec![
                Participant {
                    email: organizer.to_owned(),
                    display_name: None,
                    role: Some(ParticipantRole::Organizer),
                    status: None,
                },
                Participant {
                    email: attendee.to_owned(),
                    display_name: reply.attendee_display_name.map(str::to_owned),
                    role: Some(ParticipantRole::Attendee),
                    status: Some(reply.status.partstat()),
                },
            ]),
            recurrence_id: None,
            excluded_dates: Vec::new(),
        },
    )
}

/// The reply mail, or `None` when it would go to nobody, a reserved address or the attendee themself.
fn message(reply: &Reply<'_>) -> Option<(String, Message)> {
    let organizer = normalize_email(reply.organizer_email);
    let attendee = normalize_email(reply.attendee_email);
    if organizer.is_empty() || is_reserved_system_email(&organizer, None) || organizer == attendee {
        return None;
    }
    let who = reply
        .attendee_display_name
        .map(js_trim)
        .filter(|name| !name.is_empty())
        .unwrap_or(&attendee);
    let status = reply.status.as_str();
    let message = Message {
        subject: format!("{}: {}", reply.status.label(), reply.title),
        text: format!("{who} {status} the invitation."),
        // TypeScript interpolated the name unescaped; a display name can come from a mailed CN.
        html: format!("<p>{} {status} the invitation.</p>", escape_html(who)),
        attachments: vec![Attachment {
            filename: "reply.ics".into(),
            content: reply_ics(reply, &organizer, &attendee),
            content_type: Some("text/calendar; method=REPLY; charset=utf-8".into()),
        }],
    };
    Some((organizer, message))
}

/// `sendEventRsvpReply`: a best-effort iTIP REPLY from Solace, never from the Stalwart calendar.
pub async fn send(state: &AppState, reply: &Reply<'_>) {
    if let Some((organizer, message)) = message(reply) {
        let _ = email::send(
            state,
            "event RSVP reply",
            &organizer,
            &message,
            email::Mode::BestEffort,
        )
        .await;
    }
}

#[cfg(test)]
mod tests {
    use time::macros::datetime;

    use super::*;

    fn reply<'a>(organizer: &'a str, name: Option<&'a str>) -> Reply<'a> {
        Reply {
            organizer_email: organizer,
            attendee_email: "Bee@Example.com",
            attendee_display_name: name,
            title: "Planning",
            uid: "uid-1@example.com",
            start: datetime!(2099-03-02 09:00),
            end: datetime!(2099-03-02 10:00),
            all_day: false,
            timezone: None,
            status: RsvpStatus::Tentative,
        }
    }

    #[test]
    fn replies_carry_the_partstat_and_the_original_uid() {
        let (to, mail) = message(&reply(" MAILTO:Org@Example.com", Some(" <Bee> "))).unwrap();
        assert_eq!(to, "org@example.com");
        assert_eq!(mail.subject, "Tentative: Planning");
        assert_eq!(mail.text, "<Bee> tentative the invitation.");
        assert_eq!(mail.html, "<p>&lt;Bee&gt; tentative the invitation.</p>");
        let ics = mail.attachments[0].content.replace("\r\n ", "");
        for line in [
            "METHOD:REPLY",
            "UID:uid-1@example.com",
            "ORGANIZER:mailto:org@example.com",
            "ATTENDEE;CN=<Bee>;PARTSTAT=TENTATIVE:mailto:bee@example.com",
        ] {
            assert!(ics.split("\r\n").any(|l| l == line), "{line}: {ics}");
        }
        let (_, unnamed) = message(&reply("org@example.com", None)).unwrap();
        assert_eq!(unnamed.text, "bee@example.com tentative the invitation.");
    }

    #[test]
    fn replies_never_go_to_yourself_or_reserved_addresses() {
        for organizer in ["", "bee@example.com", "admin@solace.onl"] {
            assert!(message(&reply(organizer, None)).is_none(), "{organizer}");
        }
    }
}
