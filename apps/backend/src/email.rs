//! App mail from the noreply identity: the `auth-email.ts` templates, delivery modes, and the user-safe warnings for failed sends.

use solace_api_types::common::OperationWarning;

use crate::http::zod::js_trim;
use crate::integrations::stalwart::mailer::{self, Attachment};
use crate::state::AppState;
use crate::telemetry;

const SHELL: &str = include_str!("email/shell.html");
const ACCOUNT_SECURITY: &str = include_str!("email/account_security.html");
const INVITE: &str = include_str!("email/invite.html");
const EVENT_INVITATION: &str = include_str!("email/event_invitation.html");
/// Where to turn when an account change was not the owner's; mirrors `supportEmail` in `product-info.json`.
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
    let links = [("APP_URL", APP_URL), ("LOGO_URL", LOGO_URL)];
    for (name, value) in links.iter().chain(fill) {
        let placeholder = format!("{{{{{name}}}}}");
        body = body.replace(&placeholder, value);
        footer = footer.replace(&placeholder, value);
    }
    SHELL
        .replace("{{TITLE}}", &escape_html(title))
        .replace("{{PREVIEW}}", &escape_html(preview))
        .replace("{{BODY}}", &body)
        .replace("{{FOOTER}}", &footer)
}

/// The name a notice greets, or "there" when the account has none.
pub fn greeting(name: &str) -> String {
    let name = name.trim();
    if name.is_empty() {
        "there".into()
    } else {
        name.to_owned()
    }
}

/// The sign-in page account notices link to.
pub fn sign_in_url(state: &AppState) -> String {
    format!("{}/login", state.config.frontend_url.trim_end_matches('/'))
}

/// A notice about a change to how the account is opened, with the support address for an owner who did not make it.
fn account_security(
    subject: &str,
    heading: &str,
    name: &str,
    message: &str,
    detail: &str,
    sign_in_url: &str,
) -> Message {
    let html = layout(
        ACCOUNT_SECURITY,
        heading,
        message,
        &[
            ("HEADING", &escape_html(heading)),
            ("NAME", &escape_html(name)),
            ("MESSAGE", &escape_html(message)),
            ("DETAIL", &escape_html(detail)),
            ("SIGN_IN_URL", &escape_html(sign_in_url)),
            ("SUPPORT_EMAIL", &escape_html(SUPPORT_EMAIL)),
        ],
    );
    let mut letters = message.chars();
    // The HTML continues "Hi {name}, " with the message; on its own line it opens a sentence.
    let sentence: String = letters
        .next()
        .map(|first| first.to_uppercase().chain(letters).collect())
        .unwrap_or_default();
    let text = [
        format!("Hi {name},"),
        String::new(),
        sentence,
        detail.to_owned(),
        format!("If this wasn't you, email {SUPPORT_EMAIL} from another address right away."),
    ]
    .join("\n");
    Message {
        subject: subject.into(),
        text,
        html,
        attachments: Vec::new(),
        message_id: None,
    }
}

pub fn password_updated(name: &str, sign_in_url: &str) -> Message {
    account_security(
        "Your Solace password was updated",
        "Your password was changed",
        name,
        "the password for your Solace account was changed. If you made this change, no further action is needed.",
        "Solace also uses this password to protect your encryption keys on every device.",
        sign_in_url,
    )
}

pub fn recovery_kit_changed(name: &str, created: bool, sign_in_url: &str) -> Message {
    if created {
        account_security(
            "A new Solace recovery kit was created",
            "New recovery kit",
            name,
            "a new recovery kit was created for your Solace account. Any earlier kit no longer works.",
            "Anyone with the kit and your email can reset your password, so keep it somewhere safe.",
            sign_in_url,
        )
    } else {
        account_security(
            "Your Solace recovery kit was removed",
            "Recovery kit removed",
            name,
            "the recovery kit for your Solace account was removed.",
            "Without a recovery kit, a forgotten password can only be handled by support.",
            sign_in_url,
        )
    }
}

pub fn account_recovered(name: &str, sign_in_url: &str) -> Message {
    account_security(
        "Your Solace password was reset with your recovery kit",
        "Your password was reset",
        name,
        "your recovery kit was used to set a new password for your Solace account, and every device was signed out.",
        "The kit is used up. Sign in with the new password and create a new recovery kit in Settings.",
        sign_in_url,
    )
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
    /// The event's zone, which the mail shows its times in (UTC when unknown).
    pub timezone: Option<&'a str>,
}

/// The stored UTC start and end on the event's wall clock; all-day dates stay as they are.
fn wall_clock(event: &InvitedEvent<'_>) -> [jiff::Zoned; 2] {
    let zone = event
        .timezone
        .filter(|_| !event.all_day)
        .and_then(crate::instant::time_zone)
        .unwrap_or(jiff::tz::TimeZone::UTC);
    [event.start, event.end].map(|at| {
        jiff::Timestamp::from_second(at.assume_utc().unix_timestamp())
            .unwrap_or(jiff::Timestamp::UNIX_EPOCH)
            .to_zoned(zone.clone())
    })
}

/// Google Calendar's "Wed Oct 14, 2026 · 3:00 PM – 4:00 PM (CEST)", or the start date of an all-day event.
fn event_when(start: &jiff::Zoned, end: &jiff::Zoned, all_day: bool) -> String {
    let day = |at: &jiff::Zoned| at.strftime("%a %b %-d, %Y").to_string();
    let clock = |at: &jiff::Zoned| at.strftime("%-I:%M %p").to_string();
    if all_day {
        return format!("{} (all day)", day(start));
    }
    let zone = start.strftime("%Z");
    if start.date() == end.date() {
        format!(
            "{} · {} – {} ({zone})",
            day(start),
            clock(start),
            clock(end)
        )
    } else {
        format!(
            "{} {} – {} {} ({zone})",
            day(start),
            clock(start),
            day(end),
            clock(end)
        )
    }
}

const LOCATION_LINE: &str = r#"<p class="email-muted" style="margin:2px 0 0;font-size:14px;line-height:20px;color:#6b6b6b">"#;
const NOTES_BLOCK: &str = r#"<p class="email-text" style="margin:16px 0 0;font-size:14px;line-height:20px;color:#202020">"#;

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
    let [start, end] = wall_clock(event);
    let when = event_when(&start, &end, event.all_day);
    let location = event.location.filter(|text| !js_trim(text).is_empty());
    let description = event.description.filter(|text| !js_trim(text).is_empty());
    let location_line = location
        .map(|location| format!("{LOCATION_LINE}{}</p>", escape_html(js_trim(location))))
        .unwrap_or_default();
    let notes = description
        .map(|description| {
            format!(
                "{NOTES_BLOCK}{}</p>",
                escape_html(description).replace('\n', "<br />")
            )
        })
        .unwrap_or_default();
    let html = layout(
        EVENT_INVITATION,
        "Event invitation",
        &format!("{inviter} invited you to {}.", event.title),
        &[
            ("ATTENDEE", &escape_html(attendee)),
            ("INVITER", &escape_html(inviter)),
            ("TITLE", &escape_html(event.title)),
            ("WHEN", &escape_html(&when)),
            ("LOCATION", &location_line),
            ("NOTES", &notes),
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
        subject: format!("Invitation: {} @ {when}", event.title),
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
        assert!(changed.html.contains("Hi &lt;Roan&gt;, the password"));
        assert!(
            changed
                .text
                .contains("Hi <Roan>,\n\nThe password for your Solace account")
        );
        assert!(!changed.html.contains("{{"), "every placeholder is filled");
    }

    #[test]
    fn recovery_notices_say_what_happened_and_where_to_turn() {
        let url = "https://solace.test/login";
        for (message, subject) in [
            (
                recovery_kit_changed("Roan", true, url),
                "A new Solace recovery kit was created",
            ),
            (
                recovery_kit_changed("Roan", false, url),
                "Your Solace recovery kit was removed",
            ),
            (
                account_recovered("Roan", url),
                "Your Solace password was reset with your recovery kit",
            ),
        ] {
            assert_eq!(message.subject, subject);
            assert!(message.text.contains("support@solace.onl"), "{subject}");
            assert!(!message.html.contains("{{"), "{subject}");
        }
        assert!(account_recovered("Roan", url).text.contains("signed out"));
        assert_eq!(greeting("  "), "there");
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
            timezone: None,
        };
        let message = event_invitation(
            " ",
            "Roan",
            &event,
            "https://solace.test/calendar?eventId=e1",
        );
        assert_eq!(
            message.subject,
            "Invitation: Planning <Q4> @ Wed Oct 14, 2026 · 3:00 PM – 4:00 PM (UTC)"
        );
        assert_eq!(
            message.text,
            "Hi there,\n\nRoan invited you to \"Planning <Q4>\".\nWhen: Wed Oct 14, 2026 · 3:00 PM – 4:00 PM (UTC)\nLocation: Room 1\n\nAgenda\nItems\n\nOpen event: https://solace.test/calendar?eventId=e1\n\nAn ICS calendar invite is attached."
        );
        assert!(message.html.contains(">Planning &lt;Q4&gt;</h1>"));
        assert!(
            message
                .html
                .contains(">Wed Oct 14, 2026 · 3:00 PM – 4:00 PM (UTC)</p>")
        );
        assert!(message.html.contains(">Room 1</p>"));
        assert!(message.html.contains(" Agenda<br />Items "));
        assert!(!message.html.contains("{{"), "every placeholder is filled");
        let amsterdam = InvitedEvent {
            timezone: Some("Europe/Amsterdam"),
            ..event
        };
        let message = event_invitation("Bee", "Roan", &amsterdam, "https://solace.test/x");
        assert!(
            message
                .text
                .contains("When: Wed Oct 14, 2026 · 5:00 PM – 6:00 PM (CEST)"),
            "times follow the event's zone: {}",
            message.text
        );
        let all_day = InvitedEvent {
            all_day: true,
            start: time::macros::datetime!(2026-10-04 00:00),
            location: None,
            description: None,
            ..amsterdam
        };
        let message = event_invitation("Bee", "Roan", &all_day, "https://solace.test/x");
        assert!(
            message
                .text
                .contains("\nWhen: Sun Oct 4, 2026 (all day)\n\nOpen event"),
            "{}",
            message.text
        );
        assert!(!message.html.contains("Room 1") && !message.html.contains("{{"));
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
