//! Key envelopes are stored as the client sent them (trimmed, defaults filled in); the server never unwraps them.

use solace_api_types::SuccessMessage;
use solace_api_types::e2ee::{
    E2eeAlgorithms, E2eeBootstrap, EncryptionCalendar, EncryptionCategory, EncryptionDevice,
    EncryptionEvent, PasswordEnvelope, PasswordEnvelopeRequest, RegisterDeviceRequest,
    ResetSnapshot,
};

use super::queries::{self, DeviceKeys, EventRow, PasswordKeys};
use crate::auth::guard::RouteUser;
use crate::db::entities::{
    calendar, event_category, user_encryption_device, user_encryption_password,
};
use crate::error::AppError;
use crate::http::zod::js_trim;
use crate::instant;
use crate::state::AppState;

const DEFAULT_PUBLIC_KEY_ALGORITHM: &str = "RSA-OAEP-256";
const DEFAULT_WRAP_ALGORITHM: &str = "RSA-OAEP-256";
const DEFAULT_PASSWORD_KDF_ALGORITHM: &str = "PBKDF2-SHA-256";
const DEFAULT_PASSWORD_WRAP_ALGORITHM: &str = "AES-GCM-256";
const DEFAULT_PASSWORD_KDF_ITERATIONS: i32 = 310_000;

pub async fn bootstrap(state: &AppState, user: &RouteUser) -> Result<E2eeBootstrap, AppError> {
    let (devices, password_envelope, calendars) = tokio::try_join!(
        queries::devices(&state.db, &user.id),
        queries::password_envelope(&state.db, &user.id),
        queries::calendars(&state.db, &user.id, false),
    )?;
    Ok(E2eeBootstrap {
        enabled: true,
        algorithms: E2eeAlgorithms {
            content: "AES-GCM-256".into(),
            blind_index: "HMAC-SHA-256".into(),
            wrapping: DEFAULT_WRAP_ALGORITHM.into(),
            password_wrapping: DEFAULT_PASSWORD_WRAP_ALGORITHM.into(),
        },
        devices: devices.into_iter().map(device_record).collect(),
        password_envelope: password_envelope.map(password_record),
        calendars: calendars.into_iter().map(calendar_record).collect(),
    })
}

pub async fn reset_snapshot(state: &AppState, user: &RouteUser) -> Result<ResetSnapshot, AppError> {
    let (calendars, categories, events) = tokio::try_join!(
        queries::calendars(&state.db, &user.id, true),
        queries::active_categories(&state.db, &user.id),
        queries::unsynced_events(&state.db, &user.id),
    )?;
    Ok(ResetSnapshot {
        calendars: calendars.into_iter().map(calendar_record).collect(),
        categories: categories.into_iter().map(category_record).collect(),
        events: events.into_iter().map(event_record).collect(),
    })
}

/// `value?.trim() || fallback`.
fn trimmed_or(value: Option<&str>, fallback: &str) -> String {
    value
        .map(js_trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(fallback)
        .to_owned()
}

/// A blank trimmed value is a service error naming the field.
fn required(value: &str, message: &str, field: &str) -> Result<String, AppError> {
    let value = js_trim(value);
    if value.is_empty() {
        return Err(AppError::field(message, field));
    }
    Ok(value.to_owned())
}

/// The account and search keys wrapped for a device or a password, and their key version.
fn wrapped_keys(
    account: &str,
    search: &str,
    key_version: Option<i32>,
) -> Result<(String, String, i32), AppError> {
    let account = required(
        account,
        "Wrapped account key is required",
        "wrappedAccountKey",
    )?;
    let search = required(search, "Wrapped search key is required", "wrappedSearchKey")?;
    let key_version = key_version.unwrap_or(1);
    if key_version < 1 {
        return Err(AppError::field(
            "Key version must be at least 1",
            "keyVersion",
        ));
    }
    Ok((account, search, key_version))
}

pub async fn register_device(
    state: &AppState,
    user: &RouteUser,
    request: RegisterDeviceRequest,
) -> Result<EncryptionDevice, AppError> {
    let device_id = required(&request.device_id, "Device ID is required", "deviceId")?;
    let public_key = required(&request.public_key, "Public key is required", "publicKey")?;
    let (wrapped_account_key, wrapped_search_key, key_version) = wrapped_keys(
        &request.wrapped_account_key,
        &request.wrapped_search_key,
        request.key_version,
    )?;
    let keys = DeviceKeys {
        device_label: request
            .device_label
            .as_deref()
            .map(js_trim)
            .filter(|label| !label.is_empty())
            .map(str::to_owned),
        public_key,
        public_key_algorithm: trimmed_or(
            request.public_key_algorithm.as_deref(),
            DEFAULT_PUBLIC_KEY_ALGORITHM,
        ),
        wrapped_account_key,
        wrapped_search_key,
        wrap_algorithm: trimmed_or(request.wrap_algorithm.as_deref(), DEFAULT_WRAP_ALGORITHM),
        key_version,
    };
    let device = queries::upsert_device(&state.db, &user.id, device_id, keys).await?;
    tracing::info!(device_row_id = %device.id, "E2EE device registered");
    Ok(device_record(device))
}

/// Signing out deletes the device's private key, so its wrapped keys are useless and go too.
pub async fn delete_device(
    state: &AppState,
    user: &RouteUser,
    device_id: &str,
) -> Result<SuccessMessage, AppError> {
    if queries::delete_device(&state.db, &user.id, device_id).await? == 0 {
        return Err(AppError::NotFound("Encryption device not found".into()));
    }
    tracing::info!("E2EE device removed");
    Ok(SuccessMessage {
        success: true,
        message: "Encryption device removed".into(),
    })
}

pub async fn store_password_envelope(
    state: &AppState,
    user: &RouteUser,
    request: PasswordEnvelopeRequest,
) -> Result<PasswordEnvelope, AppError> {
    let keys = password_keys(request)?;
    let envelope = queries::upsert_password_envelope(&state.db, &user.id, keys).await?;
    tracing::info!(envelope_id = %envelope.id, "E2EE password envelope stored");
    Ok(password_record(envelope))
}

/// An envelope as stored, trimmed and with defaults filled in; a password change writes it in its own transaction.
pub fn password_keys(request: PasswordEnvelopeRequest) -> Result<PasswordKeys, AppError> {
    let kdf_algorithm = trimmed_or(
        request.kdf_algorithm.as_deref(),
        DEFAULT_PASSWORD_KDF_ALGORITHM,
    );
    let kdf_salt = required(&request.kdf_salt, "KDF salt is required", "kdfSalt")?;
    let kdf_iterations = request
        .kdf_iterations
        .unwrap_or(DEFAULT_PASSWORD_KDF_ITERATIONS);
    if kdf_iterations < 100_000 {
        return Err(AppError::field(
            "KDF iterations must be at least 100000",
            "kdfIterations",
        ));
    }
    let (wrapped_account_key, wrapped_search_key, key_version) = wrapped_keys(
        &request.wrapped_account_key,
        &request.wrapped_search_key,
        request.key_version,
    )?;
    Ok(PasswordKeys {
        kdf_algorithm,
        kdf_salt,
        kdf_iterations,
        wrapped_account_key,
        wrapped_search_key,
        wrap_algorithm: trimmed_or(
            request.wrap_algorithm.as_deref(),
            DEFAULT_PASSWORD_WRAP_ALGORITHM,
        ),
        key_version,
    })
}

/// Blind-index tokens are stored as a JSON array; anything unreadable is an empty list.
fn blind_index_tokens(value: Option<&str>) -> Vec<String> {
    match value.map(serde_json::from_str::<serde_json::Value>) {
        Some(Ok(serde_json::Value::Array(entries))) => entries
            .into_iter()
            .filter_map(|entry| match entry {
                serde_json::Value::String(token) => Some(token),
                _ => None,
            })
            .collect(),
        _ => Vec::new(),
    }
}

fn device_record(device: user_encryption_device::Model) -> EncryptionDevice {
    EncryptionDevice {
        id: device.id,
        user_id: device.user_id.into(),
        device_id: device.device_id,
        device_label: device.device_label,
        public_key: device.public_key,
        public_key_algorithm: device.public_key_algorithm,
        wrapped_account_key: device.wrapped_account_key,
        wrapped_search_key: device.wrapped_search_key,
        wrap_algorithm: device.wrap_algorithm,
        key_version: device.key_version,
        last_seen_at: instant::iso(device.last_seen_at),
        created_at: instant::iso(device.created_at),
        updated_at: instant::iso(device.updated_at),
    }
}

fn password_record(envelope: user_encryption_password::Model) -> PasswordEnvelope {
    PasswordEnvelope {
        id: envelope.id,
        user_id: envelope.user_id.into(),
        kdf_algorithm: envelope.kdf_algorithm,
        kdf_salt: envelope.kdf_salt,
        kdf_iterations: envelope.kdf_iterations,
        wrapped_account_key: envelope.wrapped_account_key,
        wrapped_search_key: envelope.wrapped_search_key,
        wrap_algorithm: envelope.wrap_algorithm,
        key_version: envelope.key_version,
        created_at: instant::iso(envelope.created_at),
        updated_at: instant::iso(envelope.updated_at),
    }
}

fn calendar_record(calendar: calendar::Model) -> EncryptionCalendar {
    EncryptionCalendar {
        id: calendar.id.into(),
        name: calendar.name,
        blind_index_tokens: blind_index_tokens(calendar.blind_index_tokens.as_deref()),
        encrypted_name: calendar.encrypted_name,
        encryption_state: calendar.encryption_state,
        encryption_key_version: calendar.encryption_key_version,
        color: calendar.color,
        kind: calendar.kind,
        is_default: calendar.is_default,
        is_visible: calendar.is_visible,
        created_at: instant::iso(calendar.created_at),
        updated_at: instant::iso(calendar.updated_at),
    }
}

fn category_record(category: event_category::Model) -> EncryptionCategory {
    EncryptionCategory {
        id: category.id.into(),
        name: category.name,
        blind_index_tokens: blind_index_tokens(category.blind_index_tokens.as_deref()),
        encrypted_name: category.encrypted_name,
        encryption_state: category.encryption_state,
        encryption_key_version: category.encryption_key_version,
        color: category.color,
        is_active: category.is_active,
        created_at: instant::iso(category.created_at),
        updated_at: instant::iso(category.updated_at),
    }
}

fn event_record(event: EventRow) -> EncryptionEvent {
    EncryptionEvent {
        id: event.id.into(),
        title: event.title,
        description: event.description,
        blind_index_tokens: blind_index_tokens(event.blind_index_tokens.as_deref()),
        encrypted_content: event.encrypted_content,
        encryption_state: event.encryption_state,
        encryption_key_version: event.encryption_key_version,
        start: instant::iso(event.start),
        end: instant::iso(event.end),
        timezone: Some(event.timezone),
        all_day: event.all_day,
        location: event.location,
        color: event.color,
        calendar_id: event.calendar_id.into(),
        category_id: event.category_id.map(Into::into),
        reminder: event.reminder,
        recurrence: event.recurrence,
        parent_event_id: event.parent_event_id.map(Into::into),
        created_at: instant::iso(event.created_at),
        updated_at: instant::iso(event.updated_at),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unreadable_blind_index_tokens_are_empty() {
        assert_eq!(blind_index_tokens(None), Vec::<String>::new());
        assert_eq!(blind_index_tokens(Some("")), Vec::<String>::new());
        assert_eq!(blind_index_tokens(Some("not json")), Vec::<String>::new());
        assert_eq!(blind_index_tokens(Some("{\"a\":1}")), Vec::<String>::new());
        assert_eq!(blind_index_tokens(Some("[\"a\",1,null,\"b\"]")), ["a", "b"]);
    }

    #[test]
    fn blank_optional_values_fall_back() {
        assert_eq!(trimmed_or(Some(" \u{feff} "), "x"), "x");
        assert_eq!(trimmed_or(None, "x"), "x");
        assert_eq!(trimmed_or(Some(" y\u{a0}"), "x"), "y");
    }
}
