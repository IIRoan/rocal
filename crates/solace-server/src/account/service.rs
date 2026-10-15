//! `AccountService`: address availability, the auth status and account deletion.

use std::sync::LazyLock;

use axum::http::HeaderMap;
use regex_lite::Regex;
use sea_orm::TransactionTrait;
use solace_api_types::account::{
    AuthStatus, DeleteAccountResponse, EmailAvailability, EmailAvailabilityCode,
};

use super::queries;
use crate::addresses;
use crate::auth::guard::{RouteUser, has_passkeys, step_up_verified};
use crate::auth::session::ActiveSession;
use crate::error::AppError;
use crate::invites;
use crate::mail;
use crate::profiles::avatars;
use crate::state::AppState;

static LOCAL_PART: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$")
        .unwrap_or_else(|error| panic!("local part pattern: {error}"))
});

pub async fn availability(state: &AppState, email: &str) -> Result<EmailAvailability, AppError> {
    let domain = addresses::normalize(&state.config.stalwart_default_domain);
    let answer = |local_part: Option<String>, normalized_email: String, code, message: &str| {
        EmailAvailability {
            email: email.to_owned(),
            local_part,
            domain: domain.clone(),
            normalized_email,
            available: code == EmailAvailabilityCode::Available,
            code,
            message: message.to_owned(),
        }
    };
    let desired = match desired_address(email, &domain) {
        Ok(desired) => desired,
        Err(invalid) => {
            let code = if invalid.message.contains("reserved") {
                EmailAvailabilityCode::Reserved
            } else {
                EmailAvailabilityCode::InvalidEmail
            };
            return Ok(answer(
                invalid.local_part,
                invalid.normalized_email,
                code,
                &invalid.message,
            ));
        }
    };
    if invites::service::address_taken(state, &desired.normalized_email).await? {
        return Ok(answer(
            Some(desired.local_part),
            desired.normalized_email,
            EmailAvailabilityCode::AlreadyInUse,
            "That email address is already in use.",
        ));
    }
    Ok(answer(
        Some(desired.local_part),
        desired.normalized_email,
        EmailAvailabilityCode::Available,
        "That email address is available.",
    ))
}

pub async fn status(
    state: &AppState,
    headers: &HeaderMap,
    active: Option<ActiveSession>,
) -> Result<AuthStatus, AppError> {
    Ok(match active {
        None => AuthStatus {
            authenticated: false,
            has_passkeys: false,
            requires_passkey_step_up: false,
        },
        Some(active) => {
            let has_passkeys = has_passkeys(state, &active.user.id).await?;
            let verified = step_up_verified(state, headers, &active);
            AuthStatus {
                authenticated: true,
                has_passkeys,
                requires_passkey_step_up: has_passkeys && !verified,
            }
        }
    })
}

/// `deleteAccount`: the Stalwart mailbox first, so a failure there keeps the whole account for a retry.
pub async fn delete(state: &AppState, user: &RouteUser) -> Result<DeleteAccountResponse, AppError> {
    let existing = queries::user(&state.db, &user.id)
        .await?
        .ok_or_else(|| AppError::NotFound("User account not found".into()))?;
    let mailbox = queries::mailbox(&state.db, &user.id).await?;
    // Read before the mailbox and its directory entry are removed.
    let mut emails: Vec<String> = Vec::new();
    for email in [Some(&existing.email), mailbox.as_ref().map(|m| &m.email)]
        .into_iter()
        .flatten()
        .map(|email| email.trim().to_lowercase())
        .filter(|email| !email.is_empty())
    {
        if !emails.contains(&email) {
            emails.push(email);
        }
    }
    mail::service::delete_mailbox_for_user(state, &user.id).await?;
    let transaction = state.db.begin().await?;
    avatars::delete_current(state, &transaction, &user.id).await?;
    queries::delete_user(&transaction, &user.id, &emails).await?;
    transaction.commit().await?;
    tracing::warn!("Deleted user account");
    Ok(DeleteAccountResponse {
        success: true,
        message: "Account deleted successfully".into(),
        deleted_user_id: user.id.clone().into(),
    })
}

struct Desired {
    local_part: String,
    normalized_email: String,
}

struct Invalid {
    local_part: Option<String>,
    normalized_email: String,
    message: String,
}

/// `normalizeDesiredSolaceEmailInput`: a handle or a full address on the Solace domain, valid and not reserved.
fn desired_address(value: &str, domain: &str) -> Result<Desired, Invalid> {
    let normalized = addresses::normalize(value);
    let invalid = |local_part: Option<&str>, normalized_email: &str, message: String| Invalid {
        local_part: local_part.map(str::to_owned),
        normalized_email: normalized_email.to_owned(),
        message,
    };
    const CHARACTERS: &str =
        "Use only lowercase letters, numbers, dots, underscores, and hyphens in your Solace email.";
    if normalized.is_empty() {
        return Err(invalid(
            None,
            &normalized,
            format!("Choose your @{domain} email address."),
        ));
    }
    let reserved = |email: &str, local: &str| {
        addresses::is_reserved_system_email(email, Some(domain))
            || addresses::RESERVED_SYSTEM_LOCAL_PARTS.contains(&local)
    };
    if !normalized.contains('@') {
        let address = format!("{normalized}@{domain}");
        if reserved(&address, &normalized) {
            return Err(invalid(
                Some(&normalized),
                &address,
                "That email address is reserved.".into(),
            ));
        }
        if !LOCAL_PART.is_match(&normalized) {
            return Err(invalid(Some(&normalized), &normalized, CHARACTERS.into()));
        }
        return Ok(Desired {
            local_part: normalized,
            normalized_email: address,
        });
    }
    if !addresses::is_zod_email(&normalized) {
        return Err(invalid(
            None,
            &normalized,
            format!("Enter a valid @{domain} email address."),
        ));
    }
    let (local, input_domain) = normalized.rsplit_once('@').unwrap_or_default();
    if input_domain != domain {
        return Err(invalid(
            Some(local),
            &normalized,
            format!("Use your @{domain} email address for Solace sign-up."),
        ));
    }
    if !LOCAL_PART.is_match(local) {
        return Err(invalid(Some(local), &normalized, CHARACTERS.into()));
    }
    if reserved(&normalized, local) {
        return Err(invalid(
            Some(local),
            &normalized,
            "That email address is reserved.".into(),
        ));
    }
    Ok(Desired {
        local_part: local.to_owned(),
        normalized_email: normalized.clone(),
    })
}

#[cfg(test)]
mod tests {
    use sea_orm::{ConnectionTrait, Statement};

    use super::*;
    use crate::config::Config;
    use crate::db::scratch::ScratchDatabase;
    use crate::integrations::storage::tests::{LocalBucket, config as bucket_config};

    const USER: &str = "account-test-user";

    fn route_user() -> RouteUser {
        RouteUser {
            id: USER.into(),
            session_id: "account-test-session".into(),
            email: "account-test@example.com".into(),
            name: "Account Test".into(),
        }
    }

    async fn state(database: &ScratchDatabase, bucket: &LocalBucket) -> AppState {
        let endpoint = bucket.start().await;
        let bucket_settings = bucket_config(&endpoint);
        let config = Config::from_lookup(|name| match name {
            "DATABASE_URL" => Some(database.url.clone()),
            "BETTER_AUTH_SECRET" => Some("solace-test-auth-secret-0123456789abcdef".into()),
            "AVATAR_BUCKET" => Some(bucket_settings.name.clone()),
            "AVATAR_BUCKET_ENDPOINT" => Some(bucket_settings.endpoint.clone()),
            "AVATAR_BUCKET_ACCESS_KEY_ID" => Some(bucket_settings.access_key_id.clone()),
            "AVATAR_BUCKET_SECRET_ACCESS_KEY" => Some(bucket_settings.secret_access_key.clone()),
            _ => None,
        })
        .unwrap();
        AppState::new(config, database.db.clone()).unwrap()
    }

    async fn users(state: &AppState) -> i64 {
        state
            .db
            .query_one_raw(Statement::from_string(
                state.db.get_database_backend(),
                format!("SELECT count(*) AS n FROM \"user\" WHERE id = '{USER}'"),
            ))
            .await
            .unwrap()
            .unwrap()
            .try_get("", "n")
            .unwrap()
    }

    #[tokio::test]
    async fn deleting_a_vanished_account_is_not_found() {
        let database = ScratchDatabase::create().await;
        let state = state(&database, &LocalBucket::default()).await;
        let error = delete(&state, &route_user()).await.unwrap_err();
        assert!(
            matches!(&error, AppError::NotFound(message) if message == "User account not found"),
            "{error:?}"
        );
    }

    #[tokio::test]
    async fn a_failed_avatar_deletion_keeps_the_account() {
        let database = ScratchDatabase::create().await;
        let bucket = LocalBucket::default();
        let state = state(&database, &bucket).await;
        state
            .db
            .execute_unprepared(&format!(
                "INSERT INTO \"user\" (id, name, email, email_verified, avatar_id, created_at, updated_at) \
                 VALUES ('{USER}', 'Account Test', 'account-test@example.com', true, 'current', now(), now())"
            ))
            .await
            .unwrap();
        bucket.seed("current");
        bucket
            .fail_deletes
            .store(true, std::sync::atomic::Ordering::SeqCst);
        assert!(delete(&state, &route_user()).await.is_err());
        assert_eq!(users(&state).await, 1);
        assert!(bucket.ids().contains("current"));
    }
}
