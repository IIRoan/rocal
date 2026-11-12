use sea_orm::ConnectionTrait;
use sea_orm_migration::prelude::*;

const DISCARD: &str = r#"
CREATE FUNCTION solace_discard_search_tokens() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.blind_index_tokens := NULL;
    RETURN NEW;
END;
$$;
CREATE TRIGGER discard_search_tokens BEFORE INSERT OR UPDATE OF blind_index_tokens ON calendar_event
FOR EACH ROW EXECUTE FUNCTION solace_discard_search_tokens();
CREATE TRIGGER discard_search_tokens BEFORE INSERT OR UPDATE OF blind_index_tokens ON calendar
FOR EACH ROW EXECUTE FUNCTION solace_discard_search_tokens();
CREATE TRIGGER discard_search_tokens BEFORE INSERT OR UPDATE OF blind_index_tokens ON event_category
FOR EACH ROW EXECUTE FUNCTION solace_discard_search_tokens();
UPDATE calendar_event SET blind_index_tokens = NULL WHERE blind_index_tokens IS NOT NULL;
UPDATE calendar SET blind_index_tokens = NULL WHERE blind_index_tokens IS NOT NULL;
UPDATE event_category SET blind_index_tokens = NULL WHERE blind_index_tokens IS NOT NULL;
"#;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // The guard is installed before clearing tokens so overlapping old API instances cannot restore them.
        manager.get_connection().execute_unprepared(DISCARD).await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    #![allow(clippy::unwrap_used)]

    use super::*;
    use crate::db::Migrator;
    use crate::db::scratch::ScratchDatabase;

    #[tokio::test]
    async fn tokens_written_after_the_original_purge_are_cleared_again() {
        let scratch = ScratchDatabase::empty().await;
        let prior = Migrator::migrations()
            .iter()
            .position(|migration| migration.name() == Migration.name())
            .unwrap();
        Migrator::up(&scratch.db, Some(prior.try_into().unwrap()))
            .await
            .unwrap();
        scratch.db.execute_unprepared(r#"
INSERT INTO "user" (id, name, email, updated_at) VALUES ('owner', 'Test', 'owner@solace.test', now());
INSERT INTO calendar (id, name, color, user_id, updated_at, blind_index_tokens)
VALUES ('calendar', '', 'blue', 'owner', now(), '["old"]');
INSERT INTO calendar_event (id, title, start, "end", calendar_id, user_id, updated_at, blind_index_tokens)
VALUES ('event', '', now(), now(), 'calendar', 'owner', now(), '["old"]');
INSERT INTO event_category (id, name, color, user_id, updated_at, blind_index_tokens)
VALUES ('category', '', 'blue', 'owner', now(), '["old"]');
"#).await.unwrap();

        crate::db::migrate(&scratch.db).await.unwrap();

        for table in ["calendar", "calendar_event", "event_category"] {
            let row = scratch
                .db
                .query_one_raw(sea_orm::Statement::from_string(
                    sea_orm::DbBackend::Postgres,
                    format!("SELECT blind_index_tokens FROM {table}"),
                ))
                .await
                .unwrap()
                .unwrap();
            assert_eq!(
                row.try_get::<Option<String>>("", "blind_index_tokens")
                    .unwrap(),
                None
            );
        }
    }
}
