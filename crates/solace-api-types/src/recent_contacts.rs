//! `/api/recent-contacts`: one encrypted recent-contacts blob per user; `GET` answers `null` before the first upload.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::common::Timestamp;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RecentContacts {
    pub encrypted_content: String,
    pub encryption_key_version: i32,
    pub updated_at: Timestamp,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PutRecentContactsRequest {
    pub encrypted_content: String,
    /// Defaults to 1 on the first upload and is kept when omitted later.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encryption_key_version: Option<i32>,
}
