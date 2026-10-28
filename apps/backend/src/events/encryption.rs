//! Event content is client ciphertext; the server only reads the transient invitation copy.

use sea_orm::Set;

use crate::db::entities::calendar_event;
use crate::http::zod::js_trim;
use crate::integrations::ics::trimmed_text;

/// Ciphertext replaces the content, so no plaintext copy stays beside it.
pub fn clear_plaintext(row: &mut calendar_event::ActiveModel) {
    row.title = Set(String::new());
    row.description = Set(None);
    row.location = Set(None);
    row.encryption_state = Set("encrypted".into());
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
