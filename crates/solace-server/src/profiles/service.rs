//! Profile lookup and the `solace-profiles.ts` rules: which emails are looked up and which pictures are usable.

use std::sync::LazyLock;

use regex_lite::Regex;
use solace_api_types::profiles::{ProfileLookupResponse, SolaceProfile};

use super::queries::{self, AvatarOwner};
use crate::addresses;
use crate::auth::cookies::encode_uri_component;
use crate::error::AppError;
use crate::http::zod::js_length;
use crate::state::AppState;

const LOOKUP_MAX_EMAILS: usize = 50;
const MAX_PUBLIC_IMAGE_URL_LENGTH: usize = 2048;
const UPLOADED_AVATAR_PATH_PREFIX: &str = "/api/profiles/avatars/";

/// `BLOCKED_IMAGE_HOST_PATTERNS`.
static BLOCKED_IMAGE_HOSTS: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    [
        r"(?i)^localhost$",
        r"^127\.",
        r"^0\.",
        r"^10\.",
        r"^192\.168\.",
        r"^172\.(1[6-9]|2[0-9]|3[0-1])\.",
        r"^169\.254\.",
        r"^::1$",
        r"^\[::1\]$",
        r"(?i)\.localhost$",
        r"(?i)\.local$",
        r"(?i)\.internal$",
        r"(?i)^metadata\.google\.internal$",
    ]
    .iter()
    .map(|pattern| {
        Regex::new(pattern).unwrap_or_else(|error| panic!("image host pattern: {error}"))
    })
    .collect()
});

/// `normalizeParticipantEmail`.
pub fn normalize_participant_email(email: &str) -> String {
    let trimmed = email.trim();
    let unprefixed = match trimmed.get(..7) {
        Some(prefix) if prefix.eq_ignore_ascii_case("mailto:") => &trimmed[7..],
        _ => trimmed,
    };
    unprefixed.to_lowercase()
}

/// `normalizeSolaceProfileLookupEmails`: normalized, deduplicated addresses, at most 50.
fn lookup_emails(emails: &[String]) -> Vec<String> {
    let mut result: Vec<String> = Vec::new();
    for email in emails
        .iter()
        .map(|email| normalize_participant_email(email))
    {
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

/// `sanitizePublicImageUrl`: public HTTPS without credentials, so pictures cannot beacon internal hosts.
pub fn public_image_url(value: Option<&str>) -> Option<String> {
    let trimmed = value?.trim();
    if trimmed.is_empty() || js_length(trimmed) > MAX_PUBLIC_IMAGE_URL_LENGTH {
        return None;
    }
    let url = url::Url::parse(trimmed).ok()?;
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some() {
        return None;
    }
    let hostname = url.host_str()?.trim();
    if hostname.is_empty()
        || BLOCKED_IMAGE_HOSTS
            .iter()
            .any(|pattern| pattern.is_match(hostname))
    {
        return None;
    }
    let ipv6 = hostname.trim_start_matches('[').trim_end_matches(']');
    let ipv6 = ipv6.to_lowercase();
    if ipv6.contains(':')
        && (ipv6.starts_with("fc")
            || ipv6.starts_with("fd")
            || ipv6.starts_with("fe80")
            || ipv6 == "::1")
    {
        return None;
    }
    Some(url.to_string())
}

/// `buildSolaceUploadedAvatarPath`: an opaque id, so no email ends up in the URL.
pub fn uploaded_avatar_path(avatar_id: &str) -> String {
    format!("{UPLOADED_AVATAR_PATH_PREFIX}{avatar_id}")
}

/// `buildSolaceProfileAvatarPath`; carries the email (a known privacy gap, ported as is).
fn email_avatar_path(email: &str) -> Option<String> {
    let normalized = normalize_participant_email(email);
    (!normalized.is_empty()).then(|| {
        format!(
            "/api/profiles/avatar?email={}",
            encode_uri_component(&normalized)
        )
    })
}

/// The picture rule of `mapEventParticipant`: an uploaded-avatar path as is, else the email proxy for a usable external image.
pub fn participant_image(image: Option<&str>, email: &str) -> Option<String> {
    match image {
        Some(path) if path.starts_with(UPLOADED_AVATAR_PATH_PREFIX) => Some(path.to_owned()),
        _ if public_image_url(image).is_some() => email_avatar_path(email),
        _ => None,
    }
}

/// `findAvatarOwner`: the account or mailbox alias with this address that has a picture.
pub async fn avatar_owner(state: &AppState, email: &str) -> Result<Option<AvatarOwner>, AppError> {
    let normalized = normalize_participant_email(email);
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
        let image = match avatar_owner(state, &email).await? {
            Some(AvatarOwner {
                avatar_id: Some(avatar_id),
                ..
            }) => uploaded_avatar_path(&avatar_id),
            Some(owner) if public_image_url(owner.image.as_deref()).is_some() => {
                match email_avatar_path(&email) {
                    Some(path) => path,
                    None => continue,
                }
            }
            _ => continue,
        };
        profiles.push(SolaceProfile { email, image });
    }
    Ok(ProfileLookupResponse { profiles })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_public_https_pictures_are_usable() {
        assert_eq!(
            public_image_url(Some(" https://cdn.example.com/a.png ")).as_deref(),
            Some("https://cdn.example.com/a.png")
        );
        for refused in [
            None,
            Some(""),
            Some("http://cdn.example.com/a.png"),
            Some("https://user:pw@cdn.example.com/a.png"),
            Some("https://localhost/a.png"),
            Some("https://10.1.2.3/a.png"),
            Some("https://172.20.0.1/a.png"),
            Some("https://[::1]/a.png"),
            Some("https://[fd00::1]/a.png"),
            Some("https://printer.local/a.png"),
            Some("not a url"),
        ] {
            assert_eq!(public_image_url(refused), None, "{refused:?}");
        }
        let long = format!("https://cdn.example.com/{}", "a".repeat(2048));
        assert_eq!(public_image_url(Some(&long)), None);
        assert!(public_image_url(Some("https://192.0.2.10/me.png")).is_some());
    }

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
        assert_eq!(
            email_avatar_path("Root+x@Example.com").as_deref(),
            Some("/api/profiles/avatar?email=root%2Bx%40example.com")
        );
        assert_eq!(email_avatar_path(" "), None);
    }

    #[test]
    fn participant_pictures_keep_uploads_and_proxy_usable_external_images() {
        assert_eq!(
            participant_image(Some("/api/profiles/avatars/abc"), "a@example.com").as_deref(),
            Some("/api/profiles/avatars/abc")
        );
        assert_eq!(
            participant_image(
                Some("https://cdn.example.com/a.png"),
                " MAILTO:A@Example.com"
            )
            .as_deref(),
            Some("/api/profiles/avatar?email=a%40example.com")
        );
        assert_eq!(
            participant_image(Some("http://cdn.example.com/a.png"), "a@example.com"),
            None
        );
        assert_eq!(participant_image(None, "a@example.com"), None);
    }
}
