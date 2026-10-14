//! Better Auth's internal adapter over the existing tables: users, credential accounts and sessions.

use sea_orm::{
    ActiveModelTrait, ColumnTrait, ConnectionTrait, EntityTrait, QueryFilter, QueryOrder, Set,
};

use super::api::generate_id;
use super::cookies::SESSION_LIFETIME_SECONDS;
use crate::db::entities::{account, session, user, verification};
use crate::instant;

/// A session that is not remembered lasts a day, as Better Auth's `createSession(..., dontRememberMe)` does.
const DONT_REMEMBER_SECONDS: i64 = 24 * 60 * 60;

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

pub async fn create_user<C: ConnectionTrait>(
    db: &C,
    email: &str,
    name: &str,
    image: Option<String>,
) -> Result<user::Model, sea_orm::DbErr> {
    let now = instant::now();
    user::ActiveModel {
        id: Set(generate_id()),
        name: Set(name.to_owned()),
        email: Set(email.to_owned()),
        email_verified: Set(false),
        image: Set(image),
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
