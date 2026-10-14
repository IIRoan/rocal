//! `CalendarSharingService`: the token-protected public ICS link of an owned, unsynced calendar.

use solace_api_types::calendars::{CalendarShareLink, DisableShareLinkResponse};

use super::queries;
use crate::auth::api::{ALPHANUMERIC, random_string};
use crate::auth::cookies::encode_uri_component;
use crate::auth::guard::RouteUser;
use crate::db::entities::calendar;
use crate::error::AppError;
use crate::events::encryption::backfill_ciphertext_only;
use crate::instant;
use crate::state::AppState;

const SHARE_TOKEN_LENGTH: usize = 40;

fn not_found() -> AppError {
    AppError::validation("Calendar not found or access denied")
}

fn base_url(state: &AppState) -> String {
    state
        .config
        .backend_url
        .trim()
        .trim_end_matches('/')
        .to_owned()
}

fn link(state: &AppState, calendar: &calendar::Model) -> CalendarShareLink {
    let token = calendar
        .ics_share_token
        .as_deref()
        .filter(|token| calendar.ics_share_enabled && !token.is_empty());
    CalendarShareLink {
        calendar_id: calendar.id.clone().into(),
        calendar_name: calendar.name.clone(),
        enabled: token.is_some(),
        share_url: token.map(|token| {
            format!(
                "{}/api/calendars/shared/{}",
                base_url(state),
                encode_uri_component(token)
            )
        }),
    }
}

async fn shareable(
    state: &AppState,
    user: &RouteUser,
    id: &str,
) -> Result<calendar::Model, AppError> {
    let calendar = queries::find(&state.db, &user.id, id)
        .await?
        .ok_or_else(not_found)?;
    if calendar.is_sync_only {
        return Err(AppError::validation(
            "Cannot share a synced calendar. This calendar is read-only and synced from an external subscription.",
        ));
    }
    Ok(calendar)
}

pub async fn get(
    state: &AppState,
    user: &RouteUser,
    id: &str,
) -> Result<CalendarShareLink, AppError> {
    let calendar = shareable(state, user, id).await?;
    Ok(link(state, &calendar))
}

async fn unique_token(state: &AppState) -> Result<String, AppError> {
    for _ in 0..5 {
        let token = random_string(SHARE_TOKEN_LENGTH, ALPHANUMERIC);
        if !queries::token_taken(&state.db, &token).await? {
            return Ok(token);
        }
    }
    Err(AppError::internal(
        "Unable to generate a unique share token",
    ))
}

/// Enables the link, keeping its token unless asked to rotate it; encrypted events cannot leave as ICS.
pub async fn create(
    state: &AppState,
    user: &RouteUser,
    id: &str,
    regenerate: bool,
) -> Result<CalendarShareLink, AppError> {
    let calendar = shareable(state, user, id).await?;
    if queries::count_encrypted_events(&state.db, &user.id, &calendar.id).await? > 0 {
        return Err(AppError::validation(
            "ICS sharing is unavailable while this calendar contains encrypted events.",
        ));
    }
    let token = match calendar.ics_share_token.clone() {
        Some(token) if !token.is_empty() && !regenerate => token,
        _ => unique_token(state).await?,
    };
    let updated = queries::set_share(&state.db, calendar, true, Some(token)).await?;
    Ok(link(state, &updated))
}

/// Revokes the link; plaintext left beside ciphertext is dropped now that nothing exports it.
pub async fn disable(
    state: &AppState,
    user: &RouteUser,
    id: &str,
) -> Result<DisableShareLinkResponse, AppError> {
    let calendar = queries::find(&state.db, &user.id, id)
        .await?
        .ok_or_else(not_found)?;
    if calendar.is_sync_only {
        return Err(AppError::validation(
            "Cannot modify sharing for a synced calendar.",
        ));
    }
    let calendar_id = calendar.id.clone();
    let now = instant::now();
    queries::set_share(&state.db, calendar, false, None).await?;
    backfill_ciphertext_only(&state.db, &user.id, &[&calendar_id], now).await?;
    Ok(DisableShareLinkResponse { success: true })
}
