//! `/api/categories`: the owner's event categories.

use axum::Json;
use axum::extract::{Path, State};
use solace_api_types::SuccessMessage;
use solace_api_types::categories::{
    Category, CategoryList, CreateCategoryRequest, UpdateCategoryRequest,
};
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use super::service;
use crate::auth::guard::RouteUser;
use crate::error::AppError;
use crate::http::extract::ValidJson;
use crate::http::schemas::{calendar_color_schema, encrypted_name_fields};
use crate::http::zod;
use crate::request_schema;
use crate::state::AppState;

request_schema!(CreateCategoryRequest => zod::object([
    ("color", calendar_color_schema()),
])
.extend(encrypted_name_fields())
.extend([("encryptedName", zod::string())])
.strict());

request_schema!(UpdateCategoryRequest => zod::object([
    ("color", calendar_color_schema().optional()),
])
.extend(encrypted_name_fields())
.strict());

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(list, create))
        .routes(routes!(update, delete))
}

/// The caller's active categories by name, each with how many events use it.
#[utoipa::path(get, path = "/api/categories", operation_id = "listCategories", tag = "Categories", responses((status = 200, body = CategoryList)))]
#[tracing::instrument(skip_all)]
pub async fn list(
    State(state): State<AppState>,
    user: RouteUser,
) -> Result<Json<CategoryList>, AppError> {
    Ok(Json(service::list(&state, &user).await?))
}

#[utoipa::path(post, path = "/api/categories", operation_id = "createCategory", tag = "Categories", request_body = CreateCategoryRequest, responses((status = 200, body = Category)))]
#[tracing::instrument(skip_all)]
pub async fn create(
    State(state): State<AppState>,
    user: RouteUser,
    ValidJson(body): ValidJson<CreateCategoryRequest>,
) -> Result<Json<Category>, AppError> {
    Ok(Json(service::create(&state, &user, body).await?))
}

#[utoipa::path(put, path = "/api/categories/{id}", operation_id = "updateCategory", tag = "Categories", params(("id" = String, Path)), request_body = UpdateCategoryRequest, responses((status = 200, body = Category)))]
#[tracing::instrument(skip_all)]
pub async fn update(
    State(state): State<AppState>,
    user: RouteUser,
    Path(id): Path<String>,
    ValidJson(body): ValidJson<UpdateCategoryRequest>,
) -> Result<Json<Category>, AppError> {
    Ok(Json(service::update(&state, &user, &id, body).await?))
}

/// Deletes the category and clears it from the caller's events.
#[utoipa::path(delete, path = "/api/categories/{id}", operation_id = "deleteCategory", tag = "Categories", params(("id" = String, Path)), responses((status = 200, body = SuccessMessage)))]
#[tracing::instrument(skip_all)]
pub async fn delete(
    State(state): State<AppState>,
    user: RouteUser,
    Path(id): Path<String>,
) -> Result<Json<SuccessMessage>, AppError> {
    Ok(Json(service::delete(&state, &user, &id).await?))
}
