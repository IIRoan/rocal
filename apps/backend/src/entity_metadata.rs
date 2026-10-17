//! Calendar and category names and colors (`lib/entity-metadata.ts`): ciphertext blanks the plaintext name, and plaintext beside ciphertext is refused.

use std::sync::LazyLock;

use regex_lite::Regex;
use sea_orm::{ColumnTrait, ConnectionTrait, EntityTrait, PaginatorTrait, QueryFilter};
use serde_json::Value;

use crate::db::entities::user_encryption_device;
use crate::error::AppError;
use crate::http::schemas::PLAINTEXT_NAME_WITH_CIPHERTEXT_MESSAGE;
use crate::http::zod::{js_length, js_trim};

pub const CALENDAR_COLORS: [&str; 12] = [
    "blue", "orange", "violet", "rose", "emerald", "red", "cyan", "lime", "amber", "indigo",
    "pink", "teal",
];

/// The label a calendar name leaves the device with (ICS, CalDAV) when it is encrypted or blank.
pub const ENCRYPTED_CALENDAR_EXTERNAL_LABEL: &str = "Solace calendar";
pub const MAIL_INVITATION_STAGING_CALENDAR_NAME: &str = "Invitations";
const MAX_NAME_LENGTH: usize = 100;

static HEX_COLOR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$")
        .unwrap_or_else(|error| panic!("hex color pattern: {error}"))
});

pub fn is_valid_calendar_color(color: &str) -> bool {
    HEX_COLOR.is_match(color) || CALENDAR_COLORS.contains(&color)
}

/// `hasEncryptedPayloadValue`: a string with non-blank text.
pub fn has_encrypted_payload_value(value: Option<&Value>) -> bool {
    value
        .and_then(Value::as_str)
        .is_some_and(|text| !js_trim(text).is_empty())
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
pub enum NamePersistence {
    /// The request left the name alone.
    None,
    Plaintext(String),
    Encrypted {
        encrypted_name: String,
        blind_index_tokens: String,
        encryption_key_version: i32,
    },
}

pub struct NameInput<'a> {
    pub entity_label: &'static str,
    pub name: Option<&'a str>,
    pub encrypted_name: Option<&'a str>,
    pub blind_index_tokens: Option<&'a [String]>,
    pub encryption_key_version: Option<i32>,
    pub require_name: bool,
}

/// `resolveEntityNamePersistence`.
pub fn resolve_name_persistence(input: NameInput<'_>) -> Result<NamePersistence, AppError> {
    if let Some(encrypted_name) = input.encrypted_name {
        if js_trim(encrypted_name).is_empty() {
            return Err(AppError::field(
                format!(
                    "Encrypted {} name cannot be empty",
                    input.entity_label.to_lowercase()
                ),
                "encryptedName",
            ));
        }
        if input.name.is_some_and(|name| !js_trim(name).is_empty()) {
            return Err(AppError::field(
                PLAINTEXT_NAME_WITH_CIPHERTEXT_MESSAGE,
                "name",
            ));
        }
        let tokens = serde_json::to_string(input.blind_index_tokens.unwrap_or_default())
            .map_err(AppError::internal)?;
        return Ok(NamePersistence::Encrypted {
            encrypted_name: encrypted_name.to_owned(),
            blind_index_tokens: tokens,
            encryption_key_version: input.encryption_key_version.unwrap_or(1),
        });
    }
    if input.name.is_none() && !input.require_name {
        return Ok(NamePersistence::None);
    }
    let name = js_trim(input.name.unwrap_or_default());
    if name.is_empty() {
        return Err(AppError::field(
            format!(
                "{} name is required and cannot be empty",
                input.entity_label
            ),
            "name",
        ));
    }
    if js_length(name) > MAX_NAME_LENGTH {
        return Err(AppError::field(
            format!(
                "{} name cannot exceed {MAX_NAME_LENGTH} characters",
                input.entity_label
            ),
            "name",
        ));
    }
    Ok(NamePersistence::Plaintext(name.to_owned()))
}

/// Accounts with an E2EE device must send encrypted names.
pub async fn assert_plaintext_name_allowed<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    entity_label: &str,
) -> Result<(), AppError> {
    let devices = user_encryption_device::Entity::find()
        .filter(user_encryption_device::Column::UserId.eq(user_id))
        .count(db)
        .await?;
    if devices > 0 {
        return Err(AppError::field(
            format!("{entity_label} name encryption requires an active encryption session."),
            "encryptedName",
        ));
    }
    Ok(())
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
    fn names_are_trimmed_and_counted_in_utf16_units() {
        fn input(name: &str) -> NameInput<'_> {
            NameInput {
                entity_label: "Calendar",
                name: Some(name),
                encrypted_name: None,
                blind_index_tokens: None,
                encryption_key_version: None,
                require_name: true,
            }
        }
        assert!(matches!(
            resolve_name_persistence(input("  Work  ")),
            Ok(NamePersistence::Plaintext(name)) if name == "Work"
        ));
        assert!(resolve_name_persistence(input(&"😀".repeat(50))).is_ok());
        assert!(resolve_name_persistence(input(&"😀".repeat(51))).is_err());
        assert!(resolve_name_persistence(input("   ")).is_err());
    }
}
