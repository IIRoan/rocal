//! An attendee's answer to an invitation copy: the reply to the organizer, and the hidden tombstone a decline leaves.

use solace_api_types::events::{RsvpDeleted, RsvpRequest, RsvpResult};

use super::{queries, view};
use crate::auth::guard::RouteUser;
use crate::error::AppError;
use crate::http::zod::js_trim;
use crate::instant;
use crate::invitations::rsvp_reply::{self, Reply, RsvpStatus};
use crate::invitations::{
    resolve_accepted_invitation_target_calendar, resolve_invitation_staging_calendar,
};
use crate::state::AppState;

/// Organizers match replies by UID, so a sealed event still gets a readable subject.
const ENCRYPTED_EVENT_REPLY_TITLE: &str = "Invitation";

/// `POST /api/events/{id}/rsvp`, whose schema already admits only the three answers.
pub async fn answer(
    state: &AppState,
    user: &RouteUser,
    event_id: &str,
    request: &RsvpRequest,
) -> Result<RsvpResult, AppError> {
    let status = RsvpStatus::parse(&request.status)
        .ok_or_else(|| AppError::field("Invalid RSVP status", "status"))?;
    respond(state, user, event_id, status).await
}

/// `respondToInvitation`: sets the caller's attendee status, replies to the organizer, and moves the copy.
pub async fn respond(
    state: &AppState,
    user: &RouteUser,
    event_id: &str,
    status: RsvpStatus,
) -> Result<RsvpResult, AppError> {
    let user_email = queries::user(&state.db, &user.id)
        .await?
        .map(|row| js_trim(&row.email).to_lowercase());
    let event = queries::find(&state.db, &user.id, event_id)
        .await?
        .filter(|event| event.subscription_id.is_none())
        .ok_or_else(|| AppError::validation("Event not found or access denied"))?;
    let participants =
        queries::participants_with_users(&state.db, std::slice::from_ref(&event.id)).await?;
    let attendee = participants
        .iter()
        .map(|(row, _)| row)
        .find(|row| {
            row.role != "organizer"
                && (row.user_id.as_deref() == Some(user.id.as_str())
                    || user_email.as_deref().is_some_and(|email| {
                        !email.is_empty() && js_trim(&row.email).to_lowercase() == email
                    }))
        })
        .cloned()
        .ok_or_else(|| {
            AppError::field(
                "This event does not have an attendee invitation for your account.",
                "eventId",
            )
        })?;
    if status != RsvpStatus::Declined
        && let Some(target) =
            resolve_accepted_invitation_target_calendar(&state.db, &user.id, None).await?
        && event.calendar_id != target.id
    {
        queries::move_to_calendar(
            &state.db,
            &user.id,
            vec![event.id.clone()],
            &target.id,
            instant::now(),
        )
        .await?;
    }
    let uid = event
        .external_id
        .clone()
        .filter(|uid| !uid.is_empty())
        .unwrap_or_else(|| format!("{}@solace-calendar.local", event.id));
    queries::set_participant_status(&state.db, attendee.clone(), status.as_str()).await?;
    let organizer = participants
        .iter()
        .map(|(row, _)| row)
        .find(|row| row.role == "organizer");
    if let (Some(organizer), Some(user_email)) = (
        organizer.filter(|o| !o.email.is_empty()),
        user_email.as_deref().filter(|e| !e.is_empty()),
    ) {
        rsvp_reply::send(
            state,
            &Reply {
                organizer_email: &organizer.email,
                attendee_email: user_email,
                attendee_display_name: attendee.display_name.as_deref(),
                title: if event.title.is_empty() {
                    ENCRYPTED_EVENT_REPLY_TITLE
                } else {
                    &event.title
                },
                uid: &uid,
                start: event.start,
                end: event.end,
                all_day: event.all_day,
                timezone: Some(&event.timezone),
                status,
            },
        )
        .await;
    }
    if status == RsvpStatus::Declined {
        queries::delete_reminders(&state.db, vec![event.id.clone()]).await?;
        queries::delete_notification_logs(&state.db, None, vec![event.id.clone()]).await?;
        let staging = resolve_invitation_staging_calendar(&state.db, &user.id).await?;
        queries::stage_declined(&state.db, &event.id, &staging.id, instant::now()).await?;
        return Ok(RsvpResult::Deleted(RsvpDeleted { deleted: true }));
    }
    let updated = queries::find(&state.db, &user.id, event_id)
        .await?
        .ok_or_else(|| AppError::validation("Event not found or access denied"))?;
    Ok(RsvpResult::Event(Box::new(
        view::one(&state.db, &updated).await?,
    )))
}

/// `purgeInvitationEventRecord`: a declined copy the attendee deleted leaves no row behind.
pub async fn purge(state: &AppState, user: &RouteUser, event_id: &str) -> Result<(), AppError> {
    queries::delete_reminders(&state.db, vec![event_id.to_owned()]).await?;
    queries::delete_notification_logs(&state.db, Some(&user.id), vec![event_id.to_owned()]).await?;
    queries::delete(&state.db, &user.id, vec![event_id.to_owned()]).await?;
    Ok(())
}
