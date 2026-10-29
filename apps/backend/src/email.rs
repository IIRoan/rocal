//! App mail from the noreply identity: the `auth-email.ts` templates, delivery modes, and the user-safe warnings for failed sends.

use solace_api_types::common::OperationWarning;
use time::macros::format_description;

use crate::http::zod::js_trim;
use crate::integrations::stalwart::mailer::{self, Attachment};
use crate::state::AppState;
use crate::telemetry;

const SHELL: &str = include_str!("email/shell.html");
const PASSWORD_UPDATED: &str = include_str!("email/password_updated.html");
const INVITE: &str = include_str!("email/invite.html");
const EVENT_INVITATION: &str = include_str!("email/event_invitation.html");
/// Password resets go through support until account recovery exists; mirrors `supportEmail` in `product-info.json`.
const SUPPORT_EMAIL: &str = "support@solace.onl";
const LOGO_URL: &str = "https://solace.onl/favicon-192x192.png";
const APP_URL: &str = "https://solace.onl";
const FOOTER_SEPARATOR: &str = "\n<!-- footer -->\n";

#[derive(Debug, Clone)]
pub struct Message {
    pub subject: String,
    pub text: String,
    pub html: String,
    pub attachments: Vec<Attachment>,
    /// The Message-ID header (without angle brackets); Stalwart assigns one when unset.
    pub message_id: Option<String>,
}

pub fn escape_html(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

/// The shared layout; `body` and `footer` must already be escaped.
fn layout(template: &str, title: &str, preview: &str, fill: &[(&str, &str)]) -> String {
    let (mut body, mut footer) = template
        .split_once(FOOTER_SEPARATOR)
        .map_or((template.to_owned(), String::new()), |(b, f)| {
            (b.to_owned(), f.to_owned())
        });
    for (name, value) in fill {
        let placeholder = format!("{{{{{name}}}}}");
        body = body.replace(&placeholder, value);
        footer = footer.replace(&placeholder, value);
    }
    SHELL
        .replace("{{TITLE}}", &escape_html(title))
        .replace("{{PREVIEW}}", &escape_html(preview))
        .replace("{{APP_URL}}", &escape_html(APP_URL))
        .replace("{{LOGO_URL}}", &escape_html(LOGO_URL))
        .replace("{{BODY}}", &body)
        .replace("{{FOOTER}}", &footer)
}

pub fn password_updated(name: &str, sign_in_url: &str) -> Message {
    let html = layout(
        PASSWORD_UPDATED,
        "Your Solace password was changed",
        "Your Solace password was successfully changed.",
        &[
            ("NAME", &escape_html(name)),
            ("SIGN_IN_URL", &escape_html(sign_in_url)),
            ("SUPPORT_EMAIL", &escape_html(SUPPORT_EMAIL)),
        ],
    );
    let text = [
        format!("Hi {name},"),
        String::new(),
        "This is a confirmation that your Solace password was changed.".into(),
        "If you made this change, no further action is needed.".into(),
        "After you sign in with email and password, Solace will also use this password to protect your encryption keys.".into(),
        "GitHub and passkey sign-in keep using a separate encryption password.".into(),
        format!("If you did not make this change, email {SUPPORT_EMAIL} from another address right away."),
    ]
    .join("\n");
    Message {
        subject: "Your Solace password was updated".into(),
        text,
        html,
        attachments: Vec::new(),
        message_id: None,
    }
}

pub fn invite(inviter: &str, signup_url: &str, token: &str) -> Message {
    let html = layout(
        INVITE,
        "You've been invited to Solace",
        &format!(
            "{inviter} invited you to join Solace. Create your account before your invite expires."
        ),
        &[
            ("INVITER", &escape_html(inviter)),
            ("SIGNUP_URL", &escape_html(signup_url)),
            ("TOKEN", &escape_html(token)),
        ],
    );
    let text = [
        format!("{inviter} has invited you to join Solace."),
        String::new(),
        "Create your account using the link below:".into(),
        signup_url.into(),
        String::new(),
        format!("Your invite token: {token}"),
        String::new(),
        "Your invite expires in 7 days.".into(),
        String::new(),
        "If you weren't expecting this invitation, you can safely ignore this email.".into(),
    ]
    .join("\n");
    Message {
        subject: format!("{inviter} invited you to Solace"),
        text,
        html,
        attachments: Vec::new(),
        message_id: None,
    }
}

/// One event the invitation mail describes.
pub struct InvitedEvent<'a> {
    pub title: &'a str,
    pub description: Option<&'a str>,
    pub location: Option<&'a str>,
    pub start: time::PrimitiveDateTime,
    pub end: time::PrimitiveDateTime,
    pub all_day: bool,
}

/// `formatEventEmailDateRange`: en-US medium dates and short times in the server's zone, UTC.
fn event_when(
    start: time::PrimitiveDateTime,
    end: time::PrimitiveDateTime,
    all_day: bool,
) -> String {
    let date = format_description!("[month repr:short] [day padding:none], [year]");
    let time = format_description!("[hour repr:12 padding:none]:[minute] [period]");
    let format = |at: time::PrimitiveDateTime| {
        let date = at.format(&date).unwrap_or_default();
        if all_day {
            return date;
        }
        format!("{date}, {}", at.format(&time).unwrap_or_default())
    };
    if all_day {
        return format(start);
    }
    format!("{} - {}", format(start), format(end))
}

const DETAIL_LABEL: &str = r#"<p class="detail-label" style="margin:18px 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:rgba(0,0,0,0.4)">"#;
const DETAIL_VALUE: &str =
    r#"<p class="detail-value" style="margin:0;font-size:15px;line-height:1.6;color:#1a1a1a">"#;

fn detail(label: &str, value: &str) -> String {
    format!("{DETAIL_LABEL}{label}</p>{DETAIL_VALUE}{value}</p>")
}

/// `buildEventInvitationEmail`.
pub fn event_invitation(
    attendee: &str,
    inviter: &str,
    event: &InvitedEvent<'_>,
    open_url: &str,
) -> Message {
    let attendee = Some(js_trim(attendee))
        .filter(|name| !name.is_empty())
        .unwrap_or("there");
    let when = event_when(event.start, event.end, event.all_day);
    let location = event.location.filter(|text| !js_trim(text).is_empty());
    let description = event.description.filter(|text| !js_trim(text).is_empty());
    let mut details = detail("When", &escape_html(&when));
    if let Some(location) = location {
        details.push_str(&detail("Location", &escape_html(location)));
    }
    if let Some(description) = description {
        details.push_str(&detail(
            "Notes",
            &escape_html(description).replace('\n', "<br />"),
        ));
    }
    let html = layout(
        EVENT_INVITATION,
        "Event invitation",
        &format!("{inviter} invited you to {}.", event.title),
        &[
            ("ATTENDEE", &escape_html(attendee)),
            ("INVITER", &escape_html(inviter)),
            ("TITLE", &escape_html(event.title)),
            ("DETAILS", &details),
            ("OPEN_URL", &escape_html(open_url)),
        ],
    );
    let mut text = vec![
        format!("Hi {attendee},"),
        String::new(),
        format!("{inviter} invited you to \"{}\".", event.title),
        format!("When: {when}"),
    ];
    if let Some(location) = location {
        text.push(format!("Location: {}", js_trim(location)));
    }
    if let Some(description) = description {
        text.extend([String::new(), js_trim(description).to_owned()]);
    }
    text.extend([
        String::new(),
        format!("Open event: {open_url}"),
        String::new(),
        "An ICS calendar invite is attached.".into(),
    ]);
    Message {
        subject: format!("{inviter} invited you to {}", event.title),
        text: text.join("\n"),
        html,
        attachments: Vec::new(),
        message_id: None,
    }
}

/// `required` mail fails the request when it cannot be sent; `best-effort` mail only reports it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Required,
    BestEffort,
}

#[derive(Debug, thiserror::Error)]
#[error("{0} email could not be delivered")]
pub struct DeliveryError(pub String);

/// `sendAuthEmail`: `Ok(true)` when delivered, `Ok(false)` when a best-effort send did not go out.
pub async fn send(
    state: &AppState,
    label: &str,
    to: &str,
    message: &Message,
    mode: Mode,
) -> Result<bool, DeliveryError> {
    let email = to.trim();
    let recipient_ref = telemetry::log_ref(email);
    if email.is_empty() {
        tracing::error!(
            label,
            "Email could not be delivered because the recipient email is missing"
        );
        return match mode {
            Mode::BestEffort => Ok(false),
            Mode::Required => Err(DeliveryError(label.into())),
        };
    }
    let Some(config) = state.mailer.as_ref() else {
        if state.config.is_production && mode == Mode::Required {
            return Err(DeliveryError(label.into()));
        }
        tracing::warn!(
            recipient_ref,
            label,
            "Email provider is not configured; email was not sent"
        );
        return Ok(false);
    };
    match mailer::send(&state.http, &state.stalwart_gate, config, email, message).await {
        Ok(submission_id) => {
            tracing::info!(recipient_ref, submission_id, "Sent {label} email");
            Ok(true)
        }
        Err(error) => {
            tracing::error!(recipient_ref, label, error = %telemetry::redact_pii(&error.to_string()), "Failed to send {label} email");
            match mode {
                Mode::BestEffort => Ok(false),
                Mode::Required => Err(DeliveryError(label.into())),
            }
        }
    }
}

/// The warning a mutation carries when its mail could not be delivered.
pub fn delivery_warning(label: &str, target: &str) -> OperationWarning {
    OperationWarning {
        code: "email_delivery_failed".into(),
        message: format!(
            "Could not deliver the {label} email to {target}. Try again later or contact support."
        ),
        target: Some(target.into()),
    }
}

#[derive(Debug, Clone, Copy)]
pub enum ReminderContext {
    Create,
    Update,
}

pub fn reminder_schedule_warning(context: ReminderContext) -> OperationWarning {
    let message = match context {
        ReminderContext::Create => {
            "Your event was saved, but the email reminder could not be scheduled. Try again from event settings."
        }
        ReminderContext::Update => {
            "Your event was saved, but reminder settings could not be updated. Try again from event settings."
        }
    };
    OperationWarning {
        code: "reminder_schedule_failed".into(),
        message: message.into(),
        target: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn updated_mail_sends_strangers_to_support() {
        let changed = password_updated("<Roan>", "https://solace.test/login");
        assert_eq!(changed.subject, "Your Solace password was updated");
        assert!(changed.text.contains("was changed") && changed.html.contains("Open Solace"));
        assert!(
            changed
                .text
                .contains("email support@solace.onl from another address")
        );
        assert!(changed.html.contains("Hi &lt;Roan&gt;"));
        assert!(!changed.html.contains("{{"), "every placeholder is filled");
    }

    /// A state without a database; its mailer, when configured, points at a closed port.
    fn state(production: bool, with_mailer: bool) -> AppState {
        let config = crate::config::Config::from_lookup(|name| match name {
            "NODE_ENV" if production => Some("production".into()),
            "DATABASE_URL" => Some("postgres://solace_test:x@127.0.0.1:1/solace_test".into()),
            "BETTER_AUTH_SECRET" => Some("solace-test-auth-secret-0123456789abcdef".into()),
            "STALWART_JMAP_URL" if with_mailer => Some("http://127.0.0.1:1".into()),
            "STALWART_JMAP_USERNAME" if with_mailer => Some("noreply".into()),
            "STALWART_JMAP_PASSWORD" if with_mailer => Some("x".into()),
            _ => None,
        })
        .unwrap();
        let pool = sea_orm::sqlx::postgres::PgPoolOptions::new()
            .connect_lazy(&config.database_url)
            .unwrap();
        AppState::new(
            config,
            sea_orm::SqlxPostgresConnector::from_sqlx_postgres_pool(pool),
        )
        .unwrap()
    }

    fn required() -> Message {
        invite("Roan", "https://solace.test/login", "abc")
    }

    #[tokio::test]
    async fn password_update_notices_are_best_effort() {
        let message = password_updated("Roan", "https://solace.test/login");
        let sent = send(
            &state(false, true),
            "password update notification",
            "roan@solace.test",
            &message,
            Mode::BestEffort,
        )
        .await;
        assert!(matches!(sent, Ok(false)), "{sent:?}");
    }

    #[tokio::test]
    async fn a_missing_mailer_is_logged_in_development() {
        let sent = send(
            &state(false, false),
            "invite",
            "roan@solace.test",
            &required(),
            Mode::Required,
        )
        .await;
        assert!(matches!(sent, Ok(false)), "{sent:?}");
        let sent = send(
            &state(true, false),
            "invite",
            "roan@solace.test",
            &required(),
            Mode::Required,
        )
        .await;
        assert!(sent.is_err(), "production never drops required mail");
    }

    #[tokio::test]
    async fn required_mail_failures_are_errors() {
        let sent = send(
            &state(false, true),
            "invite",
            "roan@solace.test",
            &required(),
            Mode::Required,
        )
        .await;
        assert_eq!(
            sent.unwrap_err().to_string(),
            "invite email could not be delivered"
        );
    }

    #[test]
    fn invitation_mail_formats_the_event_like_bun() {
        let event = InvitedEvent {
            title: "Planning <Q4>",
            description: Some(" Agenda\nItems "),
            location: Some(" Room 1 "),
            start: time::macros::datetime!(2026-10-14 15:00),
            end: time::macros::datetime!(2026-10-14 16:00),
            all_day: false,
        };
        let message = event_invitation(
            " ",
            "Roan",
            &event,
            "https://solace.test/calendar?eventId=e1",
        );
        assert_eq!(message.subject, "Roan invited you to Planning <Q4>");
        assert_eq!(
            message.text,
            "Hi there,\n\nRoan invited you to \"Planning <Q4>\".\nWhen: Oct 14, 2026, 3:00 PM - Oct 14, 2026, 4:00 PM\nLocation: Room 1\n\nAgenda\nItems\n\nOpen event: https://solace.test/calendar?eventId=e1\n\nAn ICS calendar invite is attached."
        );
        assert!(
            message
                .html
                .contains("<strong>Planning &lt;Q4&gt;</strong>")
        );
        assert!(message.html.contains(" Agenda<br />Items "));
        assert!(!message.html.contains("{{"), "every placeholder is filled");
        let all_day = InvitedEvent {
            all_day: true,
            start: time::macros::datetime!(2026-10-04 00:00),
            location: None,
            description: None,
            ..event
        };
        let message = event_invitation("Bee", "Roan", &all_day, "https://solace.test/x");
        assert!(
            message.text.contains("\nWhen: Oct 4, 2026\n\nOpen event"),
            "{}",
            message.text
        );
        assert!(!message.html.contains("Location"));
    }

    #[test]
    fn delivery_warnings_are_user_safe() {
        let warning = delivery_warning("invite", "friend@example.com");
        assert_eq!(warning.code, "email_delivery_failed");
        assert_eq!(
            warning.message,
            "Could not deliver the invite email to friend@example.com. Try again later or contact support."
        );
        assert_eq!(warning.target.as_deref(), Some("friend@example.com"));
    }

    #[test]
    fn reminder_schedule_warnings_are_user_safe() {
        assert!(
            reminder_schedule_warning(ReminderContext::Create)
                .message
                .contains("could not be scheduled")
        );
        assert!(
            reminder_schedule_warning(ReminderContext::Update)
                .message
                .contains("could not be updated")
        );
    }
}
