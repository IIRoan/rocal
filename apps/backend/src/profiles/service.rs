//! Profile lookup and the `solace-profiles.ts` rules: which emails are looked up and which pictures are shown.

use solace_api_types::profiles::{ProfileLookupResponse, SolaceProfile};

use super::queries::{self, AvatarOwner};
use crate::addresses;
use crate::error::AppError;
use crate::integrations::ics::normalize_email;
use crate::state::AppState;

/// `SOLACE_PROFILE_LOOKUP_MAX_EMAILS`.
pub const LOOKUP_MAX_EMAILS: usize = 50;
const UPLOADED_AVATAR_PATH_PREFIX: &str = "/api/profiles/avatars/";

/// `normalizeSolaceProfileLookupEmails`: normalized, deduplicated addresses, at most 50.
fn lookup_emails(emails: &[String]) -> Vec<String> {
    let mut result: Vec<String> = Vec::new();
    for email in emails.iter().map(|email| normalize_email(email)) {
        if email.is_empty() || !email.contains('@') || result.contains(&email) {
            continue;
        }
        result.push(email);
        if result.len() >= LOOKUP_MAX_EMAILS {
            break;
        }
    }
    result
}

/// `buildSolaceUploadedAvatarPath`: an opaque id, so no email ends up in the URL.
pub fn uploaded_avatar_path(avatar_id: &str) -> String {
    format!("{UPLOADED_AVATAR_PATH_PREFIX}{avatar_id}")
}

/// Only pictures uploaded to Solace are shown; nothing points at another host.
pub fn participant_image(image: Option<&str>) -> Option<String> {
    image
        .filter(|path| path.starts_with(UPLOADED_AVATAR_PATH_PREFIX))
        .map(str::to_owned)
}

/// `findAvatarOwner`: the account or mailbox alias with this address that has a picture.
pub async fn avatar_owner(state: &AppState, email: &str) -> Result<Option<AvatarOwner>, AppError> {
    let normalized = normalize_email(email);
    if normalized.is_empty() || addresses::is_reserved_system_email(&normalized, None) {
        return Ok(None);
    }
    Ok(queries::avatar_owner(&state.db, &normalized).await?)
}

/// `ProfileService.lookup`.
pub async fn lookup(
    state: &AppState,
    emails: &[String],
) -> Result<ProfileLookupResponse, AppError> {
    let mut profiles = Vec::new();
    for email in lookup_emails(emails) {
        if addresses::is_reserved_system_email(&email, None) {
            continue;
        }
        if let Some(owner) = avatar_owner(state, &email).await? {
            let image = uploaded_avatar_path(&owner.avatar_id);
            profiles.push(SolaceProfile { email, image });
        }
    }
    Ok(ProfileLookupResponse { profiles })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lookup_emails_are_normalized_deduplicated_and_capped() {
        let emails: Vec<String> = [
            " A@Example.com ",
            "a@example.com",
            "MAILTO:b@example.com",
            "x",
            "",
        ]
        .map(str::to_owned)
        .into();
        assert_eq!(lookup_emails(&emails), ["a@example.com", "b@example.com"]);
        let many: Vec<String> = (0..60).map(|i| format!("u{i}@example.com")).collect();
        assert_eq!(lookup_emails(&many).len(), 50);
    }

    #[test]
    fn participant_pictures_are_uploads_only() {
        assert_eq!(
            participant_image(Some("/api/profiles/avatars/abc")).as_deref(),
            Some("/api/profiles/avatars/abc")
        );
        assert_eq!(
            participant_image(Some("https://cdn.example.com/a.png")),
            None
        );
        assert_eq!(participant_image(None), None);
    }
}
