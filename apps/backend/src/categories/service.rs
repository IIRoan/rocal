//! `CategoryService`: active categories with usage counts, and create, update and delete with the shared name and color rules.

use sea_orm::{IntoActiveModel, Set};
use solace_api_types::SuccessMessage;
use solace_api_types::categories::{
    Category, CategoryList, CreateCategoryRequest, ListedCategory, UpdateCategoryRequest,
};

use super::queries;
use crate::auth::guard::RouteUser;
use crate::db::entities::event_category;
use crate::entity_metadata::{
    NameInput, apply_name, assert_valid_entity_color, resolve_name_persistence,
};
use crate::error::AppError;
use crate::instant;
use crate::state::AppState;

pub fn dto(model: event_category::Model) -> Category {
    Category {
        id: model.id.into(),
        name: model.name,
        encrypted_name: model.encrypted_name,
        blind_index_tokens: model.blind_index_tokens,
        encryption_state: model.encryption_state,
        encryption_key_version: model.encryption_key_version,
        color: model.color,
        is_active: model.is_active,
        user_id: model.user_id.into(),
        created_at: instant::iso(model.created_at),
        updated_at: instant::iso(model.updated_at),
    }
}

fn not_found() -> AppError {
    AppError::field("Category not found or access denied", "categoryId")
}

pub async fn list(state: &AppState, user: &RouteUser) -> Result<CategoryList, AppError> {
    let categories = queries::active(&state.db, &user.id).await?;
    let ids = categories.iter().map(|c| c.id.clone()).collect();
    let counts = queries::usage_counts(&state.db, ids).await?;
    Ok(CategoryList {
        categories: categories
            .into_iter()
            .map(|category| ListedCategory {
                usage_count: counts.get(&category.id).copied().unwrap_or(0),
                category: dto(category),
            })
            .collect(),
    })
}

pub async fn create(
    state: &AppState,
    user: &RouteUser,
    request: CreateCategoryRequest,
) -> Result<Category, AppError> {
    let persistence = resolve_name_persistence(NameInput {
        entity_label: "Category",
        encrypted_name: Some(&request.encrypted_name),
        blind_index_tokens: request.blind_index_tokens.as_deref(),
        encryption_key_version: request.encryption_key_version,
    })?;
    assert_valid_entity_color(&request.color)?;
    let mut row = event_category::ActiveModel {
        color: Set(request.color),
        user_id: Set(user.id.clone()),
        ..Default::default()
    };
    apply_name!(row, persistence);
    Ok(dto(queries::insert(&state.db, row).await?))
}

pub async fn update(
    state: &AppState,
    user: &RouteUser,
    id: &str,
    request: UpdateCategoryRequest,
) -> Result<Category, AppError> {
    let persistence = resolve_name_persistence(NameInput {
        entity_label: "Category",
        encrypted_name: request.encrypted_name.as_deref(),
        blind_index_tokens: request.blind_index_tokens.as_deref(),
        encryption_key_version: request.encryption_key_version,
    })?;
    let existing = queries::find(&state.db, &user.id, id)
        .await?
        .ok_or_else(not_found)?;
    if let Some(color) = &request.color {
        assert_valid_entity_color(color)?;
    }
    let mut row = existing.into_active_model();
    apply_name!(row, persistence);
    if let Some(color) = request.color {
        row.color = Set(color);
    }
    Ok(dto(queries::update(&state.db, row).await?))
}

pub async fn delete(
    state: &AppState,
    user: &RouteUser,
    id: &str,
) -> Result<SuccessMessage, AppError> {
    let existing = queries::find(&state.db, &user.id, id)
        .await?
        .ok_or_else(not_found)?;
    queries::delete(&state.db, &user.id, existing).await?;
    Ok(SuccessMessage {
        success: true,
        message: "Category deleted successfully".into(),
    })
}
