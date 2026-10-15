//! `MailRealtimeService`: one owner-authorized Stalwart EventSource per subscribed mailbox, coalesced into `mail.changed` events.

mod routes;

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::time::Duration;

use axum::body::Bytes;
use axum::http::{StatusCode, header};
use serde::Deserialize;
use solace_api_types::mail::{MailChangedEvent, MailSyncResult};
use tokio::sync::mpsc;
use tokio::task::AbortHandle;

pub use routes::routes;

use crate::instant;
use crate::mail::push::coalesce_pending_mail_sync;
use crate::mail::{service, sync};
use crate::state::AppState;
use crate::telemetry::redact_pii;

const WATCHED_TYPES: [&str; 3] = ["Email", "Mailbox", "Thread"];
const NOTIFICATION_THROTTLE: Duration = Duration::from_millis(750);
const RECONNECT_DELAY: Duration = Duration::from_secs(3);
const RECEIPT_POLL_INTERVAL: Duration = Duration::from_secs(10);

/// What a subscribed SSE stream receives.
pub type EventSender = mpsc::UnboundedSender<MailChangedEvent>;

#[derive(Clone)]
pub struct Owner {
    pub user_id: String,
    pub email: String,
}

struct Subscriber {
    account_ids: Vec<String>,
    events: EventSender,
}

#[derive(Default)]
struct Pending {
    changed_types: Vec<String>,
    received_at: String,
    user_id: Option<String>,
    sync: Option<MailSyncResult>,
    needs_live_sync: bool,
}

#[derive(Default)]
struct Inner {
    subscribers: HashMap<String, Subscriber>,
    by_account: HashMap<String, HashSet<String>>,
    pending: HashMap<String, Pending>,
    flush_scheduled: HashSet<String>,
    in_flight: HashSet<String>,
    listeners: HashMap<String, AbortHandle>,
}

/// The process-wide subscriber and listener registry, held in `AppState`.
#[derive(Default)]
pub struct Realtime(Mutex<Inner>);

impl Realtime {
    fn with<T>(&self, f: impl FnOnce(&mut Inner) -> T) -> Option<T> {
        self.0.lock().ok().map(|mut inner| f(&mut inner))
    }
}

/// Unsubscribes when the SSE stream is dropped.
pub struct Subscription {
    state: AppState,
    subscriber_id: String,
}

impl Drop for Subscription {
    fn drop(&mut self) {
        unsubscribe(&self.state, &self.subscriber_id);
    }
}

/// `resolveChangedTypes`.
fn resolve_changed_types(from_sync: &[String], fallback: &[String]) -> Vec<String> {
    if from_sync.is_empty() {
        fallback
    } else {
        from_sync
    }
    .to_vec()
}

#[derive(Deserialize)]
struct StateChange {
    #[serde(rename = "@type")]
    kind: Option<String>,
    changed: Option<HashMap<String, HashMap<String, String>>>,
}

/// `normalizeMailChangedEvents`: one event per account whose Email, Mailbox or Thread state moved.
fn normalize_events(payload: StateChange, received_at: &str) -> Vec<MailChangedEvent> {
    let (Some("StateChange"), Some(changed)) = (payload.kind.as_deref(), payload.changed) else {
        return Vec::new();
    };
    changed
        .into_iter()
        .filter_map(|(account_id, types)| {
            let changed_types: Vec<String> = WATCHED_TYPES
                .iter()
                .filter(|kind| types.contains_key(**kind))
                .map(|kind| (*kind).to_owned())
                .collect();
            (!changed_types.is_empty()).then(|| event(account_id, changed_types, received_at, None))
        })
        .collect()
}

fn event(
    account_id: String,
    changed_types: Vec<String>,
    received_at: &str,
    sync: Option<MailSyncResult>,
) -> MailChangedEvent {
    MailChangedEvent {
        kind: "mail.changed".into(),
        account_id: account_id.into(),
        changed_types,
        received_at: solace_api_types::Timestamp(received_at.to_owned()),
        sync,
    }
}

pub fn subscribe(
    state: &AppState,
    subscriber_id: String,
    account_ids: Vec<String>,
    owner: &Owner,
    events: EventSender,
) -> Subscription {
    unsubscribe(state, &subscriber_id);
    state.mail_realtime.with(|inner| {
        for account_id in &account_ids {
            inner
                .by_account
                .entry(account_id.clone())
                .or_default()
                .insert(subscriber_id.clone());
        }
        inner.subscribers.insert(
            subscriber_id.clone(),
            Subscriber {
                account_ids: account_ids.clone(),
                events,
            },
        );
    });
    for account_id in &account_ids {
        ensure_listener(state, account_id, owner);
    }
    Subscription {
        state: state.clone(),
        subscriber_id,
    }
}

fn unsubscribe(state: &AppState, subscriber_id: &str) {
    state.mail_realtime.with(|inner| {
        let Some(existing) = inner.subscribers.remove(subscriber_id) else {
            return;
        };
        for account_id in existing.account_ids {
            let Some(subscribers) = inner.by_account.get_mut(&account_id) else {
                continue;
            };
            subscribers.remove(subscriber_id);
            if subscribers.is_empty() {
                inner.by_account.remove(&account_id);
                if let Some(listener) = inner.listeners.remove(&account_id) {
                    listener.abort();
                }
            }
        }
    });
}

fn has_subscribers(state: &AppState, account_id: &str) -> bool {
    state
        .mail_realtime
        .with(|inner| {
            inner
                .by_account
                .get(account_id)
                .is_some_and(|s| !s.is_empty())
        })
        .unwrap_or(false)
}

fn publish(state: &AppState, event: &MailChangedEvent) {
    state.mail_realtime.with(|inner| {
        for subscriber_id in inner
            .by_account
            .get(&event.account_id.0)
            .into_iter()
            .flatten()
        {
            if let Some(subscriber) = inner.subscribers.get(subscriber_id) {
                let _ = subscriber.events.send(event.clone());
            }
        }
    });
}

fn enqueue(state: &AppState, event: MailChangedEvent, user_id: Option<String>) {
    let account_id = event.account_id.0.clone();
    state.mail_realtime.with(|inner| {
        let pending = inner
            .pending
            .entry(account_id.clone())
            .or_insert_with(|| Pending {
                received_at: event.received_at.0.clone(),
                ..Pending::default()
            });
        for kind in &event.changed_types {
            if !pending.changed_types.contains(kind) {
                pending.changed_types.push(kind.clone());
            }
        }
        if event.received_at.0 > pending.received_at {
            pending.received_at = event.received_at.0.clone();
        }
        if user_id.is_some() {
            pending.user_id = user_id;
        }
        if event.sync.is_none() {
            pending.needs_live_sync = true;
        }
        pending.sync = coalesce_pending_mail_sync(pending.sync.take(), event.sync);
    });
    schedule_flush(state, &account_id);
}

fn schedule_flush(state: &AppState, account_id: &str) {
    let scheduled = state.mail_realtime.with(|inner| {
        if inner.flush_scheduled.contains(account_id) || inner.in_flight.contains(account_id) {
            return false;
        }
        inner.flush_scheduled.insert(account_id.to_owned())
    });
    if scheduled != Some(true) {
        return;
    }
    let state = state.clone();
    let account_id = account_id.to_owned();
    tokio::spawn(async move {
        tokio::time::sleep(NOTIFICATION_THROTTLE).await;
        state
            .mail_realtime
            .with(|inner| inner.flush_scheduled.remove(&account_id));
        flush(&state, &account_id).await;
    });
}

/// `flushAccount`: one event per burst, with the freshest sync snapshot; changes during the flush get one follow-up.
async fn flush(state: &AppState, account_id: &str) {
    let taken = state.mail_realtime.with(|inner| {
        if inner.in_flight.contains(account_id) {
            return None;
        }
        let pending = inner.pending.remove(account_id)?;
        inner.in_flight.insert(account_id.to_owned());
        Some(pending)
    });
    let Some(Some(pending)) = taken else {
        return;
    };
    let fallback = event(
        account_id.to_owned(),
        pending.changed_types.clone(),
        &pending.received_at,
        None,
    );
    let published = async {
        let mut snapshot = pending.sync.clone();
        let mut changed_types = match &snapshot {
            Some(sync) => resolve_changed_types(&sync.changed_types, &pending.changed_types),
            None => pending.changed_types.clone(),
        };
        if pending.needs_live_sync || snapshot.is_none() {
            match sync::sync_account(state, account_id).await? {
                Some(result) => {
                    changed_types =
                        resolve_changed_types(&result.changed_types, &pending.changed_types);
                    snapshot =
                        coalesce_pending_mail_sync(pending.sync.clone(), Some(result.sync.clone()))
                            .or(Some(result.sync));
                }
                None if snapshot.is_none() => return Ok(()),
                None => {}
            }
        }
        if has_subscribers(state, account_id) {
            publish(
                state,
                &MailChangedEvent {
                    changed_types,
                    sync: snapshot,
                    ..fallback.clone()
                },
            );
        }
        Ok::<_, crate::error::AppError>(())
    }
    .await;
    if let Err(error) = published {
        tracing::warn!(account_id, error = %redact_pii(&error.to_string()), "Mail realtime flush failed");
        if has_subscribers(state, account_id) {
            publish(state, &fallback);
        }
    }
    let again = state
        .mail_realtime
        .with(|inner| {
            inner.in_flight.remove(account_id);
            inner.pending.contains_key(account_id)
        })
        .unwrap_or(false);
    if again {
        schedule_flush(state, account_id);
    }
}

/// `stop`: drops pending changes, aborts every EventSource listener, and ends the SSE streams so shutdown can drain.
pub fn stop(state: &AppState) {
    state.mail_realtime.with(|inner| {
        inner.subscribers.clear();
        inner.by_account.clear();
        inner.pending.clear();
        inner.flush_scheduled.clear();
        inner.in_flight.clear();
        for (_, listener) in inner.listeners.drain() {
            listener.abort();
        }
    });
}

/// `startReceiptPolling`: every 10 s, linked mailboxes with new mail are synced and announced; a run never overlaps the next.
pub fn start(state: AppState) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut ticks = tokio::time::interval(RECEIPT_POLL_INTERVAL);
        ticks.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            ticks.tick().await;
            match sync::sync_known_changed_accounts(&state).await {
                Ok(results) => {
                    let received_at = instant::iso(instant::now()).0;
                    for result in results {
                        let changed_types = resolve_changed_types(
                            &result.sync.changed_types,
                            &result.changed_types,
                        );
                        enqueue(
                            &state,
                            event(
                                result.account_id,
                                changed_types,
                                &received_at,
                                Some(result.sync),
                            ),
                            Some(result.user_id),
                        );
                    }
                }
                Err(error) => {
                    tracing::warn!(error = %redact_pii(&error.to_string()), "Receipt-time mail polling failed")
                }
            }
        }
    })
}

fn ensure_listener(state: &AppState, account_id: &str, owner: &Owner) {
    let exists = state
        .mail_realtime
        .with(|inner| inner.listeners.contains_key(account_id))
        .unwrap_or(true);
    if exists {
        return;
    }
    let task = tokio::spawn(listen_forever(
        state.clone(),
        account_id.to_owned(),
        owner.clone(),
    ));
    let previous = state.mail_realtime.with(|inner| {
        inner
            .listeners
            .insert(account_id.to_owned(), task.abort_handle())
    });
    if let Some(Some(previous)) = previous {
        previous.abort();
    }
}

async fn listen_forever(state: AppState, account_id: String, owner: Owner) {
    loop {
        tracing::info!(account_id, "Connecting to Stalwart JMAP EventSource");
        match consume_event_source(&state, &owner).await {
            Ok(()) => tracing::warn!(
                account_id,
                "Stalwart JMAP EventSource connection closed; reconnecting."
            ),
            Err(error) => {
                tracing::error!(account_id, error = %redact_pii(&error), "Stalwart JMAP EventSource listener failed")
            }
        }
        tokio::time::sleep(RECONNECT_DELAY).await;
    }
}

fn event_source_url(state: &AppState) -> String {
    format!(
        "{}/jmap/eventsource/?types=Email%2CMailbox%2CThread&closeafter=no&ping=30",
        state.config.stalwart_base_url.trim_end_matches('/')
    )
}

/// The owner's EventSource request, with the backend-gate key.
fn event_source_request(state: &AppState, access_token: &str) -> reqwest::RequestBuilder {
    let url = event_source_url(state);
    let request = state
        .http
        .get(&url)
        .header(header::ACCEPT, "text/event-stream")
        .bearer_auth(access_token);
    state.stalwart_gate.apply(request, &url)
}

async fn open_event_source(state: &AppState, owner: &Owner) -> Result<reqwest::Response, String> {
    let token = service::access_token_for_user(state, &owner.user_id, &owner.email)
        .await
        .map_err(|error| error.to_string())?;
    event_source_request(state, &token.access_token)
        .send()
        .await
        .map_err(|error| error.without_url().to_string())
}

/// One EventSource connection, authorized as the owner, with one retry after a 401.
async fn consume_event_source(state: &AppState, owner: &Owner) -> Result<(), String> {
    let mut response = open_event_source(state, owner).await?;
    if response.status() == StatusCode::UNAUTHORIZED {
        service::invalidate_access_token(state, &owner.user_id);
        response = open_event_source(state, owner).await?;
    }
    if !response.status().is_success() {
        return Err(format!(
            "Stalwart EventSource request failed with status {}.",
            response.status().as_u16()
        ));
    }
    let mut frames = SseParser::default();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| error.without_url().to_string())?
    {
        for frame in frames.push(&chunk) {
            handle_frame(state, frame)?;
        }
    }
    for frame in frames.finish() {
        handle_frame(state, frame)?;
    }
    Ok(())
}

fn handle_frame(state: &AppState, frame: Frame) -> Result<(), String> {
    let (Some("state"), Some(data)) = (frame.event.as_deref(), frame.data) else {
        return Ok(());
    };
    let payload: StateChange = serde_json::from_str(&data).map_err(|error| error.to_string())?;
    for event in normalize_events(payload, &instant::iso(instant::now()).0) {
        tracing::info!(
            account_id = event.account_id.0,
            "Received Stalwart mail state change"
        );
        enqueue(state, event, None);
    }
    Ok(())
}

#[derive(Default)]
struct Frame {
    event: Option<String>,
    data: Option<String>,
}

/// `parseSseStream`: frames split on blank lines; comments skipped; multi-line `data` joined.
#[derive(Default)]
struct SseParser {
    buffer: Vec<u8>,
    frame: Frame,
}

impl SseParser {
    fn push(&mut self, chunk: &Bytes) -> Vec<Frame> {
        self.buffer.extend_from_slice(chunk);
        let mut frames = Vec::new();
        while let Some(end) = self.buffer.iter().position(|b| *b == b'\n') {
            let line: Vec<u8> = self.buffer.drain(..=end).collect();
            let line = String::from_utf8_lossy(&line);
            let line = line.trim_end_matches('\n').trim_end_matches('\r');
            if let Some(frame) = self.line(line) {
                frames.push(frame);
            }
        }
        frames
    }

    /// The unterminated last line, then the frame it ends.
    fn finish(mut self) -> Vec<Frame> {
        let rest = String::from_utf8_lossy(&std::mem::take(&mut self.buffer)).into_owned();
        let last = self.line(&rest);
        last.into_iter().chain(self.line("")).collect()
    }

    fn line(&mut self, line: &str) -> Option<Frame> {
        if line.is_empty() {
            let frame = std::mem::take(&mut self.frame);
            return (frame.event.is_some() || frame.data.is_some()).then_some(frame);
        }
        if line.starts_with(':') {
            return None;
        }
        let (field, value) = line.split_once(':').unwrap_or((line, ""));
        let value = value.strip_prefix(' ').unwrap_or(value).to_owned();
        match field {
            "event" => self.frame.event = Some(value),
            "data" => {
                self.frame.data = Some(match self.frame.data.take() {
                    Some(data) => format!("{data}\n{value}"),
                    None => value,
                })
            }
            _ => {}
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Mutex as StdMutex, mpsc as std_mpsc};
    use std::time::Duration;

    use serde_json::{Value, json};
    use solace_api_types::mail::{MailCalendarImportSummary, MailSyncCollection};
    use tokio::sync::mpsc::UnboundedReceiver;

    use super::*;
    use crate::db::scratch::ScratchDatabase;
    use crate::integrations::stalwart::fake::{FakeStalwart, Recorded};
    use crate::mail::service::tests::OWNER;
    use crate::mail::sync::tests::{ready, stalwart, unchanged};

    fn collection(records: Vec<Value>) -> MailSyncCollection {
        MailSyncCollection {
            old_state: None,
            new_state: "s1".into(),
            created: Vec::new(),
            updated: Vec::new(),
            destroyed: Vec::new(),
            records,
        }
    }

    fn sync() -> MailSyncResult {
        MailSyncResult {
            account_id: "acct-1".to_owned().into(),
            initialized: false,
            changed_types: vec!["Email".into()],
            email: collection(Vec::new()),
            mailbox: collection(vec![
                json!({"id": "mb-inbox", "name": "Inbox", "role": "inbox"}),
            ]),
            thread: collection(Vec::new()),
            calendar_import: MailCalendarImportSummary {
                messages_scanned: 0,
                ics_parts_found: 0,
                events_created: 0,
                events_updated: 0,
                events_deleted: 0,
                errors: Vec::new(),
            },
        }
    }

    fn inbound(id: &str, subject: &str) -> MailSyncResult {
        let mut snapshot = sync();
        snapshot.email.created = vec![id.into()];
        snapshot.email.records =
            vec![json!({"id": id, "subject": subject, "mailboxIds": {"mb-inbox": true}})];
        snapshot
    }

    #[test]
    fn coalescing_uses_the_next_snapshot_when_nothing_is_pending() {
        let next = inbound("in-1", "Lunch");
        assert_eq!(
            coalesce_pending_mail_sync(None, Some(next.clone())),
            Some(next)
        );
    }

    #[test]
    fn coalescing_merges_created_email_ids() {
        let merged = coalesce_pending_mail_sync(
            Some(inbound("in-1", "First")),
            Some(inbound("in-2", "Second")),
        )
        .unwrap();
        assert_eq!(merged.email.created, ["in-1", "in-2"]);
    }

    #[test]
    fn coalescing_keeps_pending_thread_changes_and_import_stats() {
        let mut pending = sync();
        pending.changed_types = vec!["Thread".into()];
        pending.thread.created = vec!["th-1".into()];
        pending.thread.records = vec![json!({"id": "th-1", "emailIds": ["in-1"]})];
        pending.calendar_import.messages_scanned = 2;
        pending.calendar_import.ics_parts_found = 1;
        pending.calendar_import.events_created = 1;
        pending.calendar_import.errors = vec!["invite parse failed".into()];
        let mut next = sync();
        next.thread.new_state = "s2".into();
        let merged = coalesce_pending_mail_sync(Some(pending), Some(next)).unwrap();
        assert_eq!(merged.changed_types, ["Thread", "Email"]);
        assert_eq!(merged.thread.new_state, "s2");
        assert_eq!(merged.thread.created, ["th-1"]);
        assert_eq!(
            (
                merged.calendar_import.messages_scanned,
                merged.calendar_import.events_created,
                merged.calendar_import.errors
            ),
            (2, 1, vec!["invite parse failed".to_owned()])
        );
    }

    fn owner() -> Owner {
        Owner {
            user_id: OWNER.into(),
            email: "alice@solace.test".into(),
        }
    }

    fn listen(state: &AppState, id: &str) -> (Subscription, UnboundedReceiver<MailChangedEvent>) {
        let (sender, events) = mpsc::unbounded_channel();
        (
            subscribe(state, id.into(), vec!["acct-1".into()], &owner(), sender),
            events,
        )
    }

    fn changed(kind: &str, at: &str, sync: Option<MailSyncResult>) -> MailChangedEvent {
        event("acct-1".into(), vec![kind.into()], at, sync)
    }

    /// The first `expected` events (within thirty seconds), then any that land in the next second, past one more flush.
    async fn collect(
        events: &mut UnboundedReceiver<MailChangedEvent>,
        expected: usize,
    ) -> Vec<MailChangedEvent> {
        let mut got = Vec::new();
        let deadline = tokio::time::Instant::now() + Duration::from_secs(30);
        while got.len() < expected {
            match tokio::time::timeout_at(deadline, events.recv()).await {
                Ok(Some(event)) => got.push(event),
                _ => return got,
            }
        }
        let grace = tokio::time::Instant::now() + Duration::from_secs(1);
        while let Ok(Some(event)) = tokio::time::timeout_at(grace, events.recv()).await {
            got.push(event);
        }
        got
    }

    /// Waits up to thirty seconds for `ready`, so the tests hold on a loaded machine.
    async fn wait_for(ready: impl Fn() -> bool) {
        let deadline = tokio::time::Instant::now() + Duration::from_secs(30);
        while !ready() && tokio::time::Instant::now() < deadline {
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
    }

    fn email_changes(fake: &FakeStalwart) -> usize {
        fake.requests()
            .iter()
            .filter(|r| r.first_method() == "Email/changes")
            .count()
    }

    fn event_sources(fake: &FakeStalwart) -> Vec<Recorded> {
        fake.requests()
            .into_iter()
            .filter(|r| r.path.starts_with("/jmap/eventsource"))
            .collect()
    }

    #[tokio::test]
    async fn coalesces_rapid_changes_into_one_event() {
        let database = ScratchDatabase::create().await;
        let fake = stalwart(|method, _| unchanged(method)).await;
        let state = ready(&database, &fake, true).await;
        let (_first, mut first) = listen(&state, "sub-1");
        let (_second, mut second) = listen(&state, "sub-2");
        enqueue(
            &state,
            changed("Email", "2026-05-13T09:00:00.000Z", None),
            None,
        );
        enqueue(
            &state,
            changed("Mailbox", "2026-05-13T09:00:01.000Z", None),
            None,
        );
        let first = collect(&mut first, 1).await;
        let second = collect(&mut second, 1).await;
        stop(&state);
        assert_eq!(email_changes(&fake), 1, "one live sync for the burst");
        assert_eq!((first.len(), second.len()), (1, 1));
        assert_eq!(first[0].changed_types, ["Email", "Mailbox"]);
        assert_eq!(first[0].received_at.0, "2026-05-13T09:00:01.000Z");
        assert!(first[0].sync.is_some());
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn one_follow_up_flush_after_an_active_sync() {
        let database = ScratchDatabase::create().await;
        let (release, held) = std_mpsc::channel::<()>();
        let held = StdMutex::new(Some(held));
        let fake = stalwart(move |method, _| {
            if method == "Email/changes"
                && let Some(held) = held.lock().unwrap().take()
            {
                let _ = held.recv_timeout(Duration::from_secs(30));
            }
            unchanged(method)
        })
        .await;
        let state = ready(&database, &fake, true).await;
        let (_subscription, mut events) = listen(&state, "sub-1");
        enqueue(
            &state,
            changed("Email", "2026-05-13T09:00:00.000Z", None),
            None,
        );
        wait_for(|| email_changes(&fake) == 1).await;
        assert_eq!(email_changes(&fake), 1, "the first sync is running");
        enqueue(
            &state,
            changed("Mailbox", "2026-05-13T09:00:01.000Z", None),
            None,
        );
        tokio::time::sleep(Duration::from_millis(900)).await;
        assert_eq!(
            email_changes(&fake),
            1,
            "no second flush while one is in flight"
        );
        release.send(()).unwrap();
        let published = collect(&mut events, 2).await;
        stop(&state);
        assert_eq!(email_changes(&fake), 2, "exactly one follow-up");
        assert_eq!(published.len(), 2);
    }

    #[tokio::test]
    async fn event_source_first_then_inbound_snapshot() {
        let database = ScratchDatabase::create().await;
        let fake = stalwart(|method, _| unchanged(method)).await;
        let state = ready(&database, &fake, true).await;
        let (_subscription, mut events) = listen(&state, "sub-1");
        enqueue(
            &state,
            changed("Email", "2026-05-13T09:00:00.000Z", None),
            None,
        );
        enqueue(
            &state,
            changed(
                "Email",
                "2026-05-13T09:00:01.000Z",
                Some(inbound("in-1", "Lunch tomorrow")),
            ),
            None,
        );
        let published = collect(&mut events, 1).await;
        stop(&state);
        assert_eq!(
            email_changes(&fake),
            1,
            "the EventSource change still live-syncs"
        );
        assert_eq!(published.len(), 1);
        assert_eq!(published[0].sync.as_ref().unwrap().email.created, ["in-1"]);
    }

    #[tokio::test]
    async fn keeps_an_inbound_snapshot_over_a_later_empty_one() {
        let database = ScratchDatabase::create().await;
        let fake = stalwart(|method, _| unchanged(method)).await;
        let state = ready(&database, &fake, true).await;
        let (_subscription, mut events) = listen(&state, "sub-1");
        enqueue(
            &state,
            changed(
                "Email",
                "2026-05-13T09:00:00.000Z",
                Some(inbound("in-1", "Lunch tomorrow")),
            ),
            None,
        );
        enqueue(
            &state,
            changed("Email", "2026-05-13T09:00:01.000Z", Some(sync())),
            None,
        );
        let published = collect(&mut events, 1).await;
        stop(&state);
        assert_eq!(email_changes(&fake), 0, "snapshots need no live sync");
        assert_eq!(published.len(), 1);
        assert_eq!(published[0].sync.as_ref().unwrap().email.created, ["in-1"]);
    }

    #[tokio::test]
    async fn merges_inbound_emails_from_overlapping_snapshots() {
        let database = ScratchDatabase::create().await;
        let fake = stalwart(|method, _| unchanged(method)).await;
        let state = ready(&database, &fake, true).await;
        let (_subscription, mut events) = listen(&state, "sub-1");
        enqueue(
            &state,
            changed(
                "Email",
                "2026-05-13T09:00:00.000Z",
                Some(inbound("in-1", "Lunch tomorrow")),
            ),
            None,
        );
        enqueue(
            &state,
            changed(
                "Email",
                "2026-05-13T09:00:01.000Z",
                Some(inbound("in-2", "Dinner tomorrow")),
            ),
            None,
        );
        let published = collect(&mut events, 1).await;
        stop(&state);
        assert_eq!(published.len(), 1);
        assert_eq!(
            published[0].sync.as_ref().unwrap().email.created,
            ["in-1", "in-2"]
        );
    }

    /// New mail since the stored state: one created email the full fetch returns.
    fn new_mail(method: &str, _: &Value) -> (String, Value) {
        match method {
            "Email/changes" => (
                method.into(),
                json!({"oldState": "email-state-1", "newState": "email-state-2", "hasMoreChanges": false, "created": ["in-1"], "updated": [], "destroyed": []}),
            ),
            "Email/get" => (
                method.into(),
                json!({"state": "email-state-2", "list": [{"id": "in-1", "subject": "Lunch tomorrow", "mailboxIds": {"mb-inbox": true}}]}),
            ),
            _ => unchanged(method),
        }
    }

    #[tokio::test]
    async fn polls_linked_accounts_and_publishes_sync_payloads() {
        let database = ScratchDatabase::create().await;
        let fake = stalwart(new_mail).await;
        let state = ready(&database, &fake, true).await;
        let (_subscription, mut events) = listen(&state, "sub-1");
        let polling = start(state.clone());
        let published = collect(&mut events, 1).await;
        polling.abort();
        stop(&state);
        assert_eq!(published.len(), 1);
        assert_eq!(
            (
                published[0].kind.as_str(),
                published[0].account_id.0.as_str(),
                published[0].changed_types.as_slice()
            ),
            ("mail.changed", "acct-1", &["Email".to_owned()][..])
        );
        assert!(published[0].sync.is_some());
    }

    #[tokio::test]
    async fn polls_changed_accounts_and_publishes_snapshots() {
        let database = ScratchDatabase::create().await;
        let fake = stalwart(new_mail).await;
        let state = ready(&database, &fake, true).await;
        let (_subscription, mut events) = listen(&state, "sub-1");
        let polling = start(state.clone());
        let published = collect(&mut events, 1).await;
        polling.abort();
        stop(&state);
        let snapshot = published[0].sync.as_ref().unwrap();
        assert_eq!(snapshot.email.created, ["in-1"]);
        assert_eq!(
            snapshot.email.records[0]["subject"],
            json!("Lunch tomorrow")
        );
    }

    #[tokio::test]
    async fn one_owner_event_source_per_account() {
        let database = ScratchDatabase::create().await;
        let fake = stalwart(|method, _| unchanged(method)).await;
        let state = ready(&database, &fake, true).await;
        let (first, _first_events) = listen(&state, "sub-1");
        let (_second, _second_events) = listen(&state, "sub-2");
        wait_for(|| !event_sources(&fake).is_empty()).await;
        tokio::time::sleep(Duration::from_millis(300)).await;
        let opened = event_sources(&fake);
        assert_eq!(opened.len(), 1, "both subscribers share one listener");
        assert_eq!(
            opened[0].authorization.as_deref(),
            Some("Bearer owner-token")
        );
        drop(first);
        assert!(
            state
                .mail_realtime
                .with(|inner| inner.listeners.contains_key("acct-1"))
                .unwrap()
        );
        stop(&state);
    }

    #[tokio::test]
    async fn sends_the_gate_key_on_the_event_source() {
        let state = crate::mail::proxy::tests::state("https://mail.example.com");
        let request = event_source_request(&state, "owner-token").build().unwrap();
        let header = |name: &str| {
            request
                .headers()
                .get(name)
                .and_then(|v| v.to_str().ok())
                .map(str::to_owned)
        };
        assert_eq!(
            header(crate::integrations::stalwart::gate::GATE_HEADER),
            Some("g".repeat(64))
        );
        assert_eq!(
            header("authorization").as_deref(),
            Some("Bearer owner-token")
        );
        assert_eq!(
            request.url().as_str(),
            "https://mail.example.com/jmap/eventsource/?types=Email%2CMailbox%2CThread&closeafter=no&ping=30"
        );
    }

    #[tokio::test]
    async fn stop_aborts_event_source_listeners() {
        let database = ScratchDatabase::create().await;
        let fake = stalwart(|method, _| unchanged(method)).await;
        let state = ready(&database, &fake, true).await;
        let (_subscription, mut events) = listen(&state, "sub-1");
        wait_for(|| !event_sources(&fake).is_empty()).await;
        assert_eq!(event_sources(&fake).len(), 1);
        stop(&state);
        assert!(
            state
                .mail_realtime
                .with(|inner| inner.listeners.is_empty())
                .unwrap()
        );
        assert!(events.recv().await.is_none(), "the SSE stream ends");
    }
}
