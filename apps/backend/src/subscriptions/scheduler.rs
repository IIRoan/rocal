//! `CalendarSyncService`: due feeds sync 5 seconds after boot and then every 15 minutes, one feed at a time and never two runs at once.

use std::future::Future;
use std::time::Duration;

use tokio::task::JoinHandle;
use tokio::time::Instant;

use super::{queries, service};
use crate::instant;
use crate::state::AppState;
use crate::telemetry::redact_pii;

const FIRST_RUN: Duration = Duration::from_secs(5);
const PERIOD: Duration = Duration::from_secs(15 * 60);
/// Feeds synced within this window are not due, whatever their own interval.
const DUE_AFTER_MINUTES: i64 = 15;
/// A pause after every five feeds, to be gentle on calendar servers.
const BATCH_SIZE: usize = 5;
const BATCH_PAUSE: Duration = Duration::from_secs(1);
const KEPT_SYNC_LOGS: u32 = 50;

/// Starts the background sync; aborting the handle stops it.
pub fn start(state: AppState) -> JoinHandle<()> {
    tokio::spawn(every(FIRST_RUN, PERIOD, move || {
        let state = state.clone();
        async move { sync_due(&state).await }
    }))
}

/// Runs `run` after `first`, then at every `period` from the start; a tick that comes due during a run is skipped.
async fn every<F, R>(first: Duration, period: Duration, mut run: F)
where
    F: FnMut() -> R,
    R: Future<Output = ()>,
{
    let start = Instant::now();
    tokio::time::sleep(first).await;
    run().await;
    let mut next = start + period;
    loop {
        while next <= Instant::now() {
            tracing::warn!("Skipping scheduled sync because a previous sync is still running");
            next += period;
        }
        tokio::time::sleep_until(next).await;
        run().await;
        next += period;
    }
}

/// `syncAllActiveSubscriptions`: syncs every due feed whose own interval has passed, then keeps each feed's 50 newest sync logs; failures are logged, never raised.
pub async fn sync_due(state: &AppState) {
    let synced_before = instant::now() - instant::seconds(DUE_AFTER_MINUTES * 60);
    let feeds = match queries::due(&state.db, synced_before).await {
        Ok(feeds) => feeds,
        Err(error) => {
            tracing::error!(
                message = redact_pii(&error.to_string()),
                "Error during scheduled sync"
            );
            return;
        }
    };
    for (index, batch) in feeds.chunks(BATCH_SIZE).enumerate() {
        if index > 0 {
            tokio::time::sleep(BATCH_PAUSE).await;
        }
        for feed in batch {
            let interval_ms = i64::from(feed.sync_interval_minutes) * 60_000;
            let recent = feed.last_sync_at.is_some_and(|at| {
                instant::unix_millis(instant::now()) - instant::unix_millis(at) < interval_ms
            });
            if recent {
                continue;
            }
            if let Err(error) = service::sync_feed(state, feed).await {
                tracing::error!(
                    subscription_id = %feed.id,
                    message = redact_pii(&error.to_string()),
                    "Failed to sync subscription"
                );
            }
        }
    }
    if let Err(error) = queries::trim_sync_logs(&state.db, KEPT_SYNC_LOGS).await {
        tracing::error!(
            message = redact_pii(&error.to_string()),
            "Error cleaning up sync logs"
        );
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    use sea_orm::EntityTrait;

    use super::*;
    use crate::db::entities::calendar_sync_log;
    use crate::subscriptions::service::tests::{Fixture, fixture};

    /// Gives a feed `count` old success logs, a minute apart.
    async fn old_logs(fixture: &Fixture, subscription_id: &str, count: u32) {
        fixture
            .sql(&format!(
                "INSERT INTO calendar_sync_log (id, subscription_id, status, started_at) \
                 SELECT 'old-log-' || g, '{subscription_id}', 'success', now() - make_interval(mins => g) \
                 FROM generate_series(1, {count}) AS g"
            ))
            .await;
    }

    fn statuses(logs: &[(String, Option<String>)]) -> Vec<&str> {
        logs.iter().map(|(status, _)| status.as_str()).collect()
    }

    #[tokio::test(start_paused = true)]
    async fn starts_once_with_an_initial_and_an_interval_sync() {
        let runs = Arc::new(AtomicUsize::new(0));
        let counted = runs.clone();
        let scheduler = tokio::spawn(every(FIRST_RUN, PERIOD, move || {
            counted.fetch_add(1, Ordering::SeqCst);
            async {}
        }));
        tokio::time::sleep(Duration::from_millis(4999)).await;
        assert_eq!(runs.load(Ordering::SeqCst), 0);
        tokio::time::sleep(Duration::from_millis(2)).await;
        assert_eq!(runs.load(Ordering::SeqCst), 1);
        tokio::time::sleep(PERIOD - FIRST_RUN).await;
        assert_eq!(runs.load(Ordering::SeqCst), 2);
        tokio::time::sleep(PERIOD).await;
        assert_eq!(runs.load(Ordering::SeqCst), 3);
        scheduler.abort();
    }

    #[tokio::test]
    async fn timer_driven_failures_are_logged_not_raised() {
        let fixture = fixture().await;
        fixture
            .sql("ALTER TABLE calendar_subscription RENAME TO calendar_subscription_gone")
            .await;
        let runs = Arc::new(AtomicUsize::new(0));
        let (counted, state) = (runs.clone(), fixture.state.clone());
        let scheduler = tokio::spawn(every(
            Duration::from_millis(10),
            Duration::from_millis(40),
            move || {
                counted.fetch_add(1, Ordering::SeqCst);
                let state = state.clone();
                async move { sync_due(&state).await }
            },
        ));
        tokio::time::sleep(Duration::from_millis(400)).await;
        assert!(runs.load(Ordering::SeqCst) >= 3);
        assert!(!scheduler.is_finished(), "a failed run stops nothing");
        scheduler.abort();
    }

    #[tokio::test]
    async fn syncs_due_feeds_skips_recent_ones_and_keeps_fifty_logs() {
        let fixture = fixture().await;
        let due = fixture.feed("/feed.ics", None, 15).await;
        let stale = fixture.feed("/feed.ics", Some(20), 15).await;
        let recent = fixture.feed("/feed.ics", Some(20), 60).await;
        let paused = fixture.feed("/feed.ics", None, 15).await;
        fixture
            .sql(&format!(
                "UPDATE calendar_subscription SET is_active = false WHERE id = '{}'",
                paused.id
            ))
            .await;
        old_logs(&fixture, &recent.id, 55).await;

        sync_due(&fixture.state).await;

        assert_eq!(statuses(&fixture.logs(&due.id).await), ["success"]);
        assert_eq!(statuses(&fixture.logs(&stale.id).await), ["success"]);
        assert!(fixture.logs(&paused.id).await.is_empty());
        let kept = fixture.logs(&recent.id).await;
        assert_eq!(kept.len(), 50, "the recent feed is skipped and trimmed");
        let oldest: Vec<_> = (51..=55).map(|g| format!("old-log-{g}")).collect();
        let remaining = calendar_sync_log::Entity::find()
            .all(&fixture.state.db)
            .await
            .unwrap();
        assert!(remaining.iter().all(|log| !oldest.contains(&log.id)));
    }

    #[tokio::test]
    async fn continues_across_failed_batches_and_pauses_between_them() {
        let fixture = fixture().await;
        let mut feeds = Vec::new();
        for index in 0..6 {
            let path = if index == 2 {
                "/missing.ics"
            } else {
                "/feed.ics"
            };
            feeds.push(fixture.feed(path, None, 15).await);
        }
        let started = std::time::Instant::now();
        sync_due(&fixture.state).await;
        assert!(started.elapsed() >= BATCH_PAUSE, "a pause after five feeds");
        let mut failed = 0;
        for feed in &feeds {
            let logs = fixture.logs(&feed.id).await;
            assert_eq!(logs.len(), 1, "every feed is attempted");
            failed += usize::from(logs[0].0 == "error");
        }
        assert_eq!(failed, 1);
        assert_eq!(
            fixture.feed_state(&feeds[2].id).await.1.as_deref(),
            Some("HTTP 404: Not Found")
        );
    }

    #[tokio::test]
    async fn due_feed_query_failures_are_logged_not_raised() {
        let fixture = fixture().await;
        let feed = fixture.feed("/feed.ics", None, 15).await;
        old_logs(&fixture, &feed.id, 55).await;
        fixture
            .sql("ALTER TABLE calendar_subscription RENAME TO calendar_subscription_gone")
            .await;
        sync_due(&fixture.state).await;
        fixture
            .sql("ALTER TABLE calendar_subscription_gone RENAME TO calendar_subscription")
            .await;
        assert_eq!(
            fixture.logs(&feed.id).await.len(),
            55,
            "nothing synced or trimmed"
        );
    }

    #[tokio::test]
    async fn sync_log_cleanup_failures_are_logged_not_raised() {
        let fixture = fixture().await;
        let feed = fixture.feed("/feed.ics", Some(1), 15).await;
        old_logs(&fixture, &feed.id, 55).await;
        fixture
            .sql(
                "CREATE FUNCTION refuse_delete() RETURNS trigger LANGUAGE plpgsql AS $$ \
                 BEGIN RAISE EXCEPTION 'cleanup failed'; END $$; \
                 CREATE TRIGGER refuse_log_delete BEFORE DELETE ON calendar_sync_log \
                 FOR EACH ROW EXECUTE FUNCTION refuse_delete();",
            )
            .await;
        sync_due(&fixture.state).await;
        assert_eq!(fixture.logs(&feed.id).await.len(), 55);
    }
}
