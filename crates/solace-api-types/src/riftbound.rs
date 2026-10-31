use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolveRiftboundStoreRequest {
    #[schema(min_length = 1, max_length = 30)]
    pub event_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RiftboundEventsRequest {
    #[schema(min_items = 1, max_items = 10)]
    pub store_ids: Vec<String>,
    pub include_registrations: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RiftboundStore {
    pub id: String,
    pub name: String,
    pub address: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RiftboundPublicEvent {
    pub id: String,
    pub store_id: String,
    pub title: String,
    pub start: crate::Timestamp,
    pub location: String,
    pub registered_riot_id_hashes: Vec<String>,
}
