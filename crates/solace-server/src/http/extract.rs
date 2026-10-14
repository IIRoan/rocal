//! Validated bodies and queries: parsed the way Elysia parses them, checked by a Zod-compatible schema, then deserialized into the DTO.

use axum::body::Bytes;
use axum::extract::{FromRequest, FromRequestParts, Request};
use axum::http::header;
use axum::http::request::Parts;
use serde::de::DeserializeOwned;
use serde_json::{Map, Value, json};

use super::zod::{Issue, Schema};
use crate::error::AppError;

/// A request DTO's Zod-compatible schema, built once.
pub trait RequestSchema {
    fn schema() -> &'static Schema;
}

/// Implements [`RequestSchema`] for a DTO from a schema expression.
#[macro_export]
macro_rules! request_schema {
    ($dto:ty => $schema:expr) => {
        impl $crate::http::extract::RequestSchema for $dto {
            fn schema() -> &'static $crate::http::zod::Schema {
                static SCHEMA: std::sync::LazyLock<$crate::http::zod::Schema> =
                    std::sync::LazyLock::new(|| $schema);
                &SCHEMA
            }
        }
    };
}

pub struct ValidJson<T>(pub T);

pub struct ValidQuery<T>(pub T);

/// The envelope's first message and every issue as `{ path, message }`.
pub fn rejection(issues: &[Issue]) -> AppError {
    AppError::Validation {
        message: issues
            .first()
            .map(|i| i.message.clone())
            .unwrap_or_default(),
        details: Some(json!({
            "issues": issues
                .iter()
                .map(|issue| json!({"path": issue.path_string(), "message": issue.message}))
                .collect::<Vec<_>>(),
        })),
    }
}

/// Validates `input` and deserializes the schema's output; a mismatch between schema and DTO is a server bug.
pub fn validate<T: RequestSchema + DeserializeOwned>(input: Option<&Value>) -> Result<T, AppError> {
    let output = T::schema()
        .parse(input)
        .map_err(|issues| rejection(&issues))?;
    serde_json::from_value(output.unwrap_or(Value::Null)).map_err(AppError::internal)
}

/// Elysia's body parsing: JSON by content type, text as a string, forms as objects, and no body as `undefined`.
pub fn parse_body(content_type: Option<&str>, bytes: &[u8]) -> Result<Option<Value>, AppError> {
    let media_type = content_type
        .and_then(|value| value.split(';').next())
        .map(|value| value.trim().to_ascii_lowercase());
    match media_type.as_deref() {
        Some("application/json") => serde_json::from_slice(bytes)
            .map(Some)
            .map_err(|_| AppError::Parse),
        Some("application/x-www-form-urlencoded") => Ok(Some(Value::Object(form_object(bytes)))),
        Some(media) if media.starts_with("text/") => Ok(Some(Value::String(
            String::from_utf8_lossy(bytes).into_owned(),
        ))),
        _ if bytes.is_empty() => Ok(None),
        _ => Ok(Some(Value::String(
            String::from_utf8_lossy(bytes).into_owned(),
        ))),
    }
}

/// Query strings and forms: `+` is a space, the last repeated key wins.
pub fn form_object(bytes: &[u8]) -> Map<String, Value> {
    url::form_urlencoded::parse(bytes)
        .map(|(key, value)| (key.into_owned(), Value::String(value.into_owned())))
        .collect()
}

impl<S, T> FromRequest<S> for ValidJson<T>
where
    S: Send + Sync,
    T: RequestSchema + DeserializeOwned,
{
    type Rejection = AppError;

    async fn from_request(request: Request, state: &S) -> Result<Self, Self::Rejection> {
        let content_type = request
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        let bytes = Bytes::from_request(request, state)
            .await
            .map_err(|_| AppError::Parse)?;
        let body = parse_body(content_type.as_deref(), &bytes)?;
        validate(body.as_ref()).map(ValidJson)
    }
}

impl<S, T> FromRequestParts<S> for ValidQuery<T>
where
    S: Send + Sync,
    T: RequestSchema + DeserializeOwned,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let query = form_object(parts.uri.query().unwrap_or_default().as_bytes());
        validate(Some(&Value::Object(query))).map(ValidQuery)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bodies_parse_like_elysia() {
        assert_eq!(parse_body(None, b"").ok(), Some(None));
        assert!(matches!(
            parse_body(Some("application/json"), b""),
            Err(AppError::Parse)
        ));
        assert!(matches!(
            parse_body(Some("application/json; charset=utf-8"), b"{bad"),
            Err(AppError::Parse)
        ));
        assert_eq!(
            parse_body(Some("text/plain"), b"hello").ok(),
            Some(Some(json!("hello")))
        );
        assert_eq!(
            parse_body(Some("application/json"), b"null").ok(),
            Some(Some(Value::Null))
        );
        assert_eq!(
            Value::Object(form_object(b"email=a+b%40x.test&email=c&bad=%ZZ")),
            json!({"email": "c", "bad": "%ZZ"})
        );
    }
}
