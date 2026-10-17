//! `/api/health`, `/api/health/mail-jmap` and `/api/test`.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::common::Timestamp;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct HealthStatus {
    pub status: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MailHealthFailure {
    pub status: String,
    pub upstream_status: u16,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
pub struct ConnectionTest {
    pub message: String,
    pub timestamp: Timestamp,
}
