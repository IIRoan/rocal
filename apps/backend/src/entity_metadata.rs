//! Calendar and category names and colors: owned names are stored only as client ciphertext.

use std::sync::LazyLock;

use regex_lite::Regex;

use crate::error::AppError;
use crate::http::zod::js_trim;

pub const CALENDAR_COLORS: [&str; 12] = [
    "blue", "orange", "violet", "rose", "emerald", "red", "cyan", "lime", "amber", "indigo",
    "pink", "teal",
];

/// The label a calendar name leaves the device with (ICS, CalDAV) when it is encrypted or blank.
pub const ENCRYPTED_CALENDAR_EXTERNAL_LABEL: &str = "Solace calendar";
pub const MAIL_INVITATION_STAGING_CALENDAR_NAME: &str = "Invitations";

static HEX_COLOR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$")
        .unwrap_or_else(|error| panic!("hex color pattern: {error}"))
});

pub fn is_valid_calendar_color(color: &str) -> bool {
    HEX_COLOR.is_match(color) || CALENDAR_COLORS.contains(&color)
}

pub fn assert_valid_entity_color(color: &str) -> Result<(), AppError> {
    if is_valid_calendar_color(color) {
        return Ok(());
    }
    Err(AppError::field(
        format!(
            "Color must be one of: {} or a valid hex color (e.g., #FF0000)",
            CALENDAR_COLORS.join(", ")
        ),
        "color",
    ))
}

/// What a create or update writes to the name columns.
pub struct EncryptedName {
    pub encrypted_name: String,
    pub blind_index_tokens: String,
    pub encryption_key_version: i32,
}

/// Writes an `Option<EncryptedName>` onto a calendar or category row, blanking the plaintext name.
macro_rules! apply_name {
    ($row:expr, $name:expr) => {
        if let Some(name) = $name {
            $row.name = sea_orm::Set(String::new());
            $row.encrypted_name = sea_orm::Set(Some(name.encrypted_name));
            $row.blind_index_tokens = sea_orm::Set(Some(name.blind_index_tokens));
            $row.encryption_state = sea_orm::Set("encrypted".into());
            $row.encryption_key_version = sea_orm::Set(name.encryption_key_version);
        }
    };
}
pub(crate) use apply_name;

pub struct NameInput<'a> {
    pub entity_label: &'static str,
    pub encrypted_name: Option<&'a str>,
    pub blind_index_tokens: Option<&'a [String]>,
    pub encryption_key_version: Option<i32>,
}

/// An omitted name is left alone; a given one must be non-blank ciphertext.
pub fn resolve_name_persistence(input: NameInput<'_>) -> Result<Option<EncryptedName>, AppError> {
    let Some(encrypted_name) = input.encrypted_name else {
        return Ok(None);
    };
    if js_trim(encrypted_name).is_empty() {
        return Err(AppError::field(
            format!(
                "Encrypted {} name cannot be empty",
                input.entity_label.to_lowercase()
            ),
            "encryptedName",
        ));
    }
    let tokens = serde_json::to_string(input.blind_index_tokens.unwrap_or_default())
        .map_err(AppError::internal)?;
    Ok(Some(EncryptedName {
        encrypted_name: encrypted_name.to_owned(),
        blind_index_tokens: tokens,
        encryption_key_version: input.encryption_key_version.unwrap_or(1),
    }))
}

/// The calendar label sent to Stalwart and ICS; encrypted names never leave the device.
pub fn external_calendar_name(name: &str) -> String {
    let trimmed = js_trim(name);
    if trimmed.is_empty() {
        ENCRYPTED_CALENDAR_EXTERNAL_LABEL.into()
    } else {
        trimmed.to_owned()
    }
}

/// `isMailInvitationStagingCalendar`: the hidden calendar mail invitations land in.
pub fn is_mail_invitation_staging_calendar(
    kind: &str,
    is_sync_only: bool,
    is_visible: bool,
    name: &str,
) -> bool {
    kind == "owned" && !is_sync_only && !is_visible && name == MAIL_INVITATION_STAGING_CALENDAR_NAME
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn colors_are_named_or_hex() {
        for color in ["blue", "teal", "#fff", "#10B981"] {
            assert!(is_valid_calendar_color(color), "{color}");
        }
        for color in ["Blue", "#ffff", "#ggg", "", "purple"] {
            assert!(!is_valid_calendar_color(color), "{color}");
        }
    }

    #[test]
    fn names_are_ciphertext_or_left_alone() {
        fn input(encrypted_name: Option<&str>) -> NameInput<'_> {
            NameInput {
                entity_label: "Calendar",
                encrypted_name,
                blind_index_tokens: None,
                encryption_key_version: None,
            }
        }
        assert!(matches!(
            resolve_name_persistence(input(Some("ct"))),
            Ok(Some(EncryptedName { encrypted_name, encryption_key_version: 1, .. })) if encrypted_name == "ct"
        ));
        assert!(matches!(resolve_name_persistence(input(None)), Ok(None)));
        assert!(resolve_name_persistence(input(Some("   "))).is_err());
    }
}
