//! `/api/push`: APNs device registration and removal, token-free listing, and the test push outbox row.

use std::time::Duration;

use axum::Json;
use axum::extract::State;
use axum::http::Uri;
use sea_orm::sea_query::OnConflict;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter, QueryOrder, Set,
};
use sha2::{Digest, Sha256};
use solace_api_types::push_devices::{
    PushDevice, PushDeviceList, PushDeviceRegistration, PushDeviceUnregistration, PushTestResult,
    RegisterPushDeviceRequest, UnregisterPushDeviceRequest,
};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::auth::guard::RouteUser;
use crate::db::cuid;
use crate::db::entities::{notification_job, push_device, user_settings};
use crate::error::AppError;
use crate::http::extract::ValidJson;
use crate::http::rate_limit::{self, Limit};
use crate::http::zod;
use crate::instant;
use crate::notifications::job_payload::event_reminder_payload;
use crate::request_schema;
use crate::state::AppState;

const fn per_minute(requests: u32) -> Limit {
    Limit {
        requests,
        window: Duration::from_secs(60),
    }
}

const LIST_LIMIT: Limit = per_minute(60);
const REGISTER_LIMIT: Limit = per_minute(30);
const UNREGISTER_LIMIT: Limit = per_minute(30);
const TEST_LIMIT: Limit = per_minute(5);
const TEST_NOTIFICATION_EVENT_ID: &str = "test-notification";
const TEST_NOTIFICATION_MINUTES_BEFORE: u32 = 15;

/// `SOLACE_IOS_BUNDLE_IDS`, kept in sync with `apps/notifications/internal/push/bundles.go`.
const BUNDLE_IDS: [&str; 4] = [
    "onl.solace.calendar",
    "onl.solace.calendar.dev",
    "onl.solace.mail",
    "onl.solace.mail.dev",
];

fn push_token() -> zod::Schema {
    zod::string().trim().min(16).max(4096)
}

request_schema!(RegisterPushDeviceRequest => zod::object([
    ("token", push_token()),
    ("platform", zod::enumeration(&["ios", "android"])),
    ("bundleId", zod::enumeration(&BUNDLE_IDS)),
    ("environment", zod::enumeration(&["sandbox", "production"])),
]).strict());

request_schema!(UnregisterPushDeviceRequest => zod::object([("token", push_token().optional())]).strict());

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(list, register, unregister))
        .routes(routes!(test))
}

/// The limiter keys on the request URL, so each path and query string has its own budget.
fn enforce(user: &RouteUser, uri: &Uri, limit: Limit) -> Result<(), AppError> {
    rate_limit::enforce("push-devices", &format!("{}:{uri}", user.id), limit)
}

/// The caller's enabled devices, most recently seen first; tokens never leave the server.
#[utoipa::path(get, path = "/api/push/devices", tag = "Push", operation_id = "listPushDevices", responses((status = 200, body = PushDeviceList)))]
#[tracing::instrument(skip_all)]
pub async fn list(
    State(state): State<AppState>,
    user: RouteUser,
    uri: Uri,
) -> Result<Json<PushDeviceList>, AppError> {
    enforce(&user, &uri, LIST_LIMIT)?;
    Ok(Json(service::list(&state, &user).await?))
}

/// Stores or refreshes an APNs token; it moves to the caller if another user had it.
#[utoipa::path(put, path = "/api/push/devices", tag = "Push", operation_id = "registerPushDevice", request_body = RegisterPushDeviceRequest, responses((status = 200, body = PushDeviceRegistration)))]
#[tracing::instrument(skip_all)]
pub async fn register(
    State(state): State<AppState>,
    user: RouteUser,
    uri: Uri,
    ValidJson(body): ValidJson<RegisterPushDeviceRequest>,
) -> Result<Json<PushDeviceRegistration>, AppError> {
    enforce(&user, &uri, REGISTER_LIMIT)?;
    Ok(Json(service::register(&state, &user, body).await?))
}

/// Deletes one of the caller's tokens, or every device without one.
#[utoipa::path(delete, path = "/api/push/devices", tag = "Push", operation_id = "unregisterPushDevice", request_body = UnregisterPushDeviceRequest, responses((status = 200, body = PushDeviceUnregistration)))]
#[tracing::instrument(skip_all)]
pub async fn unregister(
    State(state): State<AppState>,
    user: RouteUser,
    uri: Uri,
    ValidJson(body): ValidJson<UnregisterPushDeviceRequest>,
) -> Result<Json<PushDeviceUnregistration>, AppError> {
    enforce(&user, &uri, UNREGISTER_LIMIT)?;
    Ok(Json(service::unregister(&state, &user, body).await?))
}

/// Queues a metadata-only reminder push to the caller's devices.
#[utoipa::path(post, path = "/api/push/test", tag = "Push", operation_id = "sendTestPush", responses((status = 200, body = PushTestResult)))]
#[tracing::instrument(skip_all)]
pub async fn test(
    State(state): State<AppState>,
    user: RouteUser,
    uri: Uri,
) -> Result<Json<PushTestResult>, AppError> {
    enforce(&user, &uri, TEST_LIMIT)?;
    Ok(Json(service::enqueue_test(&state, &user).await?))
}

/// `hashPushToken`: the token is looked up and deduplicated by its SHA-256.
fn token_hash(token: &str) -> String {
    hex::encode(Sha256::digest(token.trim().as_bytes()))
}

mod service {
    use super::*;

    pub async fn register(
        state: &AppState,
        user: &RouteUser,
        request: RegisterPushDeviceRequest,
    ) -> Result<PushDeviceRegistration, AppError> {
        let token = request.token.trim().to_owned();
        let hash = token_hash(&token);
        if let Some(existing) = queries::by_hash(state, &hash).await?
            && existing.user_id != user.id
        {
            queries::delete(state, existing).await?;
        }
        let device = queries::upsert(state, &user.id, request, token, hash).await?;
        Ok(PushDeviceRegistration {
            success: true,
            device_id: device.id.into(),
        })
    }

    pub async fn unregister(
        state: &AppState,
        user: &RouteUser,
        request: UnregisterPushDeviceRequest,
    ) -> Result<PushDeviceUnregistration, AppError> {
        let hash = request.token.as_deref().map(token_hash);
        let deleted_count = queries::delete_for(state, &user.id, hash.as_deref()).await?;
        Ok(PushDeviceUnregistration {
            success: true,
            deleted_count,
        })
    }

    pub async fn list(state: &AppState, user: &RouteUser) -> Result<PushDeviceList, AppError> {
        let devices = queries::enabled(state, &user.id).await?;
        Ok(PushDeviceList {
            devices: devices
                .into_iter()
                .map(|device| PushDevice {
                    id: device.id.into(),
                    platform: device.platform,
                    bundle_id: device.bundle_id,
                    environment: device.environment,
                    is_enabled: device.is_enabled,
                    last_seen_at: instant::iso(device.last_seen_at),
                    created_at: instant::iso(device.created_at),
                })
                .collect(),
        })
    }

    pub async fn enqueue_test(
        state: &AppState,
        user: &RouteUser,
    ) -> Result<PushTestResult, AppError> {
        if queries::push_notifications(state, &user.id).await? == Some(false) {
            return Err(AppError::validation(
                "App notifications are turned off. Enable them before sending a test.",
            ));
        }
        if queries::enabled_count(state, &user.id).await? < 1 {
            return Err(AppError::validation(
                "No iPhone is registered for push yet. Open Solace on your phone with notifications allowed.",
            ));
        }
        let payload =
            event_reminder_payload(TEST_NOTIFICATION_EVENT_ID, TEST_NOTIFICATION_MINUTES_BEFORE)
                .map_err(AppError::internal)?;
        let job = queries::enqueue_reminder(state, &user.id, payload).await?;
        tracing::info!(job_id = %job.id, "Test push queued");
        Ok(PushTestResult {
            success: true,
            job_id: job.id,
        })
    }
}

mod queries {
    use super::*;

    pub async fn by_hash(
        state: &AppState,
        hash: &str,
    ) -> Result<Option<push_device::Model>, sea_orm::DbErr> {
        push_device::Entity::find()
            .filter(push_device::Column::TokenHash.eq(hash))
            .one(&state.db)
            .await
    }

    pub async fn delete(
        state: &AppState,
        device: push_device::Model,
    ) -> Result<(), sea_orm::DbErr> {
        push_device::Entity::delete_by_id(device.id)
            .exec(&state.db)
            .await
            .map(|_| ())
    }

    /// Platform and bundle follow the client; the environment the worker learned is kept.
    pub async fn upsert(
        state: &AppState,
        user_id: &str,
        request: RegisterPushDeviceRequest,
        token: String,
        hash: String,
    ) -> Result<push_device::Model, sea_orm::DbErr> {
        use push_device::Column;
        let now = instant::now();
        let row = push_device::ActiveModel {
            id: Set(cuid()),
            user_id: Set(user_id.to_owned()),
            platform: Set(request.platform),
            bundle_id: Set(request.bundle_id),
            environment: Set(request.environment),
            token: Set(token),
            token_hash: Set(hash),
            is_enabled: Set(true),
            last_seen_at: Set(now),
            created_at: Set(now),
            updated_at: Set(now),
        };
        push_device::Entity::insert(row)
            .on_conflict(
                OnConflict::columns([Column::UserId, Column::TokenHash])
                    .update_columns([
                        Column::Platform,
                        Column::BundleId,
                        Column::Token,
                        Column::IsEnabled,
                        Column::LastSeenAt,
                        Column::UpdatedAt,
                    ])
                    .to_owned(),
            )
            .exec_with_returning(&state.db)
            .await
    }

    pub async fn delete_for(
        state: &AppState,
        user_id: &str,
        hash: Option<&str>,
    ) -> Result<i64, sea_orm::DbErr> {
        let mut query =
            push_device::Entity::delete_many().filter(push_device::Column::UserId.eq(user_id));
        if let Some(hash) = hash {
            query = query.filter(push_device::Column::TokenHash.eq(hash));
        }
        let deleted = query.exec(&state.db).await?.rows_affected;
        Ok(i64::try_from(deleted).unwrap_or(i64::MAX))
    }

    pub async fn enabled(
        state: &AppState,
        user_id: &str,
    ) -> Result<Vec<push_device::Model>, sea_orm::DbErr> {
        push_device::Entity::find()
            .filter(push_device::Column::UserId.eq(user_id))
            .filter(push_device::Column::IsEnabled.eq(true))
            .order_by_desc(push_device::Column::LastSeenAt)
            .all(&state.db)
            .await
    }

    pub async fn enabled_count(state: &AppState, user_id: &str) -> Result<u64, sea_orm::DbErr> {
        push_device::Entity::find()
            .filter(push_device::Column::UserId.eq(user_id))
            .filter(push_device::Column::IsEnabled.eq(true))
            .count(&state.db)
            .await
    }

    pub async fn push_notifications(
        state: &AppState,
        user_id: &str,
    ) -> Result<Option<bool>, sea_orm::DbErr> {
        Ok(user_settings::Entity::find()
            .filter(user_settings::Column::UserId.eq(user_id))
            .one(&state.db)
            .await?
            .map(|settings| settings.push_notifications))
    }

    pub async fn enqueue_reminder(
        state: &AppState,
        user_id: &str,
        payload: serde_json::Value,
    ) -> Result<notification_job::Model, sea_orm::DbErr> {
        notification_job::ActiveModel {
            user_id: Set(user_id.to_owned()),
            kind: Set("event_reminder".into()),
            channel: Set("push".into()),
            event_id: Set(Some(TEST_NOTIFICATION_EVENT_ID.into())),
            payload: Set(payload),
            status: Set("pending".into()),
            available_at: Set(instant::now()),
            ..Default::default()
        }
        .insert(&state.db)
        .await
    }
}
