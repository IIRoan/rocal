//! Types every domain uses: instants, the error envelope and opaque ids.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// A UTC instant as JavaScript's `toISOString()` writes it: three fractional digits and `Z`.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize, ToSchema)]
#[serde(transparent)]
#[schema(value_type = String, format = DateTime)]
pub struct Timestamp(pub String);

/// The `lib/errors.ts` envelope; `requestId` is absent on the auth guard's 401/403.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ErrorResponse {
    pub error: String,
    pub message: String,
    pub status_code: u16,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
    pub timestamp: Timestamp,
}

/// `{ success, message }`, the answer of most deletes and resets.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SuccessMessage {
    pub success: bool,
    pub message: String,
}

/// Declares opaque string ids that TypeScript still sees as `string`.
#[macro_export]
macro_rules! id_types {
    ($($(#[$meta:meta])* $name:ident),+ $(,)?) => {$(
        $(#[$meta])*
        #[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize, utoipa::ToSchema)]
        #[serde(transparent)]
        #[schema(value_type = String)]
        pub struct $name(pub String);

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str(&self.0)
            }
        }

        impl From<String> for $name {
            fn from(value: String) -> Self {
                Self(value)
            }
        }
    )+};
}

id_types!(
    UserId,
    CalendarId,
    CategoryId,
    EventId,
    InviteId,
    SessionId,
    PasskeyId,
    SubscriptionId,
    PushDeviceId,
    NotificationId,
);
