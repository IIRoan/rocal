//! `AppError`, rendered as the `lib/errors.ts` envelope with the request id, logged and reported like the TypeScript handler.

use axum::Json;
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use serde_json::{Value, json};
use solace_api_types::ErrorResponse;
use thiserror::Error;

use crate::http::request_context;
use crate::instant;
use crate::telemetry;

const GENERIC_SERVER_ERROR: &str = "An unexpected error occurred. If this keeps happening, contact support and include the request id.";

#[derive(Debug, Error)]
pub enum AppError {
    /// The auth guard's 401: no request id, not logged.
    #[error("Unauthorized access")]
    Unauthenticated,
    /// The auth guard's 403 for an account with a passkey this session has not used.
    #[error("Passkey verification required.")]
    StepUpRequired,
    /// A schema rejection (`details.issues`) or a service check (`details.field`, or none).
    #[error("{message}")]
    Validation {
        message: String,
        details: Option<Value>,
    },
    #[error("Invalid request format")]
    Parse,
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    Forbidden(String),
    #[error("{0}")]
    Conflict(String),
    #[error("{message}")]
    RateLimited { message: String, retry_after: u64 },
    #[error("{message}")]
    Upstream { status: StatusCode, message: String },
    /// Anything unexpected; the client only sees the generic 500.
    #[error("{0}")]
    Internal(String),
}

impl AppError {
    pub fn validation(message: impl Into<String>) -> Self {
        Self::Validation {
            message: message.into(),
            details: None,
        }
    }

    pub fn field(message: impl Into<String>, field: &str) -> Self {
        Self::Validation {
            message: message.into(),
            details: Some(json!({ "field": field })),
        }
    }

    pub fn internal(error: impl std::fmt::Display) -> Self {
        Self::Internal(error.to_string())
    }

    /// The label the TypeScript handler logs as `code`.
    fn code(&self) -> &'static str {
        match self {
            Self::Validation { details, .. } if is_schema_rejection(details.as_ref()) => {
                "VALIDATION"
            }
            Self::Validation { .. } => "VALIDATION_ERROR",
            Self::Unauthenticated => "UNAUTHORIZED",
            Self::StepUpRequired => "FORBIDDEN",
            Self::Parse => "PARSE",
            Self::NotFound(_) => "NOT_FOUND",
            Self::Forbidden(_) => "FORBIDDEN",
            Self::Conflict(_) => "CONFLICT",
            Self::RateLimited { .. } => "RATE_LIMIT",
            Self::Upstream { .. } => "UPSTREAM_SERVICE",
            Self::Internal(_) => "UNKNOWN",
        }
    }

    fn status_and_label(&self) -> (StatusCode, &'static str) {
        match self {
            Self::Validation { .. } => (StatusCode::BAD_REQUEST, "Validation Error"),
            Self::Unauthenticated => (StatusCode::UNAUTHORIZED, "Unauthorized"),
            Self::StepUpRequired => (StatusCode::FORBIDDEN, "Forbidden"),
            Self::Parse => (StatusCode::BAD_REQUEST, "Parse Error"),
            Self::NotFound(_) => (StatusCode::NOT_FOUND, "Not Found"),
            Self::Forbidden(_) => (StatusCode::FORBIDDEN, "Forbidden"),
            Self::Conflict(_) => (StatusCode::CONFLICT, "Conflict"),
            Self::RateLimited { .. } => (StatusCode::TOO_MANY_REQUESTS, "Too Many Requests"),
            Self::Upstream { status, .. } => (*status, "Upstream Service Error"),
            Self::Internal(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Internal Server Error"),
        }
    }

    /// The message the envelope shows, which hides internal errors.
    pub fn client_message(&self) -> String {
        match self {
            Self::Internal(_) => GENERIC_SERVER_ERROR.into(),
            other => other.to_string(),
        }
    }

    fn details(&self) -> Option<Value> {
        match self {
            Self::Validation { details, .. } => details.clone(),
            _ => None,
        }
    }
}

fn is_schema_rejection(details: Option<&Value>) -> bool {
    details.is_some_and(|details| details.get("issues").is_some())
}

impl From<sea_orm::DbErr> for AppError {
    fn from(error: sea_orm::DbErr) -> Self {
        // The TypeScript handler turned Prisma's unique violations into this 409.
        if matches!(
            error.sql_err(),
            Some(sea_orm::SqlErr::UniqueConstraintViolation(_))
        ) {
            return Self::Conflict("Resource already exists".into());
        }
        Self::internal(error)
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, label) = self.status_and_label();
        match self {
            Self::Unauthenticated => return plain_error(status, label, &self.to_string(), None),
            Self::StepUpRequired => {
                let details = json!({ "code": "PASSKEY_STEP_UP_REQUIRED" });
                return plain_error(status, label, &self.to_string(), Some(details));
            }
            _ => {}
        }
        let context = request_context::current();
        let request_id = context.as_ref().map(|c| c.id.clone()).unwrap_or_default();
        log_failure(&self, status, context.as_ref());
        let body = ErrorResponse {
            error: label.into(),
            message: self.client_message(),
            status_code: status.as_u16(),
            details: self.details(),
            request_id: Some(request_id.clone()),
            timestamp: instant::iso(instant::now()),
        };
        let mut response = (status, Json(body)).into_response();
        if let Ok(value) = HeaderValue::from_str(&request_id) {
            response.headers_mut().insert("x-request-id", value);
        }
        if let Self::RateLimited { retry_after, .. } = &self {
            response
                .headers_mut()
                .insert(header::RETRY_AFTER, HeaderValue::from(*retry_after));
        }
        response
    }
}

fn log_failure(
    error: &AppError,
    status: StatusCode,
    context: Option<&request_context::RequestContext>,
) {
    let (request_id, method, url) = context
        .map(|c| (c.id.as_str(), c.method.as_str(), c.url.as_str()))
        .unwrap_or_default();
    let message = telemetry::redact_pii(&error.to_string());
    if status.is_server_error() || status == StatusCode::TOO_MANY_REQUESTS {
        tracing::error!(
            request_id,
            code = error.code(),
            method,
            url,
            message,
            "Request failed"
        );
    } else {
        tracing::warn!(
            request_id,
            code = error.code(),
            method,
            url,
            message,
            "Request failed"
        );
    }
    if status.is_server_error() {
        telemetry::report_error(error, request_id);
    }
}

/// A plain answer without the envelope's request id, as the auth guard and a few routes send it.
pub fn plain_error(
    status: StatusCode,
    label: &str,
    message: &str,
    details: Option<Value>,
) -> Response {
    let body = ErrorResponse {
        error: label.into(),
        message: message.into(),
        status_code: status.as_u16(),
        details,
        request_id: None,
        timestamp: instant::iso(instant::now()),
    };
    (status, Json(body)).into_response()
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn render(error: AppError) -> (StatusCode, Option<String>, Option<String>, Value) {
        let response = request_context::scoped("req-1", async { error.into_response() }).await;
        let status = response.status();
        let header = |name: &str| {
            response
                .headers()
                .get(name)
                .and_then(|v| v.to_str().ok())
                .map(str::to_owned)
        };
        let (request_id, retry_after) = (header("x-request-id"), header("retry-after"));
        let bytes = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .unwrap();
        (
            status,
            request_id,
            retry_after,
            serde_json::from_slice(&bytes).unwrap(),
        )
    }

    #[tokio::test]
    async fn unexpected_errors_are_a_generic_500_with_the_request_id() {
        let (status, header, _, body) = render(AppError::internal("password=hunter2 at db")).await;
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(header.as_deref(), Some("req-1"));
        assert_eq!(body["error"], json!("Internal Server Error"));
        assert_eq!(body["message"], json!(GENERIC_SERVER_ERROR));
        assert_eq!(body["requestId"], json!("req-1"));
        assert!(body["timestamp"].as_str().is_some_and(|t| t.ends_with('Z')));
        assert!(!body.to_string().contains("hunter2"));
    }

    #[tokio::test]
    async fn database_failures_are_generic_500s() {
        let error = sea_orm::DbErr::Custom("relation \"user\" does not exist".into());
        let (status, _, _, body) = render(AppError::from(error)).await;
        assert_eq!(status, StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(body["message"], json!(GENERIC_SERVER_ERROR));
        assert!(!body.to_string().contains("relation"));
    }

    #[tokio::test]
    async fn domain_errors_map_to_their_envelopes() {
        let cases = [
            (
                AppError::field("Bad input", "name"),
                400,
                "Validation Error",
                "Bad input",
            ),
            (
                AppError::NotFound("Missing thing".into()),
                404,
                "Not Found",
                "Missing thing",
            ),
            (
                AppError::Forbidden("Access forbidden".into()),
                403,
                "Forbidden",
                "Access forbidden",
            ),
            (
                AppError::Conflict("Resource already exists".into()),
                409,
                "Conflict",
                "Resource already exists",
            ),
            (
                AppError::Parse,
                400,
                "Parse Error",
                "Invalid request format",
            ),
        ];
        for (error, status, label, message) in cases {
            let (actual, header, _, body) = render(error).await;
            assert_eq!(actual.as_u16(), status, "{body}");
            assert_eq!(
                (&body["error"], &body["message"]),
                (&json!(label), &json!(message))
            );
            assert_eq!(body["statusCode"], json!(status));
            assert_eq!(header.as_deref(), Some("req-1"));
        }
        let (_, _, _, body) = render(AppError::field("Bad input", "name")).await;
        assert_eq!(body["details"], json!({"field": "name"}));
        let (status, header, _, body) = render(AppError::Unauthenticated).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED);
        assert!(
            header.is_none() && body.get("requestId").is_none(),
            "the guard's 401 has no request id"
        );
        let (status, _, _, body) = render(AppError::StepUpRequired).await;
        assert_eq!(status, StatusCode::FORBIDDEN);
        assert_eq!(body["details"], json!({"code": "PASSKEY_STEP_UP_REQUIRED"}));
        let (status, _, retry_after, _) = render(AppError::RateLimited {
            message: "Slow down".into(),
            retry_after: 30,
        })
        .await;
        assert_eq!((status.as_u16(), retry_after.as_deref()), (429, Some("30")));
    }

    #[tokio::test]
    async fn validation_errors_without_issues_have_no_details() {
        let (_, _, _, body) = render(AppError::validation("Bad input")).await;
        assert_eq!(body["error"], json!("Validation Error"));
        assert!(body.get("details").is_none(), "{body}");
    }
}
