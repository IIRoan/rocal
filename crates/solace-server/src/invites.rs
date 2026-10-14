//! Invites: the sender's routes (`/api/invites`), the public validate/claim service, and the sign-up gate that claimed invites open.

use axum::Json;
use axum::extract::{Path, State};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use rand::RngExt;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, EntityTrait, QueryFilter, QueryOrder, Set,
    TransactionTrait,
};
use solace_api_types::account::{
    ClaimInviteRequest, CreateInviteRequest, Invite, InviteClaimRefused, InviteClaimResult,
    InviteClaimed, InviteInvalid, InviteList, InviteStatus, InviteValid, InviteValidation,
};
use solace_api_types::auth::SuccessFlag;
use utoipa_axum::router::OpenApiRouter;
use utoipa_axum::routes;

use crate::addresses;
use crate::auth::guard::{Auth, RouteUser};
use crate::db::entities::{invite, mail_directory_entry, user};
use crate::email;
use crate::error::AppError;
use crate::http::extract::ValidJson;
use crate::http::zod;
use crate::instant;
use crate::request_schema;
use crate::state::AppState;
use crate::telemetry::log_ref;

const EXPIRY_DAYS: i64 = 7;
/// Sign-up must follow the claim within this window.
const CLAIM_WINDOW_MINUTES: i64 = 15;

request_schema!(CreateInviteRequest => zod::object([(
    "email",
    zod::string().min(1).max(320).refine(
        |value| !value.as_str().is_some_and(|email| addresses::is_reserved_system_email(email, None)),
        "Cannot send an invite to a reserved system email address.",
        &[],
    ),
)]).strict());

request_schema!(ClaimInviteRequest => zod::object([
    ("token", zod::string().min(1).max(500)),
    (
        "chosenEmail",
        zod::string().min(1).max(320).refine(
            |value| !value.as_str().is_some_and(|email| addresses::is_reserved_system_email(email, None)),
            "Cannot claim a reserved system email address.",
            &[],
        ),
    ),
]).strict());

pub fn routes() -> OpenApiRouter<AppState> {
    OpenApiRouter::new()
        .routes(routes!(create, list))
        .routes(routes!(revoke))
}

/// Invites someone outside Solace and mails them the link; a failed mail is a warning, not an error.
#[utoipa::path(post, path = "/api/invites", tag = "Invites", request_body = CreateInviteRequest, responses((status = 200, body = Invite)))]
#[tracing::instrument(skip_all)]
pub async fn create(
    State(state): State<AppState>,
    auth: Auth,
    ValidJson(body): ValidJson<CreateInviteRequest>,
) -> Result<Json<Invite>, AppError> {
    let user = auth.require()?;
    let mut invite = create_invite(&state, &user.id, &body.email).await?;
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
    let inviter = inviter_name(&user);
    let message = email::invite(&inviter, &signup_url, &invite.token);
    let delivered = email::send(
        &state,
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
    Ok(Json(invite))
}

fn inviter_name(user: &RouteUser) -> String {
    let name = user.name.trim();
    if name.is_empty() {
        "Someone".into()
    } else {
        name.to_owned()
    }
}

/// The caller's invites, newest first.
#[utoipa::path(get, path = "/api/invites", tag = "Invites", responses((status = 200, body = InviteList)))]
#[tracing::instrument(skip_all)]
pub async fn list(State(state): State<AppState>, auth: Auth) -> Result<Json<InviteList>, AppError> {
    let user = auth.require()?;
    let invites = invite::Entity::find()
        .filter(invite::Column::InvitedById.eq(user.id.as_str()))
        .order_by_desc(invite::Column::CreatedAt)
        .all(&state.db)
        .await?;
    Ok(Json(InviteList {
        invites: invites.into_iter().map(record).collect(),
    }))
}

/// Revokes one of the caller's invites unless it was already accepted.
#[utoipa::path(delete, path = "/api/invites/{id}", tag = "Invites", params(("id" = String, Path)), responses((status = 200, body = SuccessFlag)))]
#[tracing::instrument(skip_all)]
pub async fn revoke(
    State(state): State<AppState>,
    Path(id): Path<String>,
    auth: Auth,
) -> Result<Json<SuccessFlag>, AppError> {
    let user = auth.require()?;
    let found = invite::Entity::find_by_id(id.as_str())
        .one(&state.db)
        .await?;
    let Some(found) = found else {
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
        "revoked" => return Ok(Json(SuccessFlag { success: true })),
        _ => {}
    }
    let mut active: invite::ActiveModel = found.into();
    active.status = Set("revoked".into());
    active.update(&state.db).await?;
    tracing::info!(invite_id = %id, "Invite revoked");
    Ok(Json(SuccessFlag { success: true }))
}

async fn create_invite(
    state: &AppState,
    invited_by: &str,
    email: &str,
) -> Result<Invite, AppError> {
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
    let existing_user = user::Entity::find()
        .filter(user::Column::Email.eq(email.as_str()))
        .one(&state.db)
        .await?;
    if existing_user.is_some() {
        return Err(AppError::Conflict(
            "That email address already has an account.".into(),
        ));
    }
    let active_invite = invite::Entity::find()
        .filter(invite::Column::InvitedById.eq(invited_by))
        .filter(invite::Column::Email.eq(email.as_str()))
        .filter(invite::Column::Status.is_in(["pending", "claimed"]))
        .one(&state.db)
        .await?;
    if active_invite.is_some() {
        return Err(AppError::Conflict(
            "You already have an active invite for that email address.".into(),
        ));
    }
    let token = URL_SAFE_NO_PAD.encode(rand::rng().random::<[u8; 32]>());
    let created = invite::ActiveModel {
        invited_by_id: Set(invited_by.to_owned()),
        email: Set(email),
        expires_at: Set(instant::now() + instant::seconds(EXPIRY_DAYS * 24 * 60 * 60)),
        status: Set("pending".into()),
        token: Set(token),
        ..Default::default()
    }
    .insert(&state.db)
    .await?;
    tracing::info!(invite_id = %created.id, "Invite created");
    Ok(record(created))
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
    let found = invite::Entity::find()
        .filter(invite::Column::Token.eq(token))
        .find_also_related(user::Entity)
        .one(&state.db)
        .await?;
    let Some((found, inviter)) = found else {
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
    let found = invite::Entity::find()
        .filter(invite::Column::Token.eq(request.token.as_str()))
        .one(&state.db)
        .await?;
    let Some(found) = found else {
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
    let taken = user::Entity::find()
        .filter(user::Column::Email.eq(chosen.as_str()))
        .one(&state.db)
        .await?;
    if taken.is_some() {
        return Ok(refuse("That email address already has an account."));
    }
    let updated = invite::Entity::update_many()
        .col_expr(invite::Column::Status, "claimed".into())
        .col_expr(invite::Column::ClaimedForEmail, chosen.clone().into())
        .col_expr(invite::Column::ClaimedAt, instant::now().into())
        .col_expr(invite::Column::UpdatedAt, instant::now().into())
        .filter(invite::Column::Id.eq(found.id.as_str()))
        .filter(invite::Column::Status.eq("pending"))
        .exec(&state.db)
        .await?;
    if updated.rows_affected == 0 {
        return Ok(refuse("This invite is no longer available."));
    }
    tracing::info!(invite_id = %found.id, recipient_ref = %log_ref(&chosen), "Invite claimed");
    Ok(InviteClaimResult::Claimed(InviteClaimed {
        success: true,
        invite_id: found.id.into(),
    }))
}

async fn claimed_invite<C: ConnectionTrait>(
    db: &C,
    email: &str,
) -> Result<Option<invite::Model>, sea_orm::DbErr> {
    let window_start = instant::now() - instant::seconds(CLAIM_WINDOW_MINUTES * 60);
    invite::Entity::find()
        .filter(invite::Column::ClaimedForEmail.eq(email))
        .filter(invite::Column::Status.eq("claimed"))
        .filter(invite::Column::ClaimedAt.gte(window_start))
        .one(db)
        .await
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
    Ok(match claimed_invite(&state.db, &normalized).await? {
        Some(_) => None,
        None => Some(
            "An invite is required to create an account. Please use your invite token before signing up.",
        ),
    })
}

/// `markInviteAccepted`: accepting the invite approves the account for a mailbox, so nobody approves by hand.
pub async fn mark_accepted(
    state: &AppState,
    user_id: &str,
    email: &str,
) -> Result<(), sea_orm::DbErr> {
    let normalized = addresses::normalize(email);
    let Some(found) = claimed_invite(&state.db, &normalized).await? else {
        return Ok(());
    };
    let transaction = state.db.begin().await?;
    let mut accepted: invite::ActiveModel = found.clone().into();
    accepted.status = Set("accepted".into());
    accepted.update(&transaction).await?;
    user::Entity::update_many()
        .col_expr(user::Column::MailboxApprovedAt, instant::now().into())
        .filter(user::Column::Id.eq(user_id))
        .filter(user::Column::Email.eq(normalized.as_str()))
        .filter(user::Column::MailboxApprovedAt.is_null())
        .exec(&transaction)
        .await?;
    transaction.commit().await?;
    tracing::info!(invite_id = %found.id, recipient_ref = %log_ref(&normalized), "Invite marked accepted");
    Ok(())
}

/// Whether an address is free as a Solace account or mailbox, for the sign-up form.
pub async fn address_taken(state: &AppState, email: &str) -> Result<bool, sea_orm::DbErr> {
    let user = user::Entity::find()
        .filter(user::Column::Email.eq(email))
        .one(&state.db)
        .await?;
    if user.is_some() {
        return Ok(true);
    }
    Ok(mail_directory_entry::Entity::find()
        .filter(mail_directory_entry::Column::Email.eq(email))
        .one(&state.db)
        .await?
        .is_some())
}
