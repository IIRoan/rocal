//! `/api/account`: account deletion and the public sign-up helpers next to it.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::common::UserId;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DeleteAccountResponse {
    pub success: bool,
    pub message: String,
    pub deleted_user_id: UserId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SignupConfig {
    pub default_email_domain: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EmailAvailabilityQuery {
    pub email: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct EmailAvailability {
    /// The input as sent.
    pub email: String,
    pub local_part: Option<String>,
    pub domain: String,
    pub normalized_email: String,
    pub available: bool,
    /// `available`, `invalid_email`, `already_in_use` or `reserved`.
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    pub authenticated: bool,
    pub has_passkeys: bool,
    pub requires_passkey_step_up: bool,
}
