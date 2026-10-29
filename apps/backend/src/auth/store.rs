//! Better Auth's internal adapter over the existing tables: users, credential accounts, sessions, verifications and passkeys.

use sea_orm::sea_query::Expr;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, DatabaseConnection, EntityTrait,
    IntoActiveModel, ModelTrait, QueryFilter, QueryOrder, Set, TransactionTrait,
};

use super::api::generate_id;
use super::cookies::SESSION_LIFETIME_SECONDS;
use crate::db::entities::{account, passkey, session, user, verification};
use crate::e2ee;
use crate::e2ee::service::PasswordKeys;
use crate::instant;

/// A session that is not remembered lasts a day, as Better Auth's `createSession(..., dontRememberMe)` does.
const DONT_REMEMBER_SECONDS: i64 = 24 * 60 * 60;

pub async fn find_user<C: ConnectionTrait>(
    db: &C,
    id: &str,
) -> Result<Option<user::Model>, sea_orm::DbErr> {
    user::Entity::find_by_id(id).one(db).await
}

/// `updateUser` without an image, which goes through `profiles::avatars`.
pub async fn update_user<C: ConnectionTrait>(
    db: &C,
    found: user::Model,
    name: Option<String>,
) -> Result<user::Model, sea_orm::DbErr> {
    let mut updated = found.into_active_model();
    if let Some(name) = name {
        updated.name = Set(name);
    }
    updated.update(db).await
}

pub async fn set_password<C: ConnectionTrait>(
    db: &C,
    credential: account::Model,
    hash: String,
) -> Result<(), sea_orm::DbErr> {
    let mut updated = credential.into_active_model();
    updated.password = Set(Some(hash));
    updated.update(db).await.map(|_| ())
}

/// The new hash and, when the client sent one, the envelope wrapped with the new password, both or neither.
pub async fn change_password(
    db: &DatabaseConnection,
    credential: account::Model,
    hash: String,
    envelope: Option<PasswordKeys>,
) -> Result<(), sea_orm::DbErr> {
    let user_id = credential.user_id.clone();
    let transaction = db.begin().await?;
    set_password(&transaction, credential, hash).await?;
    if let Some(keys) = envelope {
        e2ee::service::store_password_keys(&transaction, &user_id, keys).await?;
    }
    transaction.commit().await
}

/// Replaces `legacy` only while it is still stored, so a password changed since it was read is never undone.
pub async fn upgrade_password<C: ConnectionTrait>(
    db: &C,
    account_id: &str,
    legacy: &str,
    hash: String,
) -> Result<(), sea_orm::DbErr> {
    account::Entity::update_many()
        .col_expr(account::Column::Password, Expr::value(hash))
        .col_expr(account::Column::UpdatedAt, Expr::value(instant::now()))
        .filter(account::Column::Id.eq(account_id))
        .filter(account::Column::Password.eq(legacy))
        .exec(db)
        .await
        .map(|_| ())
}

pub async fn find_user_by_email<C: ConnectionTrait>(
    db: &C,
    email: &str,
) -> Result<Option<user::Model>, sea_orm::DbErr> {
    user::Entity::find()
        .filter(user::Column::Email.eq(email))
        .one(db)
        .await
}

/// The `credential` account whose `account_id` is the user id, where the password hash lives.
pub async fn credential_account<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Option<account::Model>, sea_orm::DbErr> {
    account::Entity::find()
        .filter(account::Column::UserId.eq(user_id))
        .filter(account::Column::ProviderId.eq("credential"))
        .filter(account::Column::AccountId.eq(user_id))
        .one(db)
        .await
}

pub async fn accounts<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Vec<account::Model>, sea_orm::DbErr> {
    account::Entity::find()
        .filter(account::Column::UserId.eq(user_id))
        .order_by_asc(account::Column::CreatedAt)
        .all(db)
        .await
}

pub async fn create_user<C: ConnectionTrait>(
    db: &C,
    email: &str,
    name: &str,
) -> Result<user::Model, sea_orm::DbErr> {
    let now = instant::now();
    user::ActiveModel {
        id: Set(generate_id()),
        name: Set(name.to_owned()),
        email: Set(email.to_owned()),
        email_verified: Set(false),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(db)
    .await
}

pub async fn link_credential<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    password_hash: &str,
) -> Result<account::Model, sea_orm::DbErr> {
    let now = instant::now();
    account::ActiveModel {
        id: Set(generate_id()),
        account_id: Set(user_id.to_owned()),
        provider_id: Set("credential".into()),
        user_id: Set(user_id.to_owned()),
        password: Set(Some(password_hash.to_owned())),
        created_at: Set(now),
        updated_at: Set(now),
        ..Default::default()
    }
    .insert(db)
    .await
}

/// A new session; the client IP and user agent are never stored (`stripSessionClientMetadata`).
pub async fn create_session<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    dont_remember: bool,
) -> Result<session::Model, sea_orm::DbErr> {
    let now = instant::now();
    let lifetime = if dont_remember {
        DONT_REMEMBER_SECONDS
    } else {
        SESSION_LIFETIME_SECONDS
    };
    session::ActiveModel {
        id: Set(generate_id()),
        token: Set(generate_id()),
        user_id: Set(user_id.to_owned()),
        expires_at: Set(now + instant::seconds(lifetime)),
        created_at: Set(now),
        updated_at: Set(now),
        ip_address: Set(None),
        user_agent: Set(None),
    }
    .insert(db)
    .await
}

/// `findSession`: the session row and its user, expired or not.
pub async fn find_session_with_user<C: ConnectionTrait>(
    db: &C,
    token: &str,
) -> Result<Option<(session::Model, Option<user::Model>)>, sea_orm::DbErr> {
    session::Entity::find()
        .filter(session::Column::Token.eq(token))
        .find_also_related(user::Entity)
        .one(db)
        .await
}

pub async fn find_session<C: ConnectionTrait>(
    db: &C,
    token: &str,
) -> Result<Option<session::Model>, sea_orm::DbErr> {
    session::Entity::find()
        .filter(session::Column::Token.eq(token))
        .one(db)
        .await
}

pub async fn delete_session<C: ConnectionTrait>(db: &C, token: &str) -> Result<(), sea_orm::DbErr> {
    session::Entity::delete_many()
        .filter(session::Column::Token.eq(token))
        .exec(db)
        .await
        .map(|_| ())
}

pub async fn delete_user_sessions<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<(), sea_orm::DbErr> {
    session::Entity::delete_many()
        .filter(session::Column::UserId.eq(user_id))
        .exec(db)
        .await
        .map(|_| ())
}

/// The user's sessions that have not expired.
pub async fn active_sessions<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Vec<session::Model>, sea_orm::DbErr> {
    let now = instant::now();
    Ok(session::Entity::find()
        .filter(session::Column::UserId.eq(user_id))
        .order_by_asc(session::Column::CreatedAt)
        .all(db)
        .await?
        .into_iter()
        .filter(|session| session.expires_at > now)
        .collect())
}

pub async fn create_verification<C: ConnectionTrait>(
    db: &C,
    identifier: &str,
    value: String,
    lifetime_seconds: i64,
) -> Result<(), sea_orm::DbErr> {
    let now = instant::now();
    verification::ActiveModel {
        id: Set(generate_id()),
        identifier: Set(identifier.to_owned()),
        value: Set(value),
        expires_at: Set(now + instant::seconds(lifetime_seconds)),
        created_at: Set(Some(now)),
        updated_at: Set(Some(now)),
    }
    .insert(db)
    .await
    .map(|_| ())
}

/// `consumeVerificationValue`: one DELETE takes every row for the identifier, so concurrent requests consume it once.
pub async fn consume_verification<C: ConnectionTrait>(
    db: &C,
    identifier: &str,
) -> Result<Option<verification::Model>, sea_orm::DbErr> {
    let rows = verification::Entity::delete_many()
        .filter(verification::Column::Identifier.eq(identifier))
        .exec_with_returning(db)
        .await?;
    let now = instant::now();
    Ok(rows
        .into_iter()
        .max_by_key(|row| row.created_at)
        .filter(|row| row.expires_at >= now))
}

pub async fn user_passkeys<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
) -> Result<Vec<passkey::Model>, sea_orm::DbErr> {
    passkey::Entity::find()
        .filter(passkey::Column::UserId.eq(user_id))
        .order_by_asc(passkey::Column::CreatedAt)
        .all(db)
        .await
}

pub async fn passkey_by_id<C: ConnectionTrait>(
    db: &C,
    id: &str,
) -> Result<Option<passkey::Model>, sea_orm::DbErr> {
    passkey::Entity::find_by_id(id).one(db).await
}

/// The passkey a WebAuthn assertion names, with its owner.
pub async fn passkey_by_credential<C: ConnectionTrait>(
    db: &C,
    credential_id: &str,
) -> Result<Option<(passkey::Model, Option<user::Model>)>, sea_orm::DbErr> {
    passkey::Entity::find()
        .filter(passkey::Column::CredentialId.eq(credential_id))
        .find_also_related(user::Entity)
        .one(db)
        .await
}

pub async fn insert_passkey<C: ConnectionTrait>(
    db: &C,
    row: passkey::ActiveModel,
) -> Result<passkey::Model, sea_orm::DbErr> {
    row.insert(db).await
}

pub async fn set_passkey_counter<C: ConnectionTrait>(
    db: &C,
    row: passkey::Model,
    counter: i32,
) -> Result<(), sea_orm::DbErr> {
    let mut stored = row.into_active_model();
    stored.counter = Set(counter);
    stored.update(db).await.map(|_| ())
}

pub async fn rename_passkey<C: ConnectionTrait>(
    db: &C,
    row: passkey::Model,
    name: String,
) -> Result<passkey::Model, sea_orm::DbErr> {
    let mut renamed = row.into_active_model();
    renamed.name = Set(Some(name));
    renamed.update(db).await
}

pub async fn delete_passkey<C: ConnectionTrait>(
    db: &C,
    row: passkey::Model,
) -> Result<(), sea_orm::DbErr> {
    row.delete(db).await.map(|_| ())
}
