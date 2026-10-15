//! REQUEST invitations to new attendees (`buildInvitationSender`, `sendEventInvitationEmail`): noreply mail with the event as ICS.

use solace_api_types::common::OperationWarning;

use crate::addresses::is_reserved_system_email;
use crate::auth::cookies::encode_uri_component;
use crate::email::{self, InvitedEvent, Message};
use crate::events::participants::{self, Synced};
use crate::integrations::ics::build::{self, Calendar};
use crate::integrations::ics::{Participant, ParticipantRole, ParticipantStatus, resolve_timezone};
use crate::integrations::stalwart::mailer::Attachment;
use crate::state::AppState;
use crate::telemetry::log_ref;

const LABEL: &str = "event invitation";

/// Mails every new invitee of `synced` the REQUEST for `invitation`; call it only after the participant rows are committed.
pub async fn send_pending(
    state: &AppState,
    event_id: &str,
    synced: &Synced,
    calendar_name: &str,
    invitation: &build::Event,
) -> Vec<OperationWarning> {
    let Some(owner) = synced.owner.as_ref() else {
        return Vec::new();
    };
    if synced.new_invitees.is_empty() {
        return Vec::new();
    }
    let ics = build::event_file(
        &Calendar {
            name: Some(
                if calendar_name.is_empty() {
                    "Solace"
                } else {
                    calendar_name
                }
                .to_owned(),
            ),
            timezone: Some(resolve_timezone(invitation.timezone.as_deref())),
            method: Some("REQUEST"),
            ..Calendar::default()
        },
        build::Event {
            participants: Some(
                synced
                    .resolved
                    .iter()
                    .map(|p| Participant {
                        email: p.email.clone(),
                        display_name: Some(p.display_name.clone()),
                        role: Some(if p.role == "organizer" {
                            ParticipantRole::Organizer
                        } else {
                            ParticipantRole::Attendee
                        }),
                        status: ParticipantStatus::parse(&p.status),
                    })
                    .collect(),
            ),
            ..invitation.clone()
        },
    );
    let open_url = open_url(state, event_id);
    let event = InvitedEvent {
        title: &invitation.title,
        description: invitation.description.as_deref(),
        location: invitation.location.as_deref(),
        start: invitation.start,
        end: invitation.end,
        all_day: invitation.all_day,
    };
    let mut warnings = Vec::new();
    for invitee in &synced.new_invitees {
        let delivered = match &open_url {
            Some(url) => {
                let mut message =
                    email::event_invitation(&invitee.display_name, &owner.name, &event, url);
                message.attachments.push(Attachment {
                    filename: "invite.ics".into(),
                    content: ics.clone(),
                    content_type: Some("text/calendar; method=REQUEST; charset=utf-8".into()),
                });
                deliver(state, &invitee.email, &message).await
            }
            None => false,
        };
        if !delivered {
            warnings.push(email::delivery_warning(LABEL, &invitee.email));
        }
    }
    warnings
}

/// `{frontendUrl}/calendar?eventId=…`, resolved like `new URL` does.
fn open_url(state: &AppState, event_id: &str) -> Option<String> {
    let base = format!("{}/", state.config.frontend_url.trim_end_matches('/'));
    url::Url::parse(&base)
        .and_then(|base| {
            base.join(&format!(
                "/calendar?eventId={}",
                encode_uri_component(event_id)
            ))
        })
        .map(|url| url.to_string())
        .ok()
}

/// `sendEventInvitationEmail`: best effort, and never to a reserved system address.
async fn deliver(state: &AppState, to: &str, message: &Message) -> bool {
    let email = participants::normalize_email(Some(to));
    if is_reserved_system_email(&email, None) {
        tracing::warn!(
            recipient_ref = log_ref(&email),
            "Skipped event invitation to reserved system email"
        );
        return false;
    }
    email::send(state, LABEL, &email, message, email::Mode::BestEffort)
        .await
        .unwrap_or(false)
}
