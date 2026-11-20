//! Event content is client ciphertext; the server only reads the transient invitation copy.

use sea_orm::Set;

use crate::db::entities::calendar_event;
use crate::error::AppError;
use crate::http::zod::{js_trim, non_blank};
use crate::integrations::ics::trimmed_text;

/// Ciphertext replaces the content, so no plaintext copy stays beside it.
pub fn clear_plaintext(row: &mut calendar_event::ActiveModel) {
    row.title = Set(String::new());
    row.description = Set(None);
    row.location = Set(None);
    row.encryption_state = Set("encrypted".into());
}

/// `encryptionKeyVersion` of content bound to its row id (`event-content:v2:<id>`); 1 is the unbound format.
pub const BOUND_EVENT_CONTENT_VERSION: i32 = 2;

/// New event content must be bound to its row id; unbound content stays only where it was, until its re-seal.
pub fn require_bound_content(
    new_ciphertext: Option<&str>,
    new_version: Option<i32>,
) -> Result<(), AppError> {
    if non_blank(new_ciphertext).is_some() && new_version.unwrap_or(1) < BOUND_EVENT_CONTENT_VERSION
    {
        return Err(AppError::Conflict(
            "Update the app to save this event.".into(),
        ));
    }
    Ok(())
}

/// What an invitation mail shows: the transient `invitationContent`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvitationContentSource {
    pub title: String,
    pub description: Option<String>,
    pub location: Option<String>,
}

/// Without the transient copy there is no plaintext to mail, so nobody is invited.
pub fn resolve_invitation_content(
    invitation: Option<&solace_api_types::events::InvitationContent>,
) -> Option<InvitationContentSource> {
    invitation.map(|invitation| InvitationContentSource {
        title: js_trim(&invitation.title).to_owned(),
        description: trimmed_text(invitation.description.as_deref()),
        location: trimmed_text(invitation.location.as_deref()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_bound_content_is_written() {
        let refuse = |content, version| require_bound_content(content, version).is_err();
        assert!(refuse(Some("c"), None));
        assert!(refuse(Some("c"), Some(1)));
        assert!(!refuse(Some("c"), Some(2)));
        assert!(!refuse(None, Some(1)));
        assert!(!refuse(Some(" "), Some(1)));
    }

    #[test]
    fn invitations_use_only_the_transient_copy() {
        let copy = solace_api_types::events::InvitationContent {
            title: " Launch ".into(),
            description: Some("  ".into()),
            location: None,
        };
        assert_eq!(
            resolve_invitation_content(Some(&copy)),
            Some(InvitationContentSource {
                title: "Launch".into(),
                description: None,
                location: None,
            })
        );
        assert_eq!(resolve_invitation_content(None), None);
    }
}
