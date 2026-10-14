//! `/api/account/*`: public sign-up helpers, auth status, invites and account deletion.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::common::{InviteId, OperationWarning, Timestamp, UserId};

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
    #[schema(required = true)]
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
    #[schema(nullable = false)]
    pub warnings: Option<Vec<OperationWarning>>,
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

/// `GET /api/account/invite/validate`: whether a token can still be used to sign up.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(untagged)]
pub enum InviteValidation {
    Valid(InviteValid),
    Invalid(InviteInvalid),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct InviteValid {
    #[schema(schema_with = crate::common::always_true)]
    pub valid: bool,
    pub invite_id: InviteId,
    pub email: String,
    pub inviter_name: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct InviteInvalid {
    #[schema(schema_with = crate::common::always_false)]
    pub valid: bool,
    pub reason: String,
}

/// `POST /api/account/invite/claim`: the claimed invite, or why it cannot be claimed.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(untagged)]
pub enum InviteClaimResult {
    Claimed(InviteClaimed),
    Refused(InviteClaimRefused),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct InviteClaimed {
    #[schema(schema_with = crate::common::always_true)]
    pub success: bool,
    pub invite_id: InviteId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct InviteClaimRefused {
    #[schema(schema_with = crate::common::always_false)]
    pub success: bool,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DeleteAccountResponse {
    pub success: bool,
    pub message: String,
    pub deleted_user_id: UserId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EmailAvailabilityQuery {
    pub email: String,
}
