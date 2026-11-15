//! Recovery kits: the account keys wrapped under a key only the user holds, and a SHA-256 of the HKDF half that proves it.

use sea_orm::sea_query::OnConflict;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseConnection, EntityTrait,
    IntoActiveModel, QueryFilter, QuerySelect, Set, TransactionTrait,
};
use sha2::{Digest, Sha256};
use solace_api_types::SuccessMessage;
use solace_api_types::auth::RecoveryEnvelope;
use solace_api_types::e2ee::{RecoveryKitRequest, RecoveryKitStatus};
use subtle::ConstantTimeEq;

use super::service::{self, PasswordKeys};
use crate::auth::guard::RouteUser;
use crate::auth::password::{self, Verdict};
use crate::auth::store;
use crate::db::entities::{passkey, user, user_recovery_kit};
use crate::email;
use crate::error::AppError;
use crate::instant;
use crate::state::AppState;

const AUTH_KEY_PREFIX: &str = "rk1:";
const AUTH_KEY_CHARS: usize = 43;

/// `rk1:` and 32 base64url bytes, as `deriveRecoveryAuthKey` in `@workspace/e2ee` writes it.
fn is_auth_key(value: &str) -> bool {
    value.strip_prefix(AUTH_KEY_PREFIX).is_some_and(|key| {
        key.len() == AUTH_KEY_CHARS
            && key
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    })
}

fn auth_key_hash(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}

/// Constant time, and an absent kit still costs a comparison, so the answer never says which part was wrong.
fn kit_matches(kit: Option<&user_recovery_kit::Model>, presented: &str) -> bool {
    let expected = kit.map_or_else(|| "0".repeat(64), |kit| kit.auth_key_hash.clone());
    let matches: bool = expected.as_bytes().ct_eq(presented.as_bytes()).into();
    matches && kit.is_some()
}

async fn kit<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Option<user_recovery_kit::Model>, sea_orm::DbErr> {
    user_recovery_kit::Entity::find_by_id(user_id).one(db).await
}

fn status_of(kit: Option<&user_recovery_kit::Model>) -> RecoveryKitStatus {
    RecoveryKitStatus {
        exists: kit.is_some(),
        created_at: kit.map(|kit| instant::iso(kit.created_at)),
    }
}

async fn notify(state: &AppState, to: &str, message: email::Message) {
    let _ = email::send(
        state,
        "recovery kit notification",
        to,
        &message,
        email::Mode::BestEffort,
    )
    .await;
}

pub async fn status(state: &AppState, user: &RouteUser) -> Result<RecoveryKitStatus, AppError> {
    Ok(status_of(kit(&state.db, &user.id).await?.as_ref()))
}

/// Replaces any earlier kit, which stops opening; the current password proves the caller is the owner, not just a session.
pub async fn store(
    state: &AppState,
    user: &RouteUser,
    request: RecoveryKitRequest,
) -> Result<RecoveryKitStatus, AppError> {
    if !is_auth_key(&request.recovery_auth_key) {
        return Err(AppError::field(
            "Recovery key is malformed",
            "recoveryAuthKey",
        ));
    }
    let wrapped = service::wrapped_keys(
        &request.wrapped_account_key,
        &request.wrapped_search_key,
        request.key_version,
    )?;
    let stored = store::credential_account(&state.db, &user.id)
        .await?
        .and_then(|account| account.password);
    let verdict = match stored {
        Some(stored) => password::verify(&stored, &request.current_password, &user.email)
            .await
            .map_err(AppError::internal)?,
        None => Verdict::Mismatch,
    };
    match verdict {
        Verdict::Match { .. } => {}
        Verdict::Mismatch => {
            return Err(AppError::field("Incorrect password", "currentPassword"));
        }
        Verdict::UpgradeRequired => {
            return Err(AppError::field(
                "Sign out and sign in again, then create your recovery kit",
                "currentPassword",
            ));
        }
    }
    let kit = upsert(&state.db, &user.id, &request.recovery_auth_key, wrapped).await?;
    tracing::info!("Recovery kit stored");
    notify(
        state,
        &user.email,
        email::recovery_kit_changed(
            &email::greeting(&user.name),
            true,
            &email::sign_in_url(state),
        ),
    )
    .await;
    Ok(status_of(Some(&kit)))
}

async fn upsert(
    db: &DatabaseConnection,
    user_id: &str,
    recovery_auth_key: &str,
    (wrapped_account_key, wrapped_search_key, key_version): (String, String, i32),
) -> Result<user_recovery_kit::Model, sea_orm::DbErr> {
    use user_recovery_kit::Column;
    user_recovery_kit::Entity::insert(user_recovery_kit::ActiveModel {
        user_id: Set(user_id.to_owned()),
        auth_key_hash: Set(auth_key_hash(recovery_auth_key)),
        wrapped_account_key: Set(wrapped_account_key),
        wrapped_search_key: Set(wrapped_search_key),
        key_version: Set(key_version),
        created_at: Set(instant::now()),
    })
    .on_conflict(
        OnConflict::column(Column::UserId)
            .update_columns([
                Column::AuthKeyHash,
                Column::WrappedAccountKey,
                Column::WrappedSearchKey,
                Column::KeyVersion,
                Column::CreatedAt,
            ])
            .to_owned(),
    )
    .exec_with_returning(db)
    .await
}

pub async fn remove(state: &AppState, user: &RouteUser) -> Result<SuccessMessage, AppError> {
    let deleted = user_recovery_kit::Entity::delete_by_id(&user.id)
        .exec(&state.db)
        .await?
        .rows_affected;
    if deleted == 0 {
        return Err(AppError::NotFound("Recovery kit not found".into()));
    }
    tracing::info!("Recovery kit removed");
    notify(
        state,
        &user.email,
        email::recovery_kit_changed(
            &email::greeting(&user.name),
            false,
            &email::sign_in_url(state),
        ),
    )
    .await;
    Ok(SuccessMessage {
        success: true,
        message: "Recovery kit removed".into(),
    })
}

/// The user and kit behind an email and recovery key, or `None` for an unknown email, no kit or a wrong key alike.
async fn verified<C: ConnectionTrait>(
    db: &C,
    email: &str,
    recovery_auth_key: &str,
    lock: bool,
) -> Result<Option<(user::Model, user_recovery_kit::Model)>, sea_orm::DbErr> {
    let presented = auth_key_hash(recovery_auth_key);
    let user = store::find_user_by_email(db, &email.trim().to_lowercase()).await?;
    let kit = match &user {
        Some(user) if lock => {
            user_recovery_kit::Entity::find_by_id(&user.id)
                .lock_exclusive()
                .one(db)
                .await?
        }
        Some(user) => self::kit(db, &user.id).await?,
        None => None,
    };
    let valid = is_auth_key(recovery_auth_key) && kit_matches(kit.as_ref(), &presented);
    Ok(user.zip(kit).filter(|_| valid))
}

pub async fn start(
    db: &DatabaseConnection,
    email: &str,
    recovery_auth_key: &str,
) -> Result<Option<RecoveryEnvelope>, sea_orm::DbErr> {
    Ok(verified(db, email, recovery_auth_key, false)
        .await?
        .map(|(_, kit)| RecoveryEnvelope {
            wrapped_account_key: kit.wrapped_account_key,
            wrapped_search_key: kit.wrapped_search_key,
            key_version: kit.key_version,
        }))
}

/// The account an email and recovery key prove, checked again under a row lock by `complete`.
pub async fn verified_user(
    db: &DatabaseConnection,
    email: &str,
    recovery_auth_key: &str,
) -> Result<Option<user::Model>, sea_orm::DbErr> {
    Ok(verified(db, email, recovery_auth_key, false)
        .await?
        .map(|(user, _)| user))
}

/// What a verified recovery stores in one transaction.
pub struct Reset {
    pub password_hash: String,
    pub envelope: PasswordKeys,
    pub remove_passkeys: bool,
}

pub enum Completed {
    Done(user::Model),
    InvalidKit,
    NoCredential,
}

/// New auth key and envelope, every session ended, the kit consumed and optionally the passkeys gone, all or nothing.
pub async fn complete(
    db: &DatabaseConnection,
    email: &str,
    recovery_auth_key: &str,
    reset: Reset,
) -> Result<Completed, sea_orm::DbErr> {
    let transaction = db.begin().await?;
    let Some((user, kit)) = verified(&transaction, email, recovery_auth_key, true).await? else {
        return Ok(Completed::InvalidKit);
    };
    let Some(credential) = store::credential_account(&transaction, &user.id).await? else {
        return Ok(Completed::NoCredential);
    };
    store::set_password(&transaction, credential, reset.password_hash).await?;
    service::store_password_keys(&transaction, &user.id, reset.envelope).await?;
    store::delete_user_sessions(&transaction, &user.id).await?;
    kit.into_active_model().delete(&transaction).await?;
    if reset.remove_passkeys {
        passkey::Entity::delete_many()
            .filter(passkey::Column::UserId.eq(&user.id))
            .exec(&transaction)
            .await?;
    }
    transaction.commit().await?;
    tracing::info!(
        passkeys_removed = reset.remove_passkeys,
        "Account recovered with a recovery kit"
    );
    Ok(Completed::Done(user))
}

/// After a recovery commits: tells the owner, from whom an attacker holding the kit cannot hide it.
pub async fn notify_recovered(state: &AppState, user: &user::Model) {
    notify(
        state,
        &user.email,
        email::account_recovered(&email::greeting(&user.name), &email::sign_in_url(state)),
    )
    .await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_rk1_shape_counts_as_a_recovery_auth_key() {
        let key = format!("rk1:{}", "A".repeat(43));
        assert!(is_auth_key(&key));
        assert!(!is_auth_key(&format!("rk1:{}", "A".repeat(42))));
        assert!(!is_auth_key(&format!("ak1:{}", "A".repeat(43))));
        assert!(!is_auth_key(&format!("rk1:{}+", "A".repeat(42))));
    }

    #[test]
    fn a_missing_kit_never_matches_even_the_placeholder_hash() {
        assert!(!kit_matches(None, &"0".repeat(64)));
        let kit = user_recovery_kit::Model {
            user_id: "u".into(),
            auth_key_hash: auth_key_hash("rk1:x"),
            wrapped_account_key: String::new(),
            wrapped_search_key: String::new(),
            key_version: 1,
            created_at: instant::now(),
        };
        assert!(kit_matches(Some(&kit), &auth_key_hash("rk1:x")));
        assert!(!kit_matches(Some(&kit), &auth_key_hash("rk1:y")));
    }
}
