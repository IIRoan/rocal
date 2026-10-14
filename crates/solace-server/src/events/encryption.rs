//! `lib/event-encryption.ts`: ciphertext replaces plaintext event content, and backfills drop plaintext left beside ciphertext.

use sea_orm::sea_query::Expr;
use sea_orm::{ColumnTrait, ConnectionTrait, EntityTrait, QueryFilter};

use crate::db::entities::calendar_event;
use crate::http::zod::js_trim;

/// The content columns an event write stores.
#[derive(Debug, PartialEq, Eq)]
pub struct PersistencePolicy {
    pub encryption_state: &'static str,
    pub title: String,
    pub description: Option<String>,
    pub location: Option<String>,
}

fn normalize_optional_text(value: Option<&str>) -> Option<String> {
    value
        .map(js_trim)
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
}

/// `resolveEventPersistencePolicy`: encrypted events keep no plaintext; plaintext is trimmed and blanks become null.
pub fn resolve_persistence_policy(
    has_encrypted_payload: bool,
    title: &str,
    description: Option<&str>,
    location: Option<&str>,
) -> PersistencePolicy {
    if has_encrypted_payload {
        return PersistencePolicy {
            encryption_state: "encrypted",
            title: String::new(),
            description: None,
            location: None,
        };
    }
    PersistencePolicy {
        encryption_state: "plaintext",
        title: js_trim(title).to_owned(),
        description: normalize_optional_text(description),
        location: normalize_optional_text(location),
    }
}

pub fn is_fully_encrypted(encryption_state: Option<&str>) -> bool {
    encryption_state == Some("encrypted")
}

/// The distinct, non-empty calendar ids a backfill covers, in order.
fn target_calendar_ids(calendar_ids: &[&str]) -> Vec<String> {
    let mut targets: Vec<String> = Vec::new();
    for id in calendar_ids.iter().filter(|id| !id.is_empty()) {
        if !targets.iter().any(|target| target == id) {
            targets.push((*id).to_owned());
        }
    }
    targets
}

/// `backfillEncryptedEventsToCiphertextOnly`: events with ciphertext that still carry plaintext lose it.
pub async fn backfill_ciphertext_only<C: ConnectionTrait>(
    db: &C,
    user_id: &str,
    calendar_ids: &[&str],
    now: time::PrimitiveDateTime,
) -> Result<u64, sea_orm::DbErr> {
    let targets = target_calendar_ids(calendar_ids);
    if targets.is_empty() {
        return Ok(0);
    }
    let result = calendar_event::Entity::update_many()
        .col_expr(calendar_event::Column::Title, Expr::value(""))
        .col_expr(
            calendar_event::Column::Description,
            Expr::value(Option::<String>::None),
        )
        .col_expr(
            calendar_event::Column::Location,
            Expr::value(Option::<String>::None),
        )
        .col_expr(
            calendar_event::Column::EncryptionState,
            Expr::value("encrypted"),
        )
        .col_expr(calendar_event::Column::UpdatedAt, Expr::value(now))
        .filter(calendar_event::Column::UserId.eq(user_id))
        .filter(calendar_event::Column::CalendarId.is_in(targets))
        .filter(calendar_event::Column::EncryptedContent.is_not_null())
        .filter(calendar_event::Column::EncryptionState.ne("encrypted"))
        .exec(db)
        .await?;
    Ok(result.rows_affected)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plaintext_policy_trims_and_nulls_blank_fields() {
        assert_eq!(
            resolve_persistence_policy(false, "  Standup  ", Some("   "), Some(" Room 1 ")),
            PersistencePolicy {
                encryption_state: "plaintext",
                title: "Standup".into(),
                description: None,
                location: Some("Room 1".into()),
            }
        );
        assert_eq!(
            resolve_persistence_policy(true, "Standup", Some("Notes"), Some("Room 1")),
            PersistencePolicy {
                encryption_state: "encrypted",
                title: String::new(),
                description: None,
                location: None,
            }
        );
    }

    #[test]
    fn only_encrypted_state_counts_as_fully_encrypted() {
        assert!(is_fully_encrypted(Some("encrypted")));
        for state in [Some("plaintext"), Some("shadow_write"), None] {
            assert!(!is_fully_encrypted(state), "{state:?}");
        }
    }

    #[tokio::test]
    async fn backfill_without_calendars_changes_nothing() {
        let pool = sea_orm::sqlx::postgres::PgPoolOptions::new()
            .connect_lazy("postgres://solace_test:x@127.0.0.1:1/solace_test")
            .unwrap();
        let db = sea_orm::SqlxPostgresConnector::from_sqlx_postgres_pool(pool);
        let changed = backfill_ciphertext_only(&db, "user", &["", ""], crate::instant::now())
            .await
            .unwrap();
        assert_eq!(
            changed, 0,
            "no query runs, so the closed port is never reached"
        );
    }

    #[test]
    fn backfill_dedupes_calendar_ids() {
        assert_eq!(
            target_calendar_ids(&["a", "b", "a", "", "c", "b"]),
            ["a", "b", "c"]
        );
    }
}
