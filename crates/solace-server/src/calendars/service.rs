//! `CalendarService`: listing with the default set, create and update with name and color rules, and delete with its event handling.

use sea_orm::{IntoActiveModel, Set, TransactionTrait};
use solace_api_types::calendars::{
    Calendar, CalendarDeleteResult, CalendarList, CreateCalendarRequest, DeleteCalendarQuery,
    UpdateCalendarRequest,
};

use super::queries;
use crate::auth::guard::RouteUser;
use crate::db::entities::calendar;
use crate::entity_metadata::{
    NameInput, NamePersistence, assert_plaintext_name_allowed, assert_valid_entity_color,
    is_mail_invitation_staging_calendar, resolve_name_persistence,
};
use crate::error::AppError;
use crate::instant;
use crate::state::AppState;

/// The three calendars a new account starts with: name, color, default.
const DEFAULT_CALENDARS: [(&str, &str, bool); 3] = [
    ("Personal", "#10b981", true),
    ("Work", "#3b82f6", false),
    ("Family", "#f43f5e", false),
];

pub fn dto(model: calendar::Model) -> Calendar {
    Calendar {
        id: model.id.into(),
        name: model.name,
        encrypted_name: model.encrypted_name,
        blind_index_tokens: model.blind_index_tokens,
        encryption_state: model.encryption_state,
        encryption_key_version: model.encryption_key_version,
        force_full_encryption: model.force_full_encryption,
        color: model.color,
        kind: model.kind,
        is_public: model.is_public,
        is_visible: model.is_visible,
        is_default: model.is_default,
        is_sync_only: model.is_sync_only,
        ics_share_token: model.ics_share_token,
        ics_share_enabled: model.ics_share_enabled,
        stalwart_account_id: model.stalwart_account_id,
        stalwart_calendar_id: model.stalwart_calendar_id,
        stalwart_synced_at: model.stalwart_synced_at.map(instant::iso),
        user_id: model.user_id.into(),
        created_at: instant::iso(model.created_at),
        updated_at: instant::iso(model.updated_at),
    }
}

/// `ensureUserCalendars`: an account without calendars gets the defaults; a failure is logged, never raised.
pub async fn ensure_user_calendars(state: &AppState, user_id: &str) {
    let created: Result<(), sea_orm::DbErr> = async {
        if queries::count_owned_by(&state.db, user_id).await? > 0 {
            return Ok(());
        }
        for (name, color, is_default) in DEFAULT_CALENDARS {
            let row = queries::new_calendar(user_id, name, color, true, is_default);
            queries::insert(&state.db, row).await?;
        }
        tracing::info!("Created default calendars");
        Ok(())
    }
    .await;
    if let Err(error) = created {
        tracing::error!(error = %crate::telemetry::redact_pii(&error.to_string()), "Failed to ensure default calendars");
    }
}

pub async fn list(state: &AppState, user: &RouteUser) -> Result<CalendarList, AppError> {
    ensure_user_calendars(state, &user.id).await;
    let calendars = queries::owned_by(&state.db, &user.id).await?;
    Ok(CalendarList {
        calendars: calendars.into_iter().map(dto).collect(),
    })
}

/// Writes the name columns; plaintext leaves the key version alone, as Prisma did.
fn apply_name(row: &mut calendar::ActiveModel, persistence: NamePersistence) {
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

async fn assert_unique_name(
    state: &AppState,
    user_id: &str,
    name: &str,
    except: Option<&str>,
) -> Result<(), AppError> {
    assert_plaintext_name_allowed(&state.db, user_id, "Calendar").await?;
    if queries::named(&state.db, user_id, name, except)
        .await?
        .is_some()
    {
        return Err(AppError::field(
            "A calendar with this name already exists",
            "name",
        ));
    }
    Ok(())
}

pub async fn create(
    state: &AppState,
    user: &RouteUser,
    request: CreateCalendarRequest,
) -> Result<Calendar, AppError> {
    let persistence = resolve_name_persistence(NameInput {
        entity_label: "Calendar",
        name: request.name.as_deref(),
        encrypted_name: request.encrypted_name.as_deref(),
        blind_index_tokens: request.blind_index_tokens.as_deref(),
        encryption_key_version: request.encryption_key_version,
        require_name: true,
    })?;
    assert_valid_entity_color(&request.color)?;
    if let NamePersistence::Plaintext(name) = &persistence {
        assert_unique_name(state, &user.id, name, None).await?;
    }
    let is_default = request.is_default.unwrap_or(false);
    let mut row = calendar::ActiveModel {
        force_full_encryption: Set(request.force_full_encryption.unwrap_or(true)),
        color: Set(request.color),
        kind: Set("owned".into()),
        is_public: Set(false),
        is_visible: Set(true),
        is_default: Set(is_default),
        user_id: Set(user.id.clone()),
        ..Default::default()
    };
    apply_name(&mut row, persistence);
    let transaction = state.db.begin().await?;
    if is_default {
        queries::clear_default(&transaction, &user.id, None).await?;
    }
    let created = queries::insert(&transaction, row).await?;
    transaction.commit().await?;
    Ok(dto(created))
}

pub async fn update(
    state: &AppState,
    user: &RouteUser,
    id: &str,
    request: UpdateCalendarRequest,
) -> Result<Calendar, AppError> {
    let persistence = resolve_name_persistence(NameInput {
        entity_label: "Calendar",
        name: request.name.as_deref(),
        encrypted_name: request.encrypted_name.as_deref(),
        blind_index_tokens: request.blind_index_tokens.as_deref(),
        encryption_key_version: request.encryption_key_version,
        require_name: false,
    })?;
    let Some(existing) = queries::find(&state.db, &user.id, id).await? else {
        return Err(AppError::validation("Calendar not found or access denied"));
    };
    let visibility_only = request.is_visible.is_some()
        && matches!(persistence, NamePersistence::None)
        && request.color.is_none()
        && request.is_default.is_none()
        && request.force_full_encryption.is_none();
    if existing.kind != "owned" && !visibility_only {
        return Err(AppError::validation(
            "Only owned calendars can be updated here. Manage subscribed or public calendars from subscriptions instead.",
        ));
    }
    let is_default = request.is_default == Some(true);
    if is_default
        && is_mail_invitation_staging_calendar(
            &existing.kind,
            existing.is_sync_only,
            existing.is_visible,
            &existing.name,
        )
    {
        return Err(AppError::field(
            "The invitations calendar cannot be the default calendar.",
            "isDefault",
        ));
    }
    if let NamePersistence::Plaintext(name) = &persistence {
        assert_unique_name(state, &user.id, name, Some(id)).await?;
    }
    if let Some(color) = &request.color {
        assert_valid_entity_color(color)?;
    }
    let enabling_full_encryption =
        request.force_full_encryption == Some(true) && !existing.force_full_encryption;
    let mut row = existing.into_active_model();
    apply_name(&mut row, persistence);
    if let Some(color) = request.color {
        row.color = Set(color);
    }
    if let Some(is_visible) = request.is_visible {
        row.is_visible = Set(is_visible);
    }
    if let Some(is_default) = request.is_default {
        row.is_default = Set(is_default);
    }
    if let Some(force) = request.force_full_encryption {
        row.force_full_encryption = Set(force);
    }
    let transaction = state.db.begin().await?;
    if is_default {
        queries::clear_default(&transaction, &user.id, Some(id)).await?;
    }
    let updated = queries::update(&transaction, row).await?;
    if enabling_full_encryption {
        // Legacy plaintext events without ciphertext need a client-side re-encryption pass instead.
        queries::drop_plaintext_shadows(&transaction, &user.id, id).await?;
    }
    transaction.commit().await?;
    Ok(dto(updated))
}

pub async fn delete(
    state: &AppState,
    user: &RouteUser,
    id: &str,
    query: DeleteCalendarQuery,
) -> Result<CalendarDeleteResult, AppError> {
    let action = query.action.unwrap_or_else(|| "delete_events".into());
    let Some(existing) = queries::find(&state.db, &user.id, id).await? else {
        return Err(AppError::validation("Calendar not found or access denied"));
    };
    if existing.kind != "owned" {
        return Err(AppError::validation(
            "Only owned calendars can be deleted here. Manage subscribed or public calendars from subscriptions instead.",
        ));
    }
    if queries::count_editable(&state.db, &user.id).await? <= 1 {
        return Err(AppError::field(
            "Cannot delete the last editable calendar. Create another calendar first.",
            "calendarId",
        ));
    }
    let events = queries::count_events(&state.db, id).await?;
    if events > 0 {
        if action == "move_events" {
            let Some(target_id) = query.target_calendar_id.filter(|t| !t.0.is_empty()) else {
                return Err(AppError::field(
                    "Target calendar ID is required when moving events",
                    "targetCalendarId",
                ));
            };
            let target = queries::find(&state.db, &user.id, &target_id.0)
                .await?
                .filter(|target| {
                    !is_mail_invitation_staging_calendar(
                        &target.kind,
                        target.is_sync_only,
                        target.is_visible,
                        &target.name,
                    )
                });
            let Some(target) = target else {
                return Err(AppError::field(
                    "Target calendar not found or access denied",
                    "targetCalendarId",
                ));
            };
            if target.id == id {
                return Err(AppError::field(
                    "Cannot move events to the same calendar being deleted",
                    "targetCalendarId",
                ));
            }
            queries::move_events(&state.db, id, &target).await?;
        } else {
            let transaction = state.db.begin().await?;
            queries::delete_events(&transaction, id).await?;
            transaction.commit().await?;
        }
    }
    if existing.is_default
        && let Some(next) = queries::next_default(&state.db, &user.id, id).await?
    {
        queries::make_default(&state.db, next).await?;
    }
    queries::delete(&state.db, existing).await?;
    let message = if action == "move_events" {
        format!("Calendar deleted successfully. {events} events moved to target calendar.")
    } else if events > 0 {
        format!("Calendar deleted successfully. {events} events were also deleted.")
    } else {
        "Calendar deleted successfully.".into()
    };
    Ok(CalendarDeleteResult {
        success: true,
        message,
        deleted_calendar_id: id.to_owned().into(),
        events_affected: i64::try_from(events).unwrap_or(i64::MAX),
        action,
    })
}
