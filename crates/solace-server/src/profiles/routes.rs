//! `/api/profiles`: lookup, the email-keyed proxy (a known privacy gap), opaque uploaded avatars, and the caller's own picture.

use std::sync::LazyLock;
use std::time::Duration;

use axum::Json;
use axum::extract::State;
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use regex_lite::Regex;
use solace_api_types::profiles::{
    AvatarIdParams, AvatarResponse, AvatarSizeQuery, EmailAvatarQuery, ProfileLookupRequest,
    ProfileLookupResponse, UploadAvatarRequest,
};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::avatars::{self, Picture};
use super::service;
use crate::auth::guard::RouteUser;
use crate::error::AppError;
use crate::http::extract::{ValidJson, ValidPath, ValidQuery};
use crate::http::rate_limit::{self, Limit};
use crate::http::zod;
use crate::request_schema;
use crate::state::AppState;

const AVATAR_WRITE_LIMIT: Limit = Limit {
    requests: 10,
    window: Duration::from_secs(60),
};
/// `SOLACE_PROFILE_LOOKUP_MAX_EMAILS`.
const LOOKUP_MAX_EMAILS: usize = 50;
/// Base64 of `SOLACE_AVATAR_UPLOAD_MAX_BYTES` (512 KiB).
const MAX_AVATAR_BASE64_LENGTH: usize = (512 * 1024usize).div_ceil(3) * 4;
const PROXY_CACHE: &str = "private, max-age=300";
/// Ids change on every upload, so a served variant never changes.
const UPLOADED_CACHE: &str = "private, max-age=86400, immutable";

/// `SOLACE_AVATAR_ID_PATTERN`.
static AVATAR_ID: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[A-Za-z0-9_-]{22}$").unwrap_or_else(|error| panic!("avatar id pattern: {error}"))
});

fn avatar_size_query() -> zod::Schema {
    zod::optional_query_int(Some(1), Some(4096))
}

request_schema!(ProfileLookupRequest => zod::object([(
    "emails",
    zod::array(zod::string().trim().min(1).max(254)).max(LOOKUP_MAX_EMAILS),
)]).strict());

request_schema!(EmailAvatarQuery => zod::object([
    ("email", zod::string().trim().min(1).max(254)),
    ("size", avatar_size_query()),
]).strict());

request_schema!(AvatarSizeQuery => zod::object([("size", avatar_size_query())]).strict());

request_schema!(UploadAvatarRequest => zod::object([(
    "image",
    zod::string().min(1).max(MAX_AVATAR_BASE64_LENGTH),
)]).strict());

request_schema!(AvatarIdParams => zod::object([("avatarId", zod::string().regex(&AVATAR_ID))]).strict());

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(lookup))
        .routes(routes!(email_avatar))
        .routes(routes!(uploaded_avatar))
        .routes(routes!(upload_avatar, remove_avatar))
}

/// Avatar paths for Solace users with a usable picture, in request order.
#[utoipa::path(post, path = "/api/profiles/lookup", tag = "Profiles", operation_id = "lookupProfiles", request_body = ProfileLookupRequest, responses((status = 200, body = ProfileLookupResponse)))]
#[tracing::instrument(skip_all)]
pub async fn lookup(
    State(state): State<AppState>,
    _: RouteUser,
    ValidJson(body): ValidJson<ProfileLookupRequest>,
) -> Result<Json<ProfileLookupResponse>, AppError> {
    Ok(Json(service::lookup(&state, &body.emails).await?))
}

/// Streams a user's picture by email, fetching external ones through safe fetch; a bare 404 without one.
#[utoipa::path(get, path = "/api/profiles/avatar", tag = "Profiles", operation_id = "getProfileAvatarByEmail", params(("email" = String, Query), ("size" = Option<u32>, Query)), responses((status = 200, description = "The picture", content_type = "image/*", body = String), (status = 404, description = "No picture")))]
#[tracing::instrument(skip_all)]
pub async fn email_avatar(
    State(state): State<AppState>,
    _: RouteUser,
    ValidQuery(query): ValidQuery<EmailAvatarQuery>,
) -> Result<Response, AppError> {
    let picture = avatars::stream_by_email(&state, &query.email, query.size).await?;
    Ok(served(picture, PROXY_CACHE))
}

/// Streams the smallest stored WebP variant covering `size` pixels (default 512) while the id is attached to an account.
#[utoipa::path(get, path = "/api/profiles/avatars/{avatarId}", tag = "Profiles", operation_id = "getUploadedAvatar", params(("avatarId" = String, Path), ("size" = Option<u32>, Query)), responses((status = 200, description = "The WebP variant", content_type = "image/webp", body = String), (status = 404, description = "No picture")))]
#[tracing::instrument(skip_all)]
pub async fn uploaded_avatar(
    State(state): State<AppState>,
    _: RouteUser,
    ValidPath(params): ValidPath<AvatarIdParams>,
    ValidQuery(query): ValidQuery<AvatarSizeQuery>,
) -> Result<Response, AppError> {
    let picture = avatars::stream_uploaded(&state, &params.avatar_id, query.size).await?;
    Ok(served(picture, UPLOADED_CACHE))
}

/// Stores the caller's square crop as WebP variants (32–512px) and retires the previous picture.
#[utoipa::path(put, path = "/api/profiles/me/avatar", tag = "Profiles", operation_id = "uploadProfileAvatar", request_body = UploadAvatarRequest, responses((status = 200, body = AvatarResponse)))]
#[tracing::instrument(skip_all)]
pub async fn upload_avatar(
    State(state): State<AppState>,
    user: RouteUser,
    ValidJson(body): ValidJson<UploadAvatarRequest>,
) -> Result<Json<AvatarResponse>, AppError> {
    enforce_write_limit(&user)?;
    Ok(Json(avatars::upload(&state, &user.id, &body.image).await?))
}

/// Removes the caller's picture and deletes its stored variants.
#[utoipa::path(delete, path = "/api/profiles/me/avatar", tag = "Profiles", operation_id = "removeProfileAvatar", responses((status = 200, body = AvatarResponse)))]
#[tracing::instrument(skip_all)]
pub async fn remove_avatar(
    State(state): State<AppState>,
    user: RouteUser,
) -> Result<Json<AvatarResponse>, AppError> {
    enforce_write_limit(&user)?;
    Ok(Json(avatars::remove(&state, &user.id).await?))
}

fn enforce_write_limit(user: &RouteUser) -> Result<(), AppError> {
    rate_limit::enforce("profile-avatar", &user.id, AVATAR_WRITE_LIMIT)
}

fn served(picture: Option<Picture>, cache_control: &'static str) -> Response {
    let Some(picture) = picture else {
        return StatusCode::NOT_FOUND.into_response();
    };
    (
        [
            (header::CONTENT_TYPE, picture.content_type),
            (
                header::CACHE_CONTROL,
                HeaderValue::from_static(cache_control),
            ),
        ],
        picture.body,
    )
        .into_response()
}
