//! `MailSyncService`: JMAP deltas since the stored state, read as the mailbox owner, with invitation auto-filing on the way.

mod routes;

pub use routes::routes;

use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::{Value, json};
use solace_api_types::events::InvitationImportSummary;
use solace_api_types::mail::{MailCalendarImportSummary, MailSyncCollection, MailSyncResult};

use super::queries::{self, States};
use crate::db::entities::mail_jmap_sync_state;
use crate::error::AppError;
use crate::instant;
use crate::integrations::stalwart::{jmap, method_response};
use crate::invitations::service::{MailEmail, ingest_from_emails};
use crate::state::AppState;
use crate::telemetry::{log_ref, redact_pii};

const CORE_MAIL_CAPABILITIES: [&str; 2] =
    ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"];
const CACHE_TTL: Duration = Duration::from_secs(60);
/// Past this many entries a write first drops the expired ones, so the caches stay bounded by active mailboxes.
const CACHE_SWEEP_AT: usize = 4096;
const RECENT_INBOUND_BACKUP_WINDOW_MS: i64 = 5 * 60 * 1000;
const RECENT_INGEST_LOOKUP_WINDOW_MS: i64 = 2 * 60 * 1000;
const MAX_CHANGE_PAGES: usize = 25;
const HEADER_PROPERTIES: [&str; 7] = [
    "id",
    "threadId",
    "mailboxIds",
    "from",
    "subject",
    "receivedAt",
    "keywords",
];
const INGEST_LOOKUP_PROPERTIES: [&str; 8] = [
    "id",
    "threadId",
    "mailboxIds",
    "from",
    "subject",
    "receivedAt",
    "keywords",
    "messageId",
];
const FULL_PROPERTIES: [&str; 15] = [
    "id",
    "threadId",
    "mailboxIds",
    "from",
    "subject",
    "receivedAt",
    "keywords",
    "to",
    "cc",
    "bcc",
    "bodyStructure",
    "bodyValues",
    "textBody",
    "htmlBody",
    "attachments",
];
const MAILBOX_PROPERTIES: [&str; 5] = ["id", "name", "role", "parentId", "sortOrder"];

/// A 60 s cache, like the TypeScript `Map`s.
struct Ttl<T>(Mutex<HashMap<String, (Instant, T)>>);

impl<T> Default for Ttl<T> {
    fn default() -> Self {
        Self(Mutex::new(HashMap::new()))
    }
}

impl<T: Clone> Ttl<T> {
    fn get(&self, key: &str) -> Option<T> {
        let mut entries = self.0.lock().ok()?;
        match entries.get(key) {
            Some((expires, value)) if *expires > Instant::now() => Some(value.clone()),
            Some(_) => {
                entries.remove(key);
                None
            }
            None => None,
        }
    }

    fn put(&self, key: String, value: T) -> T {
        if let Ok(mut entries) = self.0.lock() {
            if entries.len() >= CACHE_SWEEP_AT {
                let now = Instant::now();
                entries.retain(|_, (expires, _)| *expires > now);
            }
            entries.insert(key, (Instant::now() + CACHE_TTL, value.clone()));
        }
        value
    }

    fn remove(&self, key: &str) {
        if let Ok(mut entries) = self.0.lock() {
            entries.remove(key);
        }
    }
}

#[derive(Clone)]
struct Owner {
    user_id: String,
    email: String,
}

#[derive(Clone)]
struct Directory {
    id: String,
    account_id: String,
}

/// The mailbox authorizations, stored states and owners sync looked up in the last minute, held in `AppState`.
#[derive(Default)]
pub struct SyncCache {
    directory: Ttl<Directory>,
    sync_state: Ttl<Option<mail_jmap_sync_state::Model>>,
    owner: Ttl<Owner>,
}

fn cache_owner(state: &AppState, account_id: &str, user_id: &str, email: &str) {
    state.mail_sync.owner.put(
        account_id.to_owned(),
        Owner {
            user_id: user_id.to_owned(),
            email: email.to_owned(),
        },
    );
}

fn cache_directory(state: &AppState, user_id: &str, id: &str, account_id: &str) -> Directory {
    state.mail_sync.directory.put(
        format!("{user_id}:{account_id}"),
        Directory {
            id: id.to_owned(),
            account_id: account_id.to_owned(),
        },
    )
}

fn cache_state(state: &AppState, row: &mail_jmap_sync_state::Model) {
    state
        .mail_sync
        .sync_state
        .put(row.directory_entry_id.clone(), Some(row.clone()));
}

/// `getAuthorizedDirectoryEntry`: the mailbox must be linked to this user.
async fn authorized_directory(
    state: &AppState,
    user_id: &str,
    account_id: &str,
) -> Result<Directory, AppError> {
    if let Some(cached) = state
        .mail_sync
        .directory
        .get(&format!("{user_id}:{account_id}"))
    {
        return Ok(cached);
    }
    let entry = queries::entry_by_account(&state.db, account_id)
        .await?
        .filter(|entry| entry.user_id.as_deref() == Some(user_id))
        .ok_or_else(|| {
            AppError::Forbidden("You are not authorized to sync that mailbox.".into())
        })?;
    cache_owner(state, &entry.stalwart_account_id, user_id, &entry.email);
    Ok(cache_directory(
        state,
        user_id,
        &entry.id,
        &entry.stalwart_account_id,
    ))
}

async fn stored_state(
    state: &AppState,
    directory_entry_id: &str,
) -> Result<Option<mail_jmap_sync_state::Model>, AppError> {
    if let Some(cached) = state.mail_sync.sync_state.get(directory_entry_id) {
        return Ok(cached);
    }
    let row = queries::sync_state(&state.db, directory_entry_id).await?;
    Ok(state
        .mail_sync
        .sync_state
        .put(directory_entry_id.to_owned(), row))
}

/// JMAP runs as the mailbox owner, so every call resolves its own credentials.
async fn mailbox_owner(state: &AppState, account_id: &str) -> Result<Owner, AppError> {
    if let Some(cached) = state.mail_sync.owner.get(account_id) {
        return Ok(cached);
    }
    let entry = queries::entry_by_account(&state.db, account_id).await?;
    let Some((user_id, email)) =
        entry.and_then(|entry| entry.user_id.map(|user_id| (user_id, entry.email)))
    else {
        return Err(AppError::Forbidden(
            "That mailbox is not linked to a Solace account.".into(),
        ));
    };
    Ok(state
        .mail_sync
        .owner
        .put(account_id.to_owned(), Owner { user_id, email }))
}

/// `callMethod`: one method call as the owner of the `accountId` argument.
async fn call(state: &AppState, method: &str, arguments: Value) -> Result<Value, AppError> {
    let account_id = arguments
        .get("accountId")
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())
        .ok_or_else(|| AppError::field("A mail accountId is required.", "accountId"))?
        .to_owned();
    let owner = mailbox_owner(state, &account_id).await?;
    let envelope = jmap::call(
        state,
        &owner.user_id,
        &owner.email,
        &CORE_MAIL_CAPABILITIES,
        json!([[method, arguments, "c1"]]),
    )
    .await
    .map_err(AppError::internal)?;
    method_result(&envelope, method)
}

fn method_result(envelope: &Value, method: &str) -> Result<Value, AppError> {
    if let Some(result) = method_response(envelope, method) {
        return Ok(result.clone());
    }
    if let Some(error) = method_response(envelope, "error") {
        let kind = error.get("type").and_then(Value::as_str).unwrap_or("error");
        return Err(AppError::internal(format!(
            "Stalwart JMAP {method} failed ({kind})."
        )));
    }
    Err(AppError::internal(format!(
        "Stalwart JMAP response did not include {method}."
    )))
}

fn strings(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_owned)
        .collect()
}

/// `uniqueIds`: first occurrence order, without blanks.
fn unique(values: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut seen = HashSet::new();
    values
        .into_iter()
        .filter(|value| !value.is_empty() && seen.insert(value.clone()))
        .collect()
}

fn list(response: Value) -> Vec<Value> {
    match response {
        Value::Object(mut object) => match object.remove("list") {
            Some(Value::Array(list)) => list,
            _ => Vec::new(),
        },
        _ => Vec::new(),
    }
}

fn state_of(response: &Value) -> String {
    response
        .get("state")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned()
}

fn received_ms(record: &Value) -> Option<i64> {
    record
        .get("receivedAt")
        .and_then(Value::as_str)
        .and_then(instant::parse_js_date)
}

fn sort_newest_first(records: &mut [Value]) {
    records.sort_by(|left, right| {
        received_ms(right)
            .unwrap_or(0)
            .cmp(&received_ms(left).unwrap_or(0))
    });
}

fn collection(
    old_state: Option<String>,
    new_state: String,
    changes: Changes,
    records: Vec<Value>,
) -> MailSyncCollection {
    MailSyncCollection {
        old_state,
        new_state,
        created: unique(changes.created),
        updated: unique(changes.updated),
        destroyed: unique(changes.destroyed),
        records,
    }
}

fn has_changes(collection: &MailSyncCollection) -> bool {
    !collection.created.is_empty()
        || !collection.updated.is_empty()
        || !collection.destroyed.is_empty()
}

#[derive(Default)]
struct Changes {
    created: Vec<String>,
    updated: Vec<String>,
    destroyed: Vec<String>,
}

/// `collectChanges`: every page of `{type}/changes`, at most 25.
async fn collect_changes(
    state: &AppState,
    kind: &str,
    account_id: &str,
    since: &str,
) -> Result<(String, String, Changes), AppError> {
    let method = format!("{kind}/changes");
    let mut request_state = since.to_owned();
    let mut changes = Changes::default();
    for _ in 0..MAX_CHANGE_PAGES {
        let response = call(
            state,
            &method,
            json!({"accountId": account_id, "sinceState": request_state, "maxChanges": 200}),
        )
        .await?;
        let old_state = response
            .get("oldState")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();
        changes.created.extend(strings(response.get("created")));
        changes.updated.extend(strings(response.get("updated")));
        changes.destroyed.extend(strings(response.get("destroyed")));
        let new_state = response
            .get("newState")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();
        if !response
            .get("hasMoreChanges")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            let changes = Changes {
                created: unique(changes.created),
                updated: unique(changes.updated),
                destroyed: unique(changes.destroyed),
            };
            return Ok((old_state, new_state, changes));
        }
        request_state = new_state;
    }
    Err(AppError::internal(format!(
        "Mail sync exceeded change pagination limit for {kind}."
    )))
}

async fn emails_with(
    state: &AppState,
    account_id: &str,
    ids: &[String],
    properties: &[&str],
    bodies: bool,
) -> Result<Vec<Value>, AppError> {
    let mut arguments = json!({"accountId": account_id, "ids": ids, "properties": properties});
    if bodies {
        arguments["fetchTextBodyValues"] = json!(true);
        arguments["fetchHTMLBodyValues"] = json!(true);
        arguments["fetchAllBodyValues"] = json!(true);
    }
    Ok(list(call(state, "Email/get", arguments).await?))
}

/// `getEmails`: full records with bodies, or headers only when that fetch fails.
async fn emails(
    state: &AppState,
    account_id: &str,
    ids: &[String],
) -> Result<Vec<Value>, AppError> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    match emails_with(state, account_id, ids, &FULL_PROPERTIES, true).await {
        Ok(records) => Ok(records),
        Err(error) => {
            tracing::warn!(account_id, requested = ids.len(), error = %redact_pii(&error.to_string()), "Full email fetch failed; retrying headers only");
            emails_with(state, account_id, ids, &HEADER_PROPERTIES, false).await
        }
    }
}

async fn recent_ids(
    state: &AppState,
    account_id: &str,
    limit: u32,
) -> Result<Vec<String>, AppError> {
    let response = call(
        state,
        "Email/query",
        json!({"accountId": account_id, "sort": [{"property": "receivedAt", "isAscending": false}], "limit": limit}),
    )
    .await?;
    Ok(strings(response.get("ids")))
}

async fn mailboxes_by_ids(
    state: &AppState,
    account_id: &str,
    ids: &[String],
) -> Result<Vec<Value>, AppError> {
    Ok(list(
        call(
            state,
            "Mailbox/get",
            json!({"accountId": account_id, "ids": ids, "properties": MAILBOX_PROPERTIES}),
        )
        .await?,
    ))
}

async fn email_changes(
    state: &AppState,
    account_id: &str,
    since: &str,
) -> Result<MailSyncCollection, AppError> {
    let (old_state, new_state, changes) =
        collect_changes(state, "Email", account_id, since).await?;
    let ids = unique(changes.created.iter().chain(&changes.updated).cloned());
    let mut records = emails(state, account_id, &ids).await?;
    let found: HashSet<String> = records
        .iter()
        .filter_map(|r| r.get("id").and_then(Value::as_str))
        .map(str::to_owned)
        .collect();
    let missing = unique(
        changes
            .created
            .iter()
            .filter(|id| !found.contains(*id))
            .cloned(),
    );
    if !missing.is_empty() {
        match emails_with(state, account_id, &missing, &HEADER_PROPERTIES, false).await {
            Ok(extra) => records.extend(extra),
            Err(error) => {
                tracing::warn!(account_id, missing = missing.len(), error = %redact_pii(&error.to_string()), "Header backup fetch failed for created mail")
            }
        }
    }
    sort_newest_first(&mut records);
    Ok(collection(Some(old_state), new_state, changes, records))
}

async fn mailbox_changes(
    state: &AppState,
    account_id: &str,
    since: &str,
) -> Result<MailSyncCollection, AppError> {
    let (old_state, new_state, changes) =
        collect_changes(state, "Mailbox", account_id, since).await?;
    let ids = unique(changes.created.iter().chain(&changes.updated).cloned());
    let records = if ids.is_empty() {
        Vec::new()
    } else {
        mailboxes_by_ids(state, account_id, &ids).await?
    };
    Ok(collection(Some(old_state), new_state, changes, records))
}

async fn thread_changes(
    state: &AppState,
    account_id: &str,
    since: &str,
) -> Result<MailSyncCollection, AppError> {
    let (old_state, new_state, changes) =
        collect_changes(state, "Thread", account_id, since).await?;
    let ids = unique(changes.created.iter().chain(&changes.updated).cloned());
    let records = if ids.is_empty() {
        Vec::new()
    } else {
        list(
            call(
                state,
                "Thread/get",
                json!({"accountId": account_id, "ids": ids, "properties": ["id", "emailIds"]}),
            )
            .await?,
        )
    };
    Ok(collection(Some(old_state), new_state, changes, records))
}

fn summary(imported: InvitationImportSummary) -> MailCalendarImportSummary {
    let count = |value: i64| u32::try_from(value).unwrap_or(u32::MAX);
    MailCalendarImportSummary {
        messages_scanned: count(imported.messages_scanned),
        ics_parts_found: count(imported.ics_parts_found),
        events_created: count(imported.events_created),
        events_updated: count(imported.events_updated),
        events_deleted: count(imported.events_deleted),
        errors: imported.errors,
    }
}

/// `ingestCalendarEventsFromMail`: a failed import is reported in the summary, never as a failed sync.
async fn ingest(state: &AppState, user_id: &str, records: &[Value]) -> MailCalendarImportSummary {
    let emails: Vec<MailEmail> = records
        .iter()
        .filter_map(|record| serde_json::from_value(record.clone()).ok())
        .collect();
    match ingest_from_emails(state, user_id, &emails).await {
        Ok(imported) => summary(imported),
        Err(error) => {
            tracing::error!(error = %redact_pii(&error.to_string()), "Mail calendar import failed");
            MailCalendarImportSummary {
                messages_scanned: u32::try_from(records.len()).unwrap_or(u32::MAX),
                ics_parts_found: 0,
                events_created: 0,
                events_updated: 0,
                events_deleted: 0,
                errors: vec![error.client_message()],
            }
        }
    }
}

/// `initializeSyncState`: stores today's states and reports only mail received in the last five minutes.
async fn initialize(
    state: &AppState,
    directory: &Directory,
    user_id: &str,
) -> Result<MailSyncResult, AppError> {
    let account_id = &directory.account_id;
    let (mailboxes, email_state, thread_state) = tokio::try_join!(
        call(
            state,
            "Mailbox/get",
            json!({"accountId": account_id, "properties": MAILBOX_PROPERTIES})
        ),
        call(
            state,
            "Email/get",
            json!({"accountId": account_id, "ids": [], "properties": ["id"]})
        ),
        call(
            state,
            "Thread/get",
            json!({"accountId": account_id, "ids": [], "properties": ["id", "emailIds"]})
        ),
    )?;
    let (mailbox_state, email_state, thread_state) = (
        state_of(&mailboxes),
        state_of(&email_state),
        state_of(&thread_state),
    );
    let stored = queries::store_initial(
        &state.db,
        &directory.id,
        account_id,
        &States {
            email: &email_state,
            mailbox: &mailbox_state,
            thread: Some(&thread_state),
        },
    )
    .await?;
    cache_state(state, &stored);
    let recent = emails(state, account_id, &recent_ids(state, account_id, 50).await?).await?;
    let calendar_import = ingest(state, user_id, &recent).await;
    let now = instant::unix_millis(instant::now());
    let inbound: Vec<Value> = recent
        .into_iter()
        .filter(|record| {
            received_ms(record)
                .is_some_and(|received| now - received <= RECENT_INBOUND_BACKUP_WINDOW_MS)
        })
        .collect();
    let created = inbound
        .iter()
        .filter_map(|r| r.get("id").and_then(Value::as_str))
        .map(str::to_owned)
        .collect();
    Ok(MailSyncResult {
        account_id: account_id.clone().into(),
        initialized: true,
        changed_types: if inbound.is_empty() {
            Vec::new()
        } else {
            vec!["Email".into()]
        },
        email: collection(
            None,
            email_state,
            Changes {
                created,
                ..Changes::default()
            },
            inbound,
        ),
        mailbox: collection(None, mailbox_state, Changes::default(), list(mailboxes)),
        thread: collection(None, thread_state, Changes::default(), Vec::new()),
        calendar_import,
    })
}

/// `GET /api/mail/sync`: the first call stores the states; later calls return the deltas and advance them.
pub async fn sync_for_user(
    state: &AppState,
    user_id: &str,
    account_id: &str,
) -> Result<MailSyncResult, AppError> {
    let account_id = account_id.trim();
    if account_id.is_empty() {
        return Err(AppError::field(
            "A mail accountId is required.",
            "accountId",
        ));
    }
    let directory = authorized_directory(state, user_id, account_id).await?;
    let Some(existing) = stored_state(state, &directory.id).await? else {
        let initialized = initialize(state, &directory, user_id).await?;
        tracing::info!(account_id, "Initialized mail sync state");
        return Ok(initialized);
    };
    let thread_since = existing
        .thread_state
        .clone()
        .unwrap_or_else(|| existing.email_state.clone());
    let fetched = tokio::try_join!(
        email_changes(state, account_id, &existing.email_state),
        mailbox_changes(state, account_id, &existing.mailbox_state),
        thread_changes(state, account_id, &thread_since),
    );
    let (email, mut mailbox, thread) = match fetched {
        Ok(fetched) => fetched,
        Err(error) => {
            tracing::warn!(account_id, error = %redact_pii(&error.to_string()), "Mail sync changes failed; reinitializing JMAP state");
            state.mail_sync.sync_state.remove(&directory.id);
            return initialize(state, &directory, user_id).await;
        }
    };
    let updated = queries::advance(
        &state.db,
        existing,
        &States {
            email: &email.new_state,
            mailbox: &mailbox.new_state,
            thread: Some(&thread.new_state),
        },
    )
    .await?;
    cache_state(state, &updated);
    let known: HashSet<&str> = mailbox
        .records
        .iter()
        .filter_map(|m| m.get("id").and_then(Value::as_str))
        .collect();
    let missing = unique(
        email
            .records
            .iter()
            .filter_map(|record| record.get("mailboxIds").and_then(Value::as_object))
            .flat_map(|ids| {
                ids.iter()
                    .filter(|(_, included)| included.as_bool() == Some(true))
                    .map(|(id, _)| id.clone())
            })
            .filter(|id| !known.contains(id.as_str())),
    );
    if !missing.is_empty() {
        match mailboxes_by_ids(state, account_id, &missing).await {
            Ok(extra) => mailbox.records.extend(extra),
            Err(error) => {
                tracing::warn!(account_id, missing = missing.len(), error = %redact_pii(&error.to_string()), "Failed to hydrate mailboxes for inbound detection")
            }
        }
    }
    let changed_types = [
        ("Email", has_changes(&email)),
        ("Mailbox", has_changes(&mailbox)),
        ("Thread", has_changes(&thread)),
    ]
    .into_iter()
    .filter(|(_, changed)| *changed)
    .map(|(kind, _)| kind.to_owned())
    .collect();
    let calendar_import = ingest(state, user_id, &email.records).await;
    tracing::info!(account_id, "Mail sync completed");
    Ok(MailSyncResult {
        account_id: account_id.to_owned().into(),
        initialized: false,
        changed_types,
        email,
        mailbox,
        thread,
        calendar_import,
    })
}

async fn quick_check(state: &AppState, kind: &str, account_id: &str, since: &str) -> bool {
    let response = call(
        state,
        &format!("{kind}/changes"),
        json!({"accountId": account_id, "sinceState": since, "maxChanges": 1}),
    )
    .await;
    match response {
        Ok(response) => {
            response
                .get("hasMoreChanges")
                .and_then(Value::as_bool)
                .unwrap_or(false)
                || ["created", "updated", "destroyed"].iter().any(|key| {
                    response
                        .get(*key)
                        .and_then(Value::as_array)
                        .is_some_and(|ids| !ids.is_empty())
                })
        }
        Err(error) => {
            tracing::warn!(account_id, kind, error = %redact_pii(&error.to_string()), "JMAP changes check failed; forcing sync");
            true
        }
    }
}

/// `detectChanges`: whether Email or Mailbox moved past the stored state, without advancing it.
pub async fn detect_changes(
    state: &AppState,
    user_id: &str,
    account_id: &str,
) -> Result<Vec<String>, AppError> {
    let account_id = account_id.trim();
    if account_id.is_empty() {
        return Ok(Vec::new());
    }
    let directory = authorized_directory(state, user_id, account_id).await?;
    let Some(stored) = stored_state(state, &directory.id).await? else {
        return Ok(vec!["Email".into(), "Mailbox".into()]);
    };
    let (email, mailbox) = tokio::join!(
        quick_check(state, "Email", account_id, &stored.email_state),
        quick_check(state, "Mailbox", account_id, &stored.mailbox_state),
    );
    Ok([("Email", email), ("Mailbox", mailbox)]
        .into_iter()
        .filter(|(_, changed)| *changed)
        .map(|(kind, _)| kind.to_owned())
        .collect())
}

/// `listAuthorizedAccountIdsForUser`.
pub async fn authorized_account_ids(
    state: &AppState,
    user_id: &str,
) -> Result<Vec<String>, AppError> {
    let Some(entry) = queries::entry_by_user(&state.db, user_id).await? else {
        return Ok(Vec::new());
    };
    cache_directory(state, user_id, &entry.id, &entry.stalwart_account_id);
    Ok(vec![entry.stalwart_account_id])
}

/// One mailbox's receipt-time sync, as mail realtime reports it.
pub struct ReceiptSync {
    pub account_id: String,
    pub user_id: String,
    pub changed_types: Vec<String>,
    pub sync: MailSyncResult,
}

/// `syncKnownChangedAccounts`: every linked mailbox with changes is synced; one failure doesn't stop the rest.
pub async fn sync_known_changed_accounts(state: &AppState) -> Result<Vec<ReceiptSync>, AppError> {
    let mut results = Vec::new();
    for entry in queries::linked_mailboxes(&state.db).await? {
        let Some(user_id) = entry.user_id.clone() else {
            continue;
        };
        cache_owner(state, &entry.stalwart_account_id, &user_id, &entry.email);
        cache_directory(state, &user_id, &entry.id, &entry.stalwart_account_id);
        let outcome = async {
            let changed_types = detect_changes(state, &user_id, &entry.stalwart_account_id).await?;
            if changed_types.is_empty() {
                return Ok(None);
            }
            let sync = sync_for_user(state, &user_id, &entry.stalwart_account_id).await?;
            Ok::<_, AppError>(Some(ReceiptSync {
                account_id: entry.stalwart_account_id.clone(),
                user_id: user_id.clone(),
                changed_types: if sync.changed_types.is_empty() {
                    changed_types
                } else {
                    sync.changed_types.clone()
                },
                sync,
            }))
        }
        .await;
        match outcome {
            Ok(Some(result)) => results.push(result),
            Ok(None) => {}
            Err(error) => tracing::warn!(
                account_id = entry.stalwart_account_id,
                user_ref = log_ref(&user_id),
                error = %redact_pii(&error.to_string()),
                "Receipt-time mail sync failed"
            ),
        }
    }
    Ok(results)
}

/// `syncAccount`: the linked owner's sync, or `None` for an unlinked mailbox.
pub async fn sync_account(
    state: &AppState,
    account_id: &str,
) -> Result<Option<ReceiptSync>, AppError> {
    let account_id = account_id.trim();
    if account_id.is_empty() {
        return Ok(None);
    }
    let Some(entry) = queries::entry_by_account(&state.db, account_id).await? else {
        return Ok(None);
    };
    let Some(user_id) = entry.user_id.clone() else {
        return Ok(None);
    };
    cache_owner(state, &entry.stalwart_account_id, &user_id, &entry.email);
    cache_directory(state, &user_id, &entry.id, &entry.stalwart_account_id);
    let sync = sync_for_user(state, &user_id, &entry.stalwart_account_id).await?;
    Ok(Some(ReceiptSync {
        account_id: entry.stalwart_account_id,
        user_id,
        changed_types: sync.changed_types.clone(),
        sync,
    }))
}

pub struct IngestLookup<'a> {
    pub document_id: &'a str,
    pub subject: Option<&'a str>,
    pub message_id: Option<&'a str>,
    pub from_email: Option<&'a str>,
}

pub struct IngestedEmailRef {
    pub id: String,
    pub message_ids: Vec<String>,
    pub from_email: Option<String>,
    /// False when the email was picked by the subject or recent-delivery heuristics.
    pub exact_match: bool,
}

fn ingested_ref(email: Option<&Value>, exact_match: bool) -> Option<IngestedEmailRef> {
    let email = email?;
    let id = email
        .get("id")
        .and_then(Value::as_str)
        .filter(|id| !id.is_empty())?;
    Some(IngestedEmailRef {
        id: id.to_owned(),
        message_ids: strings(email.get("messageId")),
        from_email: email
            .pointer("/from/0/email")
            .and_then(Value::as_str)
            .map(str::to_owned),
        exact_match,
    })
}

fn normalize_message_id(value: &str) -> String {
    let trimmed = value.trim();
    let trimmed = trimmed.strip_prefix('<').unwrap_or(trimmed);
    trimmed.strip_suffix('>').unwrap_or(trimmed).to_lowercase()
}

fn has_message_id(email: &Value, wanted: &str) -> bool {
    strings(email.get("messageId"))
        .iter()
        .any(|candidate| normalize_message_id(candidate) == wanted)
}

async fn recent_with(
    state: &AppState,
    account_id: &str,
    limit: u32,
    properties: &[&str],
) -> Result<Vec<Value>, AppError> {
    let ids = recent_ids(state, account_id, limit).await?;
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    emails_with(state, account_id, &ids, properties, false).await
}

/// `resolveIngestedEmail`: the webhook's document id, then the Message-ID, the subject, and the latest delivery.
pub async fn resolve_ingested_email(
    state: &AppState,
    account_id: &str,
    lookup: &IngestLookup<'_>,
) -> Result<Option<IngestedEmailRef>, AppError> {
    let direct = emails_with(
        state,
        account_id,
        &[lookup.document_id.to_owned()],
        &INGEST_LOOKUP_PROPERTIES,
        false,
    )
    .await?;
    if let Some(found) = ingested_ref(direct.first(), true) {
        return Ok(Some(found));
    }
    let wanted = lookup
        .message_id
        .map(normalize_message_id)
        .unwrap_or_default();
    if !wanted.is_empty() {
        let recent = recent_with(state, account_id, 20, &INGEST_LOOKUP_PROPERTIES).await?;
        if let Some(found) = recent.iter().find(|email| has_message_id(email, &wanted)) {
            return Ok(ingested_ref(Some(found), true));
        }
    }
    if let Some(subject) = lookup.subject.map(str::trim).filter(|s| !s.is_empty()) {
        let query = call(
            state,
            "Email/query",
            json!({"accountId": account_id, "filter": {"text": subject}, "sort": [{"property": "receivedAt", "isAscending": false}], "limit": 5}),
        )
        .await?;
        let ids = strings(query.get("ids"));
        if !ids.is_empty() {
            let found = emails_with(
                state,
                account_id,
                &ids,
                &["id", "subject", "receivedAt", "messageId"],
                false,
            )
            .await?;
            let subject = subject.to_lowercase();
            let exact = found.iter().find(|email| {
                email
                    .get("subject")
                    .and_then(Value::as_str)
                    .is_some_and(|s| s.trim().to_lowercase() == subject)
            });
            return Ok(ingested_ref(exact.or(found.first()), false));
        }
    }
    let recent = recent_with(state, account_id, 10, &INGEST_LOOKUP_PROPERTIES).await?;
    let cutoff = instant::unix_millis(instant::now()) - RECENT_INGEST_LOOKUP_WINDOW_MS;
    let window: Vec<&Value> = recent
        .iter()
        .filter(|email| received_ms(email).is_some_and(|at| at >= cutoff))
        .collect();
    if window.is_empty() {
        return Ok(None);
    }
    if !wanted.is_empty()
        && let Some(found) = window.iter().find(|email| has_message_id(email, &wanted))
    {
        return Ok(ingested_ref(Some(found), false));
    }
    if let Some(from) = lookup
        .from_email
        .map(|f| f.trim().to_lowercase())
        .filter(|f| !f.is_empty())
        && let Some(found) = window.iter().find(|email| {
            email
                .pointer("/from/0/email")
                .and_then(Value::as_str)
                .is_some_and(|e| e.trim().to_lowercase() == from)
        })
    {
        return Ok(ingested_ref(Some(found), false));
    }
    Ok(ingested_ref(window.first().copied(), false))
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex as StdMutex};

    use sea_orm::ConnectionTrait;
    use serde_json::json;

    use super::*;
    use crate::db::scratch::ScratchDatabase;
    use crate::integrations::stalwart::fake::{FakeStalwart, Reply};
    use crate::mail::service::tests::{OWNER, cache_token, mail_state, seed_mailbox};

    /// A Stalwart whose JMAP answers each call with `answer(method, arguments)`, as `[name, result]`.
    async fn stalwart(
        answer: impl Fn(&str, &Value) -> (String, Value) + Send + Sync + 'static,
    ) -> FakeStalwart {
        FakeStalwart::start(move |request| {
            let body = request.json();
            let call = &body["methodCalls"][0];
            let (name, result) = answer(call[0].as_str().unwrap_or_default(), &call[1]);
            Reply::json(json!({"methodResponses": [[name, result, "c1"]], "sessionState": "s"}))
        })
        .await
    }

    fn unchanged(method: &str) -> (String, Value) {
        (
            method.to_owned(),
            json!({"oldState": "state-0", "newState": "state-0", "hasMoreChanges": false, "created": [], "updated": [], "destroyed": []}),
        )
    }

    async fn ready(database: &ScratchDatabase, fake: &FakeStalwart, stored: bool) -> AppState {
        let state = mail_state(database, fake).await;
        seed_mailbox(&state, "acct-1").await;
        cache_token(&state, "owner-token");
        if stored {
            state
                .db
                .execute_unprepared(
                    "INSERT INTO mail_jmap_sync_state (id, directory_entry_id, stalwart_account_id, email_state, mailbox_state, thread_state, created_at, updated_at) \
                     VALUES ('sync-1', 'entry-1', 'acct-1', 'email-state-1', 'mailbox-state-1', 'thread-state-1', now(), now())",
                )
                .await
                .unwrap();
        }
        state
    }

    #[tokio::test]
    async fn reuses_cached_authorization_and_state() {
        let database = ScratchDatabase::create().await;
        let since = Arc::new(StdMutex::new(Vec::new()));
        let seen = since.clone();
        let fake = stalwart(move |method, arguments| {
            if method == "Email/changes" {
                seen.lock().unwrap().push(arguments["sinceState"].clone());
            }
            unchanged(method)
        })
        .await;
        let state = ready(&database, &fake, true).await;
        assert!(
            detect_changes(&state, OWNER, "acct-1")
                .await
                .unwrap()
                .is_empty()
        );
        state
            .db
            .execute_unprepared(
                "DELETE FROM mail_jmap_sync_state; UPDATE mail_directory_entry SET user_id = NULL",
            )
            .await
            .unwrap();
        assert!(
            detect_changes(&state, OWNER, "acct-1")
                .await
                .unwrap()
                .is_empty(),
            "the cached link and state answer"
        );
        assert_eq!(
            *since.lock().unwrap(),
            [json!("email-state-1"), json!("email-state-1")]
        );
    }

    #[tokio::test]
    async fn reinitializes_when_changes_cannot_be_calculated() {
        let database = ScratchDatabase::create().await;
        let fake = stalwart(|method, _| match method {
            "Email/changes" => ("error".into(), json!({"type": "cannotCalculateChanges"})),
            other => unchanged(other),
        })
        .await;
        let state = ready(&database, &fake, true).await;
        assert_eq!(
            detect_changes(&state, OWNER, "acct-1").await.unwrap(),
            ["Email"]
        );
    }

    #[tokio::test]
    async fn retries_without_bodies_when_the_full_fetch_fails() {
        let database = ScratchDatabase::create().await;
        let full_fetches = Arc::new(StdMutex::new(0));
        let counted = full_fetches.clone();
        let fake = stalwart(move |method, arguments| match method {
            "Email/changes" => (
                method.into(),
                json!({"oldState": "email-state-1", "newState": "email-state-2", "hasMoreChanges": false, "created": ["in-1"], "updated": [], "destroyed": []}),
            ),
            "Email/get" if arguments["fetchAllBodyValues"] == json!(true) => {
                *counted.lock().unwrap() += 1;
                ("error".into(), json!({"type": "invalidArguments"}))
            }
            "Email/get" => (
                method.into(),
                json!({"state": "email-state-2", "list": [{"id": "in-1", "subject": "Lunch", "mailboxIds": {"mb-inbox": true}, "from": [{"email": "a@example.com", "name": "Sam"}]}]}),
            ),
            "Mailbox/get" => (method.into(), json!({"state": "m", "list": []})),
            other => unchanged(other),
        })
        .await;
        let state = ready(&database, &fake, true).await;
        let result = sync_for_user(&state, OWNER, "acct-1").await.unwrap();
        assert_eq!(*full_fetches.lock().unwrap(), 1);
        assert_eq!(result.email.created, ["in-1"]);
        assert_eq!(result.email.records.len(), 1);
        assert_eq!(
            (
                result.email.records[0]["id"].clone(),
                result.email.records[0]["subject"].clone()
            ),
            (json!("in-1"), json!("Lunch"))
        );
    }

    fn initial(method: &str, arguments: &Value) -> (String, Value) {
        match method {
            "Mailbox/get" => (
                method.into(),
                json!({"state": "mailbox-state-1", "list": []}),
            ),
            "Thread/get" => (
                method.into(),
                json!({"state": "thread-state-1", "list": []}),
            ),
            "Email/query" => (method.into(), json!({"ids": ["email-1"]})),
            "Email/get" if arguments["ids"].as_array().is_some_and(Vec::is_empty) => {
                (method.into(), json!({"state": "email-state-1", "list": []}))
            }
            "Email/get" => (
                method.into(),
                json!({"state": "email-state-1", "list": [{"id": "email-1", "subject": "Google invite", "bodyValues": {"calendar": {"value": "BEGIN:VCALENDAR"}}}]}),
            ),
            other => unchanged(other),
        }
    }

    #[tokio::test]
    async fn imports_recent_invites_on_the_initial_sync() {
        let database = ScratchDatabase::create().await;
        let fake = stalwart(initial).await;
        let state = ready(&database, &fake, false).await;
        let result = sync_for_user(&state, OWNER, "acct-1").await.unwrap();
        assert!(result.initialized);
        assert_eq!(
            (
                result.calendar_import.messages_scanned,
                result.calendar_import.ics_parts_found
            ),
            (1, 1),
            "the recent invite went through ingestion"
        );
        let stored: (String, String, Option<String>) = {
            let row = state
                .db
                .query_one_raw(sea_orm::Statement::from_string(
                    state.db.get_database_backend(),
                    "SELECT email_state, mailbox_state, thread_state FROM mail_jmap_sync_state WHERE directory_entry_id = 'entry-1'",
                ))
                .await
                .unwrap()
                .unwrap();
            (
                row.try_get("", "email_state").unwrap(),
                row.try_get("", "mailbox_state").unwrap(),
                row.try_get("", "thread_state").unwrap(),
            )
        };
        assert_eq!(
            stored,
            (
                "email-state-1".into(),
                "mailbox-state-1".into(),
                Some("thread-state-1".into())
            )
        );
    }

    #[tokio::test]
    async fn receipt_polling_syncs_every_linked_account() {
        let database = ScratchDatabase::create().await;
        let fake = stalwart(|method, _| match method {
            "Email/changes" => (
                method.into(),
                json!({"oldState": "email-state-1", "newState": "email-state-2", "hasMoreChanges": false, "created": ["email-1"], "updated": [], "destroyed": []}),
            ),
            "Email/get" => (
                method.into(),
                json!({"state": "email-state-2", "list": [{"id": "email-1", "subject": "Invite", "bodyValues": {"calendar": {"value": "BEGIN:VCALENDAR"}}}]}),
            ),
            other => (
                other.into(),
                json!({"oldState": format!("{other}-state-1"), "newState": format!("{other}-state-2"), "hasMoreChanges": false, "created": [], "updated": [], "destroyed": []}),
            ),
        })
        .await;
        let state = ready(&database, &fake, true).await;
        let results = sync_known_changed_accounts(&state).await.unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(
            (
                results[0].account_id.as_str(),
                results[0].user_id.as_str(),
                results[0].changed_types.as_slice()
            ),
            ("acct-1", OWNER, &["Email".to_owned()][..])
        );
        assert_eq!(results[0].sync.calendar_import.messages_scanned, 1);
    }

    #[tokio::test]
    async fn subject_search_returns_message_ids() {
        let database = ScratchDatabase::create().await;
        let properties = Arc::new(StdMutex::new(Vec::new()));
        let requested = properties.clone();
        let fake = stalwart(move |method, arguments| match method {
            "Email/query" => (method.into(), json!({"ids": ["gc5aaabq4", "gc6aaabq5"]})),
            "Email/get" if arguments["ids"] == json!(["1561"]) => (method.into(), json!({"list": []})),
            "Email/get" => {
                requested.lock().unwrap().push(arguments["properties"].clone());
                (
                    method.into(),
                    json!({"list": [
                        {"id": "gc5aaabq4", "subject": "Something else", "messageId": ["<x@example.com>"]},
                        {"id": "gc6aaabq5", "subject": "Event reminder in 15 minutes", "messageId": ["solace-reminder.ee@solace.onl"]},
                    ]}),
                )
            }
            other => (other.into(), json!({})),
        })
        .await;
        let state = ready(&database, &fake, false).await;
        let lookup = IngestLookup {
            document_id: "1561",
            subject: Some("Event reminder in 15 minutes"),
            message_id: None,
            from_email: None,
        };
        let found = resolve_ingested_email(&state, "acct-1", &lookup)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            (
                found.id.as_str(),
                found.message_ids.as_slice(),
                found.from_email,
                found.exact_match
            ),
            (
                "gc6aaabq5",
                &["solace-reminder.ee@solace.onl".to_owned()][..],
                None,
                false
            )
        );
        let requested = properties.lock().unwrap();
        assert_eq!(requested.len(), 1);
        assert!(
            requested[0]
                .as_array()
                .unwrap()
                .contains(&json!("messageId"))
        );
    }

    #[tokio::test]
    async fn missing_message_ids_are_an_empty_list() {
        let database = ScratchDatabase::create().await;
        let fake =
            stalwart(|method, _| (method.into(), json!({"list": [{"id": "gc7aaabq6"}]}))).await;
        let state = ready(&database, &fake, false).await;
        let lookup = IngestLookup {
            document_id: "1562",
            subject: None,
            message_id: None,
            from_email: None,
        };
        let found = resolve_ingested_email(&state, "acct-1", &lookup)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            (
                found.id.as_str(),
                found.message_ids.len(),
                found.from_email,
                found.exact_match
            ),
            ("gc7aaabq6", 0, None, true)
        );
    }
}
