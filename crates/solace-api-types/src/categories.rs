//! `/api/categories`: event categories.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::common::{CategoryId, Timestamp, UserId};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    pub id: CategoryId,
    /// Empty when the name is encrypted.
    pub name: String,
    #[schema(required = true)]
    pub encrypted_name: Option<String>,
    /// A JSON array of blind-index tokens, stored as text.
    #[schema(required = true)]
    pub blind_index_tokens: Option<String>,
    pub encryption_state: String,
    pub encryption_key_version: i32,
    pub color: String,
    pub is_active: bool,
    pub user_id: UserId,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ListedCategory {
    #[serde(flatten)]
    pub category: Category,
    /// Events that reference the category.
    pub usage_count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CategoryList {
    pub categories: Vec<ListedCategory>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateCategoryRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub color: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encrypted_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blind_index_tokens: Option<Vec<String>>,
    /// Accepted from older clients and ignored; ciphertext presence decides.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encryption_state: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encryption_key_version: Option<i32>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UpdateCategoryRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encrypted_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub blind_index_tokens: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encryption_state: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub encryption_key_version: Option<i32>,
}
