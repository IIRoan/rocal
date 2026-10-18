//! `/api/auth/*` (Better Auth wire format) and `/api/me`, `/api/user`.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::common::{PasskeyId, SessionId, Timestamp, UserId};

/// The user as Better Auth returns it: core fields only.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AuthUser {
    pub id: UserId,
    pub name: String,
    pub email: String,
    pub email_verified: bool,
    #[schema(required = true)]
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
    #[schema(required = true)]
    pub ip_address: Option<String>,
    #[schema(required = true)]
    pub user_agent: Option<String>,
}

/// A linked sign-in method (`listUserAccounts`); tokens and the password hash are never returned.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct LinkedAccount {
    pub id: String,
    pub account_id: String,
    pub provider_id: String,
    pub user_id: UserId,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    pub scopes: Vec<String>,
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

/// A passkey row as the passkey plugin returns it: the COSE key in standard base64, the credential id in base64url.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Passkey {
    pub id: PasskeyId,
    #[schema(required = true)]
    pub name: Option<String>,
    pub public_key: String,
    pub user_id: UserId,
    #[serde(rename = "credentialID")]
    pub credential_id: String,
    pub counter: i32,
    pub device_type: String,
    pub backed_up: bool,
    #[schema(required = true)]
    pub transports: Option<String>,
    #[schema(required = true)]
    pub created_at: Option<Timestamp>,
    #[schema(required = true)]
    pub aaguid: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PasskeyUpdated {
    pub passkey: Passkey,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct OneTimeToken {
    pub token: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct OkFlag {
    pub ok: bool,
}

/// `GET /api/me`: the session user, or null without a session.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeResponse {
    #[schema(required = true)]
    pub user: Option<AuthUser>,
}
