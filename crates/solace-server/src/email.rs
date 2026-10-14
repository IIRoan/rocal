//! App mail from the noreply identity: the `auth-email.ts` templates, delivery modes, and the user-safe warnings for failed sends.

use solace_api_types::common::OperationWarning;

use crate::integrations::stalwart::mailer::{self, Attachment};
use crate::state::AppState;
use crate::telemetry;

const SHELL: &str = include_str!("email/shell.html");
const PASSWORD_RESET: &str = include_str!("email/password_reset.html");
const PASSWORD_UPDATED: &str = include_str!("email/password_updated.html");
const INVITE: &str = include_str!("email/invite.html");
const LOGO_URL: &str = "https://solace.onl/favicon-192x192.png";
const APP_URL: &str = "https://solace.onl";
const FOOTER_SEPARATOR: &str = "\n<!-- footer -->\n";

#[derive(Debug, Clone)]
pub struct Message {
    pub subject: String,
    pub text: String,
    pub html: String,
    pub attachments: Vec<Attachment>,
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

pub fn password_reset(name: &str, reset_url: &str) -> Message {
    let html = layout(
        PASSWORD_RESET,
        "Reset your Solace password",
        "Reset your Solace password — this link expires in 1 hour.",
        &[
            ("NAME", &escape_html(name)),
            ("RESET_URL", &escape_html(reset_url)),
        ],
    );
    let text = [
        format!("Hi {name},"),
        String::new(),
        "Solace received a request to reset your password.".into(),
        "If you sign in with email and password, Solace also uses that password to protect your encryption keys after you sign in.".into(),
        "GitHub and passkey sign-in keep using a separate encryption password.".into(),
        String::new(),
        "Use the link below to choose a new password:".into(),
        reset_url.into(),
        String::new(),
        "This link expires in 1 hour.".into(),
        String::new(),
        "If you did not request this change, you can safely ignore this email.".into(),
    ]
    .join("\n");
    Message {
        subject: "Reset your Solace password".into(),
        text,
        html,
        attachments: Vec::new(),
    }
}

#[derive(Debug, Clone, Copy)]
pub enum PasswordAction {
    Changed,
    Reset,
}

pub fn password_updated(name: &str, action: PasswordAction, sign_in_url: &str) -> Message {
    let action = match action {
        PasswordAction::Changed => "changed",
        PasswordAction::Reset => "reset",
    };
    let html = layout(
        PASSWORD_UPDATED,
        &format!("Your Solace password was {action}"),
        &format!("Your Solace password was successfully {action}."),
        &[
            ("NAME", &escape_html(name)),
            ("SIGN_IN_URL", &escape_html(sign_in_url)),
            ("ACTION", &escape_html(action)),
        ],
    );
    let text = [
        format!("Hi {name},"),
        String::new(),
        format!("This is a confirmation that your Solace password was {action}."),
        "If you made this change, no further action is needed.".into(),
        "After you sign in with email and password, Solace will also use this password to protect your encryption keys.".into(),
        "GitHub and passkey sign-in keep using a separate encryption password.".into(),
        format!("If you did not make this change, reset your password immediately: {sign_in_url}"),
    ]
    .join("\n");
    Message {
        subject: "Your Solace password was updated".into(),
        text,
        html,
        attachments: Vec::new(),
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
    fn reset_mail_escapes_the_name_in_html() {
        let message = password_reset("<Roan>", "https://solace.test/reset?token=abc");
        assert_eq!(message.subject, "Reset your Solace password");
        assert!(message.text.contains("https://solace.test/reset?token=abc"));
        assert!(
            message
                .text
                .contains("GitHub and passkey sign-in keep using a separate encryption password.")
        );
        assert!(message.html.contains("Hi &lt;Roan&gt;"));
        assert!(message.html.contains("Reset password"));
        assert!(!message.html.contains("{{"), "every placeholder is filled");
    }

    #[test]
    fn updated_mail_names_the_action() {
        let reset = password_updated("Roan", PasswordAction::Reset, "https://solace.test/login");
        assert_eq!(reset.subject, "Your Solace password was updated");
        assert!(reset.text.contains("was reset") && reset.html.contains("Open Solace"));
        let changed =
            password_updated("Roan", PasswordAction::Changed, "https://solace.test/login");
        assert!(
            changed.text.contains("was changed") && changed.html.contains("password was changed")
        );
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

    fn reset() -> Message {
        password_reset("Roan", "https://solace.test/reset?token=abc")
    }

    #[tokio::test]
    async fn password_update_notices_are_best_effort() {
        let message =
            password_updated("Roan", PasswordAction::Changed, "https://solace.test/login");
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
            "password reset",
            "roan@solace.test",
            &reset(),
            Mode::Required,
        )
        .await;
        assert!(matches!(sent, Ok(false)), "{sent:?}");
        let sent = send(
            &state(true, false),
            "password reset",
            "roan@solace.test",
            &reset(),
            Mode::Required,
        )
        .await;
        assert!(sent.is_err(), "production never drops required mail");
    }

    #[tokio::test]
    async fn required_mail_failures_are_errors() {
        let sent = send(
            &state(false, true),
            "password reset",
            "roan@solace.test",
            &reset(),
            Mode::Required,
        )
        .await;
        assert_eq!(
            sent.unwrap_err().to_string(),
            "password reset email could not be delivered"
        );
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
