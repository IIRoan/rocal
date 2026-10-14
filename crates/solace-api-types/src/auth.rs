//! `/api/auth/*` (Better Auth wire format) and `/api/me`, `/api/user`.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::common::{SessionId, Timestamp, UserId};

/// The user as Better Auth returns it: core fields only.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AuthUser {
    pub id: UserId,
    pub name: String,
    pub email: String,
    pub email_verified: bool,
    pub image: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

/// A session row; the client IP and user agent are never stored, so both are always null.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AuthSession {
    pub id: SessionId,
    pub token: String,
    pub user_id: UserId,
    pub expires_at: Timestamp,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    pub ip_address: Option<String>,
    pub user_agent: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SessionWithUser {
    pub session: AuthSession,
    pub user: AuthUser,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SignUpResponse {
    pub token: String,
    pub user: AuthUser,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SignInResponse {
    pub redirect: bool,
    pub token: String,
    pub user: AuthUser,
}

/// Better Auth's error body: a message and a machine-readable code.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AuthError {
    pub message: String,
    pub code: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SuccessFlag {
    pub success: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct StatusFlag {
    pub status: bool,
}

/// `GET /api/me`: the session user, or null without a session.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeResponse {
    pub user: Option<AuthUser>,
}
