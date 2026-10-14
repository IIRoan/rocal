//! `/api/account/*`: public sign-up helpers, auth status, invites and account deletion.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::common::{InviteId, Timestamp, UserId};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SignupConfig {
    pub default_email_domain: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum EmailAvailabilityCode {
    Available,
    InvalidEmail,
    AlreadyInUse,
    Reserved,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EmailAvailability {
    pub email: String,
    pub local_part: Option<String>,
    pub domain: String,
    pub normalized_email: String,
    pub available: bool,
    pub code: EmailAvailabilityCode,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    pub authenticated: bool,
    pub has_passkeys: bool,
    pub requires_passkey_step_up: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum InviteStatus {
    Pending,
    Claimed,
    Accepted,
    Revoked,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Invite {
    pub id: InviteId,
    pub token: String,
    pub email: String,
    pub status: InviteStatus,
    pub expires_at: Timestamp,
    pub created_at: Timestamp,
    pub invited_by_id: UserId,
    /// Present only when the invite mail could not be delivered.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub warnings: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct InviteList {
    pub invites: Vec<Invite>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct CreateInviteRequest {
    pub email: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ClaimInviteRequest {
    pub token: String,
    pub chosen_email: String,
}
