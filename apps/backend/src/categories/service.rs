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
    NameInput, NamePersistence, assert_plaintext_name_allowed, assert_valid_entity_color,
    resolve_name_persistence,
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

fn duplicate() -> AppError {
    AppError::field("A category with this name already exists", "name")
}

fn apply_name(row: &mut event_category::ActiveModel, persistence: NamePersistence) {
    match persistence {
        NamePersistence::None => {}
        NamePersistence::Plaintext(name) => {
            row.name = Set(name);
            row.encrypted_name = Set(None);
            row.blind_index_tokens = Set(None);
            row.encryption_state = Set("plaintext".into());
        }
        NamePersistence::Encrypted {
            encrypted_name,
            blind_index_tokens,
            encryption_key_version,
        } => {
            row.name = Set(String::new());
            row.encrypted_name = Set(Some(encrypted_name));
            row.blind_index_tokens = Set(Some(blind_index_tokens));
            row.encryption_state = Set("encrypted".into());
            row.encryption_key_version = Set(encryption_key_version);
        }
    }
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
        name: request.name.as_deref(),
        encrypted_name: request.encrypted_name.as_deref(),
        blind_index_tokens: request.blind_index_tokens.as_deref(),
        encryption_key_version: request.encryption_key_version,
        require_name: true,
    })?;
    assert_valid_entity_color(&request.color)?;
    if let NamePersistence::Plaintext(name) = &persistence {
        assert_plaintext_name_allowed(&state.db, &user.id, "Category").await?;
        if queries::named(&state.db, &user.id, name, None)
            .await?
            .is_some()
        {
            return Err(duplicate());
        }
    }
    let mut row = event_category::ActiveModel {
        color: Set(request.color),
        user_id: Set(user.id.clone()),
        ..Default::default()
    };
    apply_name(&mut row, persistence);
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
        name: request.name.as_deref(),
        encrypted_name: request.encrypted_name.as_deref(),
        blind_index_tokens: request.blind_index_tokens.as_deref(),
        encryption_key_version: request.encryption_key_version,
        require_name: false,
    })?;
    let existing = queries::find(&state.db, &user.id, id)
        .await?
        .ok_or_else(not_found)?;
    if let Some(color) = &request.color {
        assert_valid_entity_color(color)?;
    }
    if let NamePersistence::Plaintext(name) = &persistence {
        assert_plaintext_name_allowed(&state.db, &user.id, "Category").await?;
        if *name != existing.name
            && queries::named(&state.db, &user.id, name, Some(id))
                .await?
                .is_some()
        {
            return Err(duplicate());
        }
    }
    let mut row = existing.into_active_model();
    apply_name(&mut row, persistence);
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
