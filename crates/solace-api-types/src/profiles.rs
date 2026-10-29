//! `/api/profiles`: profile-picture lookup by email and uploaded avatars (binary WebP responses have no DTO).

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProfileLookupRequest {
    pub emails: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProfileLookupResponse {
    pub profiles: Vec<SolaceProfile>,
}

/// A Solace user with a picture: the normalized email and an API-relative avatar path.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SolaceProfile {
    pub email: String,
    pub image: String,
}

/// Query of `GET /api/profiles/avatars/:avatarId`; `size` is rounded up to a stored variant.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AvatarSizeQuery {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<u32>,
}

/// Path of `GET /api/profiles/avatars/:avatarId`: 128 random bits as base64url.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AvatarIdParams {
    pub avatar_id: String,
}

/// A base64 square crop; the API stores only re-encoded WebP variants of it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UploadAvatarRequest {
    pub image: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AvatarResponse {
    /// `/api/profiles/avatars/<id>`, or null once removed.
    #[schema(required = true)]
    pub image: Option<String>,
}
