//! Better Auth's wire conventions: `{ message, code }` errors, Zod 4 validation messages, and 32-character ids.

use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use rand::RngExt;
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::http::zod::Schema;

/// An `APIError` from Better Auth: the status, a message and (usually) a code.
#[derive(Debug, Clone)]
pub struct ApiError {
    pub status: StatusCode,
    pub message: String,
    pub code: Option<&'static str>,
}

#[derive(Serialize)]
struct ErrorBody<'a> {
    message: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    code: Option<&'static str>,
}

impl ApiError {
    pub fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
            code: Some(code),
        }
    }

    /// A body with only a message, as Solace's own Better Auth hooks answer.
    pub fn message(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
            code: None,
        }
    }

    pub fn unauthorized() -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "UNAUTHORIZED", "Unauthorized")
    }

    pub fn internal() -> Self {
        Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "INTERNAL_SERVER_ERROR",
            "Internal Server Error",
        )
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = ErrorBody {
            message: &self.message,
            code: self.code,
        };
        (self.status, Json(body)).into_response()
    }
}

impl From<sea_orm::DbErr> for ApiError {
    fn from(error: sea_orm::DbErr) -> Self {
        tracing::error!(error = %crate::telemetry::redact_pii(&error.to_string()), "Auth database error");
        Self::internal()
    }
}

/// Better Auth's base error codes used here, with their messages.
pub mod codes {
    use super::ApiError;
    use axum::http::StatusCode;

    pub fn invalid_email() -> ApiError {
        ApiError::new(StatusCode::BAD_REQUEST, "INVALID_EMAIL", "Invalid email")
    }
    pub fn invalid_password() -> ApiError {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "INVALID_PASSWORD",
            "Invalid password",
        )
    }
    pub fn password_too_short() -> ApiError {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "PASSWORD_TOO_SHORT",
            "Password too short",
        )
    }
    pub fn password_too_long() -> ApiError {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "PASSWORD_TOO_LONG",
            "Password too long",
        )
    }
    pub fn invalid_email_or_password() -> ApiError {
        ApiError::new(
            StatusCode::UNAUTHORIZED,
            "INVALID_EMAIL_OR_PASSWORD",
            "Invalid email or password",
        )
    }
    pub fn user_already_exists() -> ApiError {
        ApiError::new(
            StatusCode::UNPROCESSABLE_ENTITY,
            "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
            "User already exists. Use another email.",
        )
    }
    pub fn invalid_origin() -> ApiError {
        ApiError::new(StatusCode::FORBIDDEN, "INVALID_ORIGIN", "Invalid origin")
    }
    pub fn missing_or_null_origin() -> ApiError {
        ApiError::new(
            StatusCode::FORBIDDEN,
            "MISSING_OR_NULL_ORIGIN",
            "Missing or null Origin",
        )
    }
    pub fn cross_site_navigation() -> ApiError {
        ApiError::new(
            StatusCode::FORBIDDEN,
            "CROSS_SITE_NAVIGATION_LOGIN_BLOCKED",
            "Cross-site navigation login blocked. This request appears to be a CSRF attack.",
        )
    }
    pub fn invalid_token() -> ApiError {
        ApiError::new(StatusCode::BAD_REQUEST, "INVALID_TOKEN", "Invalid token")
    }
    pub fn credential_account_not_found() -> ApiError {
        ApiError::new(
            StatusCode::BAD_REQUEST,
            "CREDENTIAL_ACCOUNT_NOT_FOUND",
            "Credential account not found",
        )
    }
}

pub fn json<T: Serialize>(body: &T) -> Response {
    Json(body).into_response()
}

/// better-call's validation: Zod 4 messages joined as `[body.path] message; …`, code `VALIDATION_ERROR`.
pub fn validate<T: DeserializeOwned>(
    schema: &Schema,
    input: Option<&Value>,
    source: &str,
) -> Result<T, ApiError> {
    let output = schema.parse(input).map_err(|issues| {
        let message = issues
            .iter()
            .map(|issue| {
                let path = if issue.path.is_empty() {
                    source.to_owned()
                } else {
                    format!("{source}.{}", issue.path.join("."))
                };
                format!("[{path}] {}", issue.zod4)
            })
            .collect::<Vec<_>>()
            .join("; ");
        ApiError::new(StatusCode::BAD_REQUEST, "VALIDATION_ERROR", message)
    })?;
    serde_json::from_value(output.unwrap_or(Value::Null)).map_err(|error| {
        tracing::error!(error = %error, "Better Auth body did not match its schema");
        ApiError::internal()
    })
}

pub const ALPHANUMERIC: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
/// `generateRandomString`'s default alphabet: alphanumerics plus `-_`.
pub const URL_SAFE: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-_";
pub const LOWER_ALPHANUMERIC: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789";

pub fn random_string(length: usize, alphabet: &[u8]) -> String {
    let mut rng = rand::rng();
    (0..length)
        .map(|_| char::from(alphabet[rng.random_range(0..alphabet.len())]))
        .collect()
}

/// Better Auth's `generateId()`: 32 characters of `[A-Za-z0-9]`.
pub fn generate_id() -> String {
    random_string(32, ALPHANUMERIC)
}

pub use crate::addresses::is_zod_email as is_email;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::zod;
    use serde_json::json;

    #[test]
    fn validation_messages_follow_better_call() {
        let schema = zod::object([("email", zod::string()), ("password", zod::string())]);
        let error = validate::<Value>(&schema, Some(&json!({"email": 5})), "body").unwrap_err();
        assert_eq!(
            error.message,
            "[body.email] Invalid input: expected string, received number; [body.password] Invalid input: expected string, received undefined"
        );
        let error = validate::<Value>(&schema, None, "body").unwrap_err();
        assert_eq!(
            error.message,
            "[body] Invalid input: expected object, received undefined"
        );
        assert_eq!(error.code, Some("VALIDATION_ERROR"));
    }

    #[test]
    fn ids_and_emails_match_better_auth() {
        let id = generate_id();
        assert!(id.len() == 32 && id.chars().all(|c| c.is_ascii_alphanumeric()));
        assert!(is_email("a.b+c@solace.test"));
        assert!(
            !is_email("not-an-email")
                && !is_email(".a@solace.test")
                && !is_email("a..b@solace.test")
        );
    }
}
