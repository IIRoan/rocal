//! `/api/push`: APNs device registration and the test push; tokens never leave the server.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::common::{PushDeviceId, Timestamp};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RegisterPushDeviceRequest {
    pub token: String,
    /// `ios` or `android`.
    pub platform: String,
    pub bundle_id: String,
    /// `sandbox` or `production`; only the first registration's value is kept.
    pub environment: String,
}

/// Without a token every device of the user is removed.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UnregisterPushDeviceRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PushDeviceRegistration {
    pub success: bool,
    pub device_id: PushDeviceId,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PushDeviceUnregistration {
    pub success: bool,
    pub deleted_count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PushDeviceList {
    pub devices: Vec<PushDevice>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PushDevice {
    pub id: PushDeviceId,
    pub platform: String,
    pub bundle_id: String,
    pub environment: String,
    pub is_enabled: bool,
    pub last_seen_at: Timestamp,
    pub created_at: Timestamp,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct PushTestResult {
    pub success: bool,
    /// Id of the queued `notification_job` row.
    pub job_id: String,
}
