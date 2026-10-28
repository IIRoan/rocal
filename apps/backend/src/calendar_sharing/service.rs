//! `CalendarSharingService`: the token-protected public ICS link of an owned, unsynced calendar.

use solace_api_types::calendars::{CalendarShareLink, DisableShareLinkResponse};

use super::queries;
use crate::auth::api::{ALPHANUMERIC, random_string};
use crate::auth::cookies::encode_uri_component;
use crate::auth::guard::RouteUser;
use crate::calendars::queries as calendars;
use crate::db::entities::calendar;
use crate::entity_metadata::external_calendar_name;
use crate::error::AppError;
use crate::events::queries as events;
use crate::events::service::{attach_exceptions, export_event};
use crate::instant;
use crate::integrations::ics::{build, export};
use crate::state::AppState;

const SHARE_TOKEN_LENGTH: usize = 40;

fn not_found() -> AppError {
    AppError::validation("Calendar not found or access denied")
}

fn share_url(state: &AppState, token: &str) -> String {
    let base = state.config.backend_url.trim().trim_end_matches('/');
    format!(
        "{base}/api/calendars/shared/{}",
        encode_uri_component(token)
    )
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
        share_url: token.map(|token| share_url(state, token)),
    }
}

async fn shareable(
    state: &AppState,
    user: &RouteUser,
    id: &str,
) -> Result<calendar::Model, AppError> {
    let calendar = calendars::find(&state.db, &user.id, id)
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

/// Revokes the link.
pub async fn disable(
    state: &AppState,
    user: &RouteUser,
    id: &str,
) -> Result<DisableShareLinkResponse, AppError> {
    let calendar = calendars::find(&state.db, &user.id, id)
        .await?
        .ok_or_else(not_found)?;
    if calendar.is_sync_only {
        return Err(AppError::validation(
            "Cannot modify sharing for a synced calendar.",
        ));
    }
    queries::set_share(&state.db, calendar, false, None).await?;
    Ok(DisableShareLinkResponse { success: true })
}

/// The public feed behind an enabled token (an `.ics` suffix and spaces are ignored): the calendar name and its ICS, which never names the owner.
pub async fn feed(state: &AppState, raw_token: &str) -> Result<(String, String), AppError> {
    let token = raw_token.trim();
    let token = match token.len().checked_sub(4) {
        Some(at) if token.is_char_boundary(at) && token[at..].eq_ignore_ascii_case(".ics") => {
            &token[..at]
        }
        _ => token,
    };
    let not_found = || AppError::NotFound("Shared calendar not found".into());
    if token.is_empty() {
        return Err(not_found());
    }
    let calendar = queries::shared(&state.db, token)
        .await?
        .ok_or_else(not_found)?;
    let events = queries::feed_events(&state.db, &calendar.id).await?;
    if events
        .iter()
        .any(|event| event.encryption_state == "encrypted")
    {
        return Err(AppError::validation(
            "This shared calendar contains encrypted event details and cannot be exported.",
        ));
    }
    let zone = events
        .iter()
        .find(|event| !event.all_day && !event.timezone.is_empty())
        .map(|event| event.timezone.as_str());
    let series: Vec<String> = events
        .iter()
        .filter(|event| event.recurrence.is_some())
        .map(|event| event.id.clone())
        .collect();
    let exceptions = if series.is_empty() {
        Vec::new()
    } else {
        events::exceptions(&state.db, series).await?
    };
    let mut built = events
        .iter()
        .map(|event| export::to_build_event(&export_event(event, &[])))
        .collect::<Result<Vec<_>, export::InvalidUntil>>()
        .map_err(|_| AppError::internal("recurrence until is not a valid instant"))?;
    attach_exceptions(&events.iter().collect::<Vec<_>>(), &mut built, &exceptions);
    let name = external_calendar_name(&calendar.name);
    let ics = build::build_calendar(
        &build::Calendar {
            name: Some(name.clone()),
            timezone: Some(instant::resolve_timezone(zone)),
            source_url: Some(share_url(state, raw_token)),
            ..Default::default()
        },
        &built,
    );
    Ok((name, ics))
}
