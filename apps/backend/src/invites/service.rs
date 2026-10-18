//! Invite rules: who may invite whom, the claim that reserves an address, and the sign-up gate it opens.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use rand::RngExt;
use solace_api_types::account::{
    ClaimInviteRequest, CreateInviteRequest, Invite, InviteClaimRefused, InviteClaimResult,
    InviteClaimed, InviteInvalid, InviteList, InviteStatus, InviteValid, InviteValidation,
};
use solace_api_types::auth::SuccessFlag;

use super::queries;
use crate::addresses;
use crate::auth::guard::RouteUser;
use crate::auth::store;
use crate::db::entities::invite;
use crate::email;
use crate::error::AppError;
use crate::instant;
use crate::state::AppState;
use crate::telemetry::log_ref;

const EXPIRY_DAYS: i64 = 7;
/// Sign-up must follow the claim within this window.
const CLAIM_WINDOW_MINUTES: i64 = 15;

pub async fn create(
    state: &AppState,
    user: &RouteUser,
    request: CreateInviteRequest,
) -> Result<Invite, AppError> {
    let mut invite = insert(state, &user.id, &request.email).await?;
    let base = format!("{}/", state.config.frontend_url.trim_end_matches('/'));
    let signup_url = url::Url::parse(&base)
        .and_then(|base| {
            base.join(&format!(
                "/login?invite={}",
                crate::auth::cookies::encode_uri_component(&invite.token)
            ))
        })
        .map(|url| url.to_string())
        .map_err(AppError::internal)?;
    let message = email::invite(&inviter_name(user), &signup_url, &invite.token);
    let delivered = email::send(
        state,
        "invite",
        &invite.email,
        &message,
        email::Mode::BestEffort,
    )
    .await
    .unwrap_or(false);
    if !delivered {
        invite.warnings = Some(vec![email::delivery_warning("invite", &invite.email)]);
    }
    Ok(invite)
}

fn inviter_name(user: &RouteUser) -> String {
    let name = user.name.trim();
    if name.is_empty() {
        "Someone".into()
    } else {
        name.to_owned()
    }
}

async fn insert(state: &AppState, invited_by: &str, email: &str) -> Result<Invite, AppError> {
    let email = addresses::normalize(email);
    if email.is_empty() || !addresses::is_simple_email(&email) {
        return Err(AppError::validation(
            "Please provide a valid email address.",
        ));
    }
    if addresses::is_reserved_system_email(&email, None) {
        return Err(AppError::validation(
            "Cannot send an invite to a reserved system email address.",
        ));
    }
    if store::find_user_by_email(&state.db, &email)
        .await?
        .is_some()
    {
        return Err(AppError::Conflict(
            "That email address already has an account.".into(),
        ));
    }
    if queries::active_invite(&state.db, invited_by, &email)
        .await?
        .is_some()
    {
        return Err(AppError::Conflict(
            "You already have an active invite for that email address.".into(),
        ));
    }
    let token = URL_SAFE_NO_PAD.encode(rand::rng().random::<[u8; 32]>());
    let expires_at = instant::now() + instant::seconds(EXPIRY_DAYS * 24 * 60 * 60);
    let created = queries::insert(&state.db, invited_by, email, token, expires_at).await?;
    tracing::info!(invite_id = %created.id, "Invite created");
    Ok(record(created))
}

pub async fn list(state: &AppState, user: &RouteUser) -> Result<InviteList, AppError> {
    let invites = queries::sent_by(&state.db, &user.id).await?;
    Ok(InviteList {
        invites: invites.into_iter().map(record).collect(),
    })
}

pub async fn revoke(state: &AppState, user: &RouteUser, id: &str) -> Result<SuccessFlag, AppError> {
    let Some(found) = queries::by_id(&state.db, id).await? else {
        return Err(AppError::NotFound("Invite not found.".into()));
    };
    if found.invited_by_id != user.id {
        return Err(AppError::Forbidden(
            "You can only revoke your own invites.".into(),
        ));
    }
    match found.status.as_str() {
        "accepted" => {
            return Err(AppError::validation(
                "Cannot revoke an invite that has already been accepted.",
            ));
        }
        "revoked" => return Ok(SuccessFlag { success: true }),
        _ => {}
    }
    queries::set_status(&state.db, found, "revoked").await?;
    tracing::info!(invite_id = %id, "Invite revoked");
    Ok(SuccessFlag { success: true })
}

fn record(model: invite::Model) -> Invite {
    let status = match model.status.as_str() {
        "claimed" => InviteStatus::Claimed,
        "accepted" => InviteStatus::Accepted,
        "revoked" => InviteStatus::Revoked,
        _ => InviteStatus::Pending,
    };
    Invite {
        id: model.id.into(),
        token: model.token,
        email: model.email,
        status,
        expires_at: instant::iso(model.expires_at),
        created_at: instant::iso(model.created_at),
        invited_by_id: model.invited_by_id.into(),
        warnings: None,
    }
}

fn unavailable_reason(model: &invite::Model) -> Option<&'static str> {
    match model.status.as_str() {
        "revoked" => Some("This invite has been revoked."),
        "accepted" => Some("This invite has already been used."),
        "claimed" => Some("This invite has already been claimed."),
        _ if instant::now() > model.expires_at => Some("This invite has expired."),
        _ => None,
    }
}

/// `validateInviteToken`: whether the token can still be used, and who sent it.
pub async fn validate(state: &AppState, token: &str) -> Result<InviteValidation, AppError> {
    let Some((found, inviter)) = queries::by_token_with_inviter(&state.db, token).await? else {
        return Ok(InviteValidation::Invalid(InviteInvalid {
            valid: false,
            reason: "Invite not found. Please check the token and try again.".into(),
        }));
    };
    if let Some(reason) = unavailable_reason(&found) {
        return Ok(InviteValidation::Invalid(InviteInvalid {
            valid: false,
            reason: reason.into(),
        }));
    }
    let inviter_name = inviter
        .map(|u| u.name)
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| "Someone".into());
    Ok(InviteValidation::Valid(InviteValid {
        valid: true,
        invite_id: found.id.into(),
        email: found.email,
        inviter_name,
    }))
}

/// `claimInviteToken`: reserves the chosen Solace address for the sign-up that follows; one concurrent claim wins.
pub async fn claim(
    state: &AppState,
    request: &ClaimInviteRequest,
) -> Result<InviteClaimResult, AppError> {
    let refuse = |reason: &str| {
        InviteClaimResult::Refused(InviteClaimRefused {
            success: false,
            reason: reason.into(),
        })
    };
    let Some(found) = queries::by_token(&state.db, &request.token).await? else {
        return Ok(refuse("Invite not found."));
    };
    if let Some(reason) = unavailable_reason(&found) {
        return Ok(refuse(reason));
    }
    let chosen = addresses::normalize(&request.chosen_email);
    if chosen.is_empty() {
        return Ok(refuse("A Solace email is required."));
    }
    if addresses::is_reserved_system_email(&chosen, None) {
        return Ok(refuse("That email address is reserved."));
    }
    if store::find_user_by_email(&state.db, &chosen)
        .await?
        .is_some()
    {
        return Ok(refuse("That email address already has an account."));
    }
    if !queries::claim_pending(&state.db, &found.id, &chosen).await? {
        return Ok(refuse("This invite is no longer available."));
    }
    tracing::info!(invite_id = %found.id, recipient_ref = %log_ref(&chosen), "Invite claimed");
    Ok(InviteClaimResult::Claimed(InviteClaimed {
        success: true,
        invite_id: found.id.into(),
    }))
}

async fn claimed_invite(
    state: &AppState,
    email: &str,
) -> Result<Option<invite::Model>, sea_orm::DbErr> {
    let window_start = instant::now() - instant::seconds(CLAIM_WINDOW_MINUTES * 60);
    queries::claimed_since(&state.db, email, window_start).await
}

/// `checkSignupAllowed`: sign-up needs a claim for this address from the last fifteen minutes.
pub async fn signup_refusal(
    state: &AppState,
    email: &str,
) -> Result<Option<&'static str>, sea_orm::DbErr> {
    let normalized = addresses::normalize(email);
    if addresses::is_reserved_system_email(&normalized, None) {
        return Ok(Some("That email address is reserved."));
    }
    Ok(claimed_invite(state, &normalized).await?.is_none().then_some(
        "An invite is required to create an account. Please use your invite token before signing up.",
    ))
}

/// `markInviteAccepted`: accepting the invite approves the account for a mailbox, so nobody approves by hand.
pub async fn mark_accepted(
    state: &AppState,
    user_id: &str,
    email: &str,
) -> Result<(), sea_orm::DbErr> {
    let normalized = addresses::normalize(email);
    let Some(found) = claimed_invite(state, &normalized).await? else {
        return Ok(());
    };
    let invite_id = found.id.clone();
    queries::accept(&state.db, found, user_id, &normalized).await?;
    tracing::info!(invite_id = %invite_id, recipient_ref = %log_ref(&normalized), "Invite marked accepted");
    Ok(())
}

/// Whether an address is free as a Solace account or mailbox, for the sign-up form.
pub async fn address_taken(state: &AppState, email: &str) -> Result<bool, sea_orm::DbErr> {
    if store::find_user_by_email(&state.db, email).await?.is_some() {
        return Ok(true);
    }
    queries::directory_entry_exists(&state.db, email).await
}
