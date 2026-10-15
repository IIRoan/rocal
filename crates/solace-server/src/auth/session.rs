//! Better Auth's `getSession` over the session table, without the `session_data` cookie cache.

use axum::http::HeaderMap;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, IntoActiveModel, ModelTrait, QueryFilter, Set,
};
use solace_api_types::auth::{AuthSession, AuthUser, SessionWithUser};

use super::cookies::{self, SESSION_LIFETIME_SECONDS, SESSION_UPDATE_AGE_SECONDS};
use crate::db::entities::{session, user};
use crate::instant;
use crate::state::AppState;

#[derive(Debug, Clone)]
pub struct ActiveSession {
    pub session: session::Model,
    pub user: user::Model,
}

/// The session (if any) and the Set-Cookie values the lookup produced.
pub struct Lookup {
    pub session: Option<ActiveSession>,
    pub cookies: Vec<String>,
}

/// `auth.api.getSession` as app routes and `/get-session` call it: its hooks also renew a step-up cookie bound to the session.
pub async fn lookup(state: &AppState, headers: &HeaderMap) -> Result<Lookup, sea_orm::DbErr> {
    resolve(state, headers, true).await
}

/// Better Auth's own session middleware, which runs no hooks and so leaves the step-up cookie alone.
pub async fn lookup_without_step_up(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<Lookup, sea_orm::DbErr> {
    resolve(state, headers, false).await
}

/// Reads the signed session cookie, deletes expired sessions and renews sessions older than a day.
async fn resolve(
    state: &AppState,
    headers: &HeaderMap,
    renew_step_up: bool,
) -> Result<Lookup, sea_orm::DbErr> {
    let settings = &state.cookies;
    let request_cookies = cookies::parse_cookies(headers);
    let mut set = Vec::new();
    // Rust keeps no cookie cache: a `session_data` cookie from the TypeScript backend is expired, never trusted.
    let data_name = settings.name("session_data");
    if cookies::cookie(&request_cookies, &data_name).is_some() {
        set.push(settings.expired(&data_name));
    }
    let token_name = settings.session_token();
    let Some(token) = cookies::cookie(&request_cookies, &token_name)
        .and_then(|signed| settings.verify_signed(signed))
    else {
        return Ok(Lookup {
            session: None,
            cookies: set,
        });
    };
    let found = session::Entity::find()
        .filter(session::Column::Token.eq(token.as_str()))
        .find_also_related(user::Entity)
        .one(&state.db)
        .await?;
    let now = instant::now();
    let (session, user) = match found {
        Some((session, Some(user))) if session.expires_at >= now => (session, user),
        found => {
            for name in [
                token_name.clone(),
                data_name,
                settings.name("dont_remember"),
            ] {
                let expired = settings.expired(&name);
                if !set.contains(&expired) {
                    set.push(expired);
                }
            }
            if let Some((session, _)) = found {
                session.delete(&state.db).await?;
            }
            return Ok(Lookup {
                session: None,
                cookies: set,
            });
        }
    };
    let remember = cookies::cookie(&request_cookies, &settings.name("dont_remember"))
        .and_then(|signed| settings.verify_signed(signed))
        .is_none();
    let issued = session.expires_at - instant::seconds(SESSION_LIFETIME_SECONDS);
    let session = if remember && issued + instant::seconds(SESSION_UPDATE_AGE_SECONDS) <= now {
        let mut active = session.into_active_model();
        active.expires_at = Set(now + instant::seconds(SESSION_LIFETIME_SECONDS));
        active.updated_at = Set(now);
        let renewed = active.update(&state.db).await?;
        set.push(settings.signed(&token_name, &renewed.token, Some(SESSION_LIFETIME_SECONDS)));
        renewed
    } else {
        session
    };
    if renew_step_up && let Some(raw) = cookies::cookie(&request_cookies, settings.step_up_name()) {
        let now_seconds = instant::unix_seconds(now);
        if let Some(payload) = settings.verified_step_up(raw, &user.id, &session.id, now_seconds)
            && payload.e - SESSION_LIFETIME_SECONDS + SESSION_UPDATE_AGE_SECONDS <= now_seconds
        {
            set.push(settings.step_up(&user.id, &session.id, now_seconds));
        }
    }
    Ok(Lookup {
        session: Some(ActiveSession { session, user }),
        cookies: set,
    })
}

pub fn user_dto(user: &user::Model) -> AuthUser {
    AuthUser {
        id: user.id.clone().into(),
        name: user.name.clone(),
        email: user.email.clone(),
        email_verified: user.email_verified,
        image: user.image.clone(),
        created_at: instant::iso(user.created_at),
        updated_at: instant::iso(user.updated_at),
    }
}

pub fn session_dto(active: &ActiveSession) -> SessionWithUser {
    let session = &active.session;
    SessionWithUser {
        session: AuthSession {
            id: session.id.clone().into(),
            token: session.token.clone(),
            user_id: session.user_id.clone().into(),
            expires_at: instant::iso(session.expires_at),
            created_at: instant::iso(session.created_at),
            updated_at: instant::iso(session.updated_at),
            ip_address: None,
            user_agent: None,
        },
        user: user_dto(&active.user),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;
    use axum::http::header;

    #[tokio::test]
    async fn a_failed_session_lookup_is_an_error_without_cookie_clears() {
        let config = Config::from_lookup(|name| match name {
            "DATABASE_URL" => Some("postgres://solace_test:x@127.0.0.1:1/solace_test".into()),
            "BETTER_AUTH_SECRET" => Some("solace-test-auth-secret-0123456789abcdef".into()),
            _ => None,
        })
        .unwrap();
        let pool = sea_orm::sqlx::postgres::PgPoolOptions::new()
            .acquire_timeout(std::time::Duration::from_millis(200))
            .connect_lazy(&config.database_url)
            .unwrap();
        let db = sea_orm::SqlxPostgresConnector::from_sqlx_postgres_pool(pool);
        let state = AppState::new(config, db).unwrap();
        let signed = state
            .cookies
            .signed(&state.cookies.session_token(), "token", None);
        let value = signed.split(';').next().unwrap();
        let mut headers = HeaderMap::new();
        headers.insert(header::COOKIE, value.parse().unwrap());
        assert!(
            lookup(&state, &headers).await.is_err(),
            "an unavailable database is an error, not a missing session"
        );
    }
}
